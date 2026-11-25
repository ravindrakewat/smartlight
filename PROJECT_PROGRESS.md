# Project progress

Last updated: 2026-11-25 (after LoRaWAN registry API). Read this first when resuming. Nothing below is deployed to
production unless it says so.

## Branches (local only, not pushed)

| Branch | Based on | Contents | Status |
| --- | --- | --- | --- |
| `main` | — | Everything deployed so far (Render API, three Vercel apps) | Live |
| `feat/phase1-admin-2fa` | `main` | Admin two-factor sign-in, sessions, rate-limit tests | Done, tested locally; **awaiting approval to deploy** |
| `feat/phase2-iot-foundation` | `feat/phase1-admin-2fa` | Database foundation, LoRaWAN integration (simulator) | In progress |

Do not push or merge either branch without the owner's approval.

## Hardware status

| Item | Status |
| --- | --- |
| ESP32-S3 controller board | Bench only; never connected to a pole |
| A7670C 4G | Planned; firmware driver not written |
| RAK3172 LoRaWAN module | **Ordered, not received**; exact variant and firmware unknown |
| LoRaWAN gateway | **Ordered, not received**; model unknown |

No physical radio test (OTAA join, uplink, downlink) has happened. Everything LoRaWAN below
is simulator-based and labelled as such.

## Done

### Phase 1 — admin security (`feat/phase1-admin-2fa`)
- TOTP two-factor: required for SUPER_ADMIN, optional for MUNICIPAL_ADMIN; recovery codes;
  sessions list / revoke; admin reset; emergency reset script.
- Rate limiting verified on the running dev API: 20 failed logins → 401, 21st → 429;
  `/auth/login/mfa` shares the limit; OTP has its own limit. Automated test added
  (`apps/api/test/rate-limit.test.ts`).
- Docs: `docs/security/phase1-two-factor.md` (deploy and rollback).

### Phase 2 — database foundation (`feat/phase2-iot-foundation`)
- Migration `20261124230247_iot_foundation_geography_devices` (additive), applied to the
  **local dev DB only**, after a local backup. Details and rollback: `docs/DATABASE_MIGRATIONS.md`.
- Ward mapping script `npm run map:wards` (dry run default); run locally: 38 wards, 264 poles.
- Seed and demo controllers are created with `isSimulated = true`.
- Second additive migration `20261125000500_lorawan_downlink_tx_and_key_fingerprint`
  (`device_commands.transmittedAt`, unique `lorawan_devices.appKeyFingerprint`), local only.

### Phase 3 — LoRaWAN integration, simulator-tested (`feat/phase2-iot-foundation`)
- Compact frames for the RAK3172 link (`packages/shared/src/iot/lorawan.ts`, mirrored in
  `sl_protocol.h`, documented in `docs/iot/mqtt-protocol.md`).
- ChirpStack v4 event processing (`apps/api/src/modules/lorawan/`): up, join, ack, txack;
  idempotent by deduplication id; DevEUI → controller; RSSI/SNR, gateway last seen;
  decoded frames go through the existing ingest pipeline (readings, faults, work orders).
- Downlinks: `chooseChannel` picks LoRaWAN only when preferred and the command fits;
  ChirpStack bridge in the worker (`apps/api/src/iot/chirpstack-bridge.ts`), on when
  `CHIRPSTACK_MQTT_URL` is set. States kept apart: enqueued, transmitted, received, applied.
- Registry API: `/v1/lorawan/devices`, `/v1/gateways` (admins register; AppKey sealed with
  `DEVICE_SECRET_KEY`, never returned, unique per device).
- Staging stack files `infra/lorawan/` (ChirpStack v4, gateway bridge IN865, Mosquitto
  TLS + ACL): **written, never started** (no Docker on this PC).

What is NOT done for LoRaWAN: no real OTAA join, no radio frame, no gateway, no ChirpStack
instance, no RAK3172 firmware driver, no automatic device creation in ChirpStack (devices
must also be added in the ChirpStack UI), no dashboard screens yet.

## Test baseline (local)

| Suite | Result (2026-11-25) |
| --- | --- |
| API (`npm run test -w @smart-light/api`) | 110 passed (71 original + 19 security + 5 TOTP + 2 rate limit + 8 LoRaWAN + 4 registry API + 1 bridge end-to-end) |
| Shared (`npm run test -w @smart-light/shared`) | 23 passed (17 + 6 LoRaWAN codec) |
| Typecheck, lint, i18n | Clean |

## Next tasks (in order)

1. Municipal console: Gateways and LoRaWAN devices screens (list, register, join status,
   last uplink, RSSI/SNR, simulator badge) using `/v1/gateways` and `/v1/lorawan/devices`.
2. Simulator script that publishes ChirpStack-format events to the local dev broker
   (`npm run dev:broker -w @smart-light/api`) so the console shows simulated LoRaWAN traffic.
3. Dashboard: gateway online/offline counts, LoRaWAN link status; command history showing
   enqueued / transmitted / received / applied.
4. Optional ChirpStack gRPC/REST client to create devices on the network server from the
   console (needs a running ChirpStack to test).
5. When hardware arrives: follow `infra/lorawan/README.md` (physical test plan).

## Resume commands

```bash
git status && git branch --show-current     # expect feat/phase2-iot-foundation
npm run db:dev                              # local Postgres on 5433 (UTC sessions)
npm run dev:api                             # API on 4000
npm run test -w @smart-light/api
```

Open decisions: `PENDING_DECISIONS.md`.
