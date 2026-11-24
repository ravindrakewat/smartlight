# Database migrations

All migrations live in `packages/db/prisma/migrations` and are applied with
`npm run migrate:deploy -w @smart-light/db` against the database in `DATABASE_URL`.
Every migration below is **additive**: no table, column or row is dropped, renamed or rewritten.

| Migration | Adds | Local dev DB (localhost:5433) | Render production DB |
| --- | --- | --- | --- |
| `20261121225859_init` | Base schema | Applied | Applied |
| `20261122230622_iot_control`, `20261122230943_iot_event_seq` | Readings, events, commands, schedules | Applied | Applied |
| `20261124223017_admin_two_factor` | `users.totpEnabledAt`, `users.totpLastStep`; `mfa_challenges`, `mfa_recovery_codes` | Applied 2026-11-25 | **Not applied** (awaits approval) |
| `20261124230247_iot_foundation_geography_devices` | See below | Applied 2026-11-25 | **Not applied** (awaits approval) |

Local backup taken before the IoT foundation migration (stopped server, copied data directory):
`C:\Users\HP\SmartLight-db-backups\pgdata-before-phase2-20261125-043123`.

## `iot_foundation_geography_devices`

| Object | Change | Why |
| --- | --- | --- |
| `wards`, `streets` | New tables (tenant, optional zone/ward, name, Hindi name) | Ward and street as records instead of free text |
| `poles` | New nullable `wardId`, `streetId` (FK, ON DELETE SET NULL) | Link poles to wards/streets; the legacy `ward` text column is kept unchanged |
| `devices` | New `hardwareVersion`, `installStatus` (default `INSTALLED`), `isSimulated` (default `false`) | Device registry; simulator devices are never shown as hardware |
| `device_interfaces` | New table: one row per link (`WIFI`, `CELLULAR`, `LORAWAN`) with identifier (MAC / IMEI / DevEUI), priority, last seen, RSSI, SNR | Wi-Fi, 4G and LoRaWAN without redesigning; LoRaWAN is an additional link |
| `lorawan_devices` | New table: DevEUI (unique), JoinEUI, encrypted AppKey, device profile, MAC version, region `IN865`, OTAA, class, join status, last frame counter, `isSimulated` | OTAA registration; the AppKey is never returned by the API |
| `gateways` | New table: gateway EUI (unique), name, manufacturer, model, backhaul, location, online, last seen, `isSimulated` | Model-independent gateway registry |
| `lorawan_uplinks` | New table keyed by the network server's `deduplicationId` (unique) | Idempotent uplink processing and radio metadata history |
| `device_readings` | New nullable `snrDb`, `via` (`wifi` / `cellular` / `lorawan`) | Which link carried a reading |
| `device_commands` | New `appliedAt`, `channel` (default `mqtt`), `downlinkId` | Separate "acknowledged" from "applied"; LoRaWAN downlink reference |

Existing rows: new columns are null or take the defaults above. Existing controllers get
`installStatus = INSTALLED`, `isSimulated = false` until the mapping step below marks demo ones.

### Command states

The existing `DeviceCommandStatus` enum is kept (no enum rewrite). It maps to the required states:

| Required | Stored as | Meaning |
| --- | --- | --- |
| QUEUED | `PENDING` | Written by the API, not yet handed to the broker / network server |
| SENT | `SENT` | Published to MQTT, or enqueued as a LoRaWAN downlink |
| ACKNOWLEDGED | `ACCEPTED` (+ `ackAt`) | The device confirmed receipt |
| APPLIED | `COMPLETED` (+ `appliedAt`) | The device reported the change as applied |
| FAILED | `FAILED` / `REJECTED` | The device refused it or could not apply it |
| EXPIRED | `EXPIRED` | No acknowledgement before `expiresAt` |

A lamp is shown ON only from the device's own telemetry, never from a command state.

## Data mapping: wards

`npm run map:wards -w @smart-light/db` (dry run) / `-- --apply`:

- groups poles by their free-text `ward` per municipality; "Ward 36", "ward no. 36", "W-36" all
  become ward code `36`; other text is kept as its own code;
- creates the missing `wards` rows and fills `poles.wardId` only where it is empty;
- never changes `poles.ward`; re-running changes nothing.

`--mark-demo-simulated` also sets `devices.isSimulated = true` for controllers on `DEMO-*` zone
poles. Seed and demo scripts now create controllers with `isSimulated = true`.

Local result (2026-11-25): 38 wards created, 264 poles linked, 171 demo controllers marked;
a second run reported 0 / 0 / 0. The 49 seed controllers created before this change keep
`isSimulated = false` in the local database (seed data only; production has none).

## Rollback

Code rollback alone is enough: older code ignores the new columns and tables. To remove the
schema as well (after reverting the code, with a backup):

```sql
BEGIN;
DROP TABLE IF EXISTS "lorawan_uplinks", "lorawan_devices", "device_interfaces", "gateways";
ALTER TABLE "poles" DROP COLUMN IF EXISTS "wardId", DROP COLUMN IF EXISTS "streetId";
DROP TABLE IF EXISTS "streets", "wards";
ALTER TABLE "devices" DROP COLUMN IF EXISTS "hardwareVersion", DROP COLUMN IF EXISTS "installStatus", DROP COLUMN IF EXISTS "isSimulated";
ALTER TABLE "device_readings" DROP COLUMN IF EXISTS "snrDb", DROP COLUMN IF EXISTS "via";
ALTER TABLE "device_commands" DROP COLUMN IF EXISTS "appliedAt", DROP COLUMN IF EXISTS "channel", DROP COLUMN IF EXISTS "downlinkId";
DROP TYPE IF EXISTS "DeviceInstallStatus", "CommInterfaceKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124230247_iot_foundation_geography_devices';
COMMIT;
```

The two-factor migration's rollback is in `docs/security/phase1-two-factor.md`.

Local restore of the backup: stop `npm run db:dev`, replace `packages/db/.pgdata` with the
backup folder, start `npm run db:dev` again.
