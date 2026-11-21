# MQTT Protocol v1 (Device ↔ Cloud)

Contract between the street light controllers (`firmware/street-light-controller`) and the
platform (future MQTT ingestion worker + `apps/api`).

**Source of truth:** [`packages/shared/src/iot`](../../packages/shared/src/iot) (Zod schemas).
The firmware mirrors it in
[`sl_protocol.h`](../../firmware/street-light-controller/main/include/sl_protocol.h).
Reference payloads live in
[`packages/shared/test/fixtures/iot`](../../packages/shared/test/fixtures/iot) and are validated
by the shared test suite.

## Topics

```text
sl/v1/{tenantId}/{deviceId}/{channel}
```

| Channel     | Direction      | QoS | Retained | Purpose                                         |
| ----------- | -------------- | --- | -------- | ----------------------------------------------- |
| `telemetry` | device → cloud | 0   | no       | Periodic readings (default every 300 s)         |
| `status`    | device → cloud | 1   | yes      | `online: true` on connect; `false` = Last Will  |
| `event`     | device → cloud | 1   | no       | Faults, fault cleared, boot                     |
| `cmd`       | cloud → device | 1   | no       | Control commands                                |
| `cmd/ack`   | device → cloud | 1   | no       | Command acknowledgement (`accepted`/`rejected`) |

- `tenantId` / `deviceId`: `^[a-z0-9][a-z0-9-]{1,62}$` (e.g. `indore-mc`, `sl-000123`).
- **Broker ACL (mandatory):** each device credential may only publish/subscribe inside its own
  `sl/v1/{tenantId}/{deviceId}/#`. Client ID and username = `deviceId`.
- **Transport:** MQTT over TLS (`mqtts://`, port 8883) only. Firmware refuses plain `mqtt://`
  unless built with the bench-testing option.

## Common fields

| Field | Meaning                                                                   |
| ----- | ------------------------------------------------------------------------- |
| `v`   | Schema version (`1`). Unknown versions are rejected.                      |
| `ts`  | Device time, Unix seconds (UTC). `0` = clock not yet synced via SNTP.     |
| `seq` | Per-boot counter shared by telemetry and events; detects gaps/duplicates. |

## Operating modes

Priority, highest first:

1. **`manual`** – operator override (`set_output`) until its duration elapses.
2. **`auto`** – the downloaded daily schedule (needs a synced clock).
3. **`failsafe`** – no schedule or no clock: LDR decides (dark → ON at 100 %).

Lighting never depends on connectivity. If the LDR is unavailable the lamp fails **ON**.

## Commands

All commands carry `v`, `cmdId` (UUID), `issuedAt`, `expiresAt`, `action`. The device:

- rejects commands whose `expiresAt` has passed (when its clock is valid);
- treats a repeated `cmdId` as already applied and re-sends `accepted` (QoS 1 redelivery);
- always answers on `cmd/ack` when `cmdId` is readable.

| `action`       | Fields                                                      | Notes                                            |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `set_output`   | `on`, `dimPercent`, `overrideUntil`                         | Duration = `overrideUntil - issuedAt`, max 7 d   |
| `set_auto`     | –                                                           | Ends a manual override                           |
| `set_schedule` | `scheduleId`, `utcOffsetMinutes` (IST = 330), `steps[1-12]` | Step = `{ atMinute, on, dimPercent }`, persisted |
| `set_config`   | `telemetryIntervalSec` (30–3600), `motionBoostPercent`      | Persisted                                        |
| `reboot`       | –                                                           | Acknowledged, then restarts after 3 s            |
| `ota_update`   | `firmwareVersion`, `url` (HTTPS), `sha256`                  | Contract defined; firmware support pending       |

Schedule steps may arrive in any order. The active step is the latest one at or before the
current local minute, wrapping to the last step of the previous day.

## Fault events

| `type`          | Condition (defaults, configurable in firmware Kconfig)       | Delay | Severity |
| --------------- | ------------------------------------------------------------ | ----- | -------- |
| `lamp_failure`  | Relay ON, mains present, current < 50 mA                     | 30 s  | critical |
| `relay_stuck`   | Relay OFF, current ≥ 100 mA                                  | 10 s  | critical |
| `over_current`  | Current ≥ 2 A                                                | 5 s   | critical |
| `over_voltage`  | Voltage ≥ 270 V                                              | 10 s  | warning  |
| `under_voltage` | 50 V < voltage < 180 V                                       | 10 s  | warning  |
| `fault_cleared` | Condition gone; `clears` names the fault                     | –     | info     |
| `boot`          | First broker connection after boot; `message` = reset reason | –     | info     |

`day_burning` and `sensor_fault` are part of the contract and will be derived server-side
(schedule + lux) or added to firmware in a later phase.
