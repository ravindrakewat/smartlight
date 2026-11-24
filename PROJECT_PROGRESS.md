# Project progress

Last updated: 2026-11-25. Read this first when resuming. Nothing below is deployed to
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

## Test baseline (local)

| Suite | Result (2026-11-25) |
| --- | --- |
| API (`npm run test -w @smart-light/api`) | 97 passed (71 original + 19 security + 5 TOTP + 2 rate limit) |
| Shared (`npm run test -w @smart-light/shared`) | 17 passed |
| Typecheck, lint, i18n | Clean |

## In progress / next

1. LoRaWAN integration in the API (simulator first): ChirpStack v4 event adapter, compact
   payload codec, DevEUI mapping, idempotent uplinks, gateway status, downlink queue.
2. ChirpStack v4 + Mosquitto staging files and docs (`infra/lorawan/`); cannot be run on this
   PC (no Docker).
3. Gateway and LoRaWAN device screens in the municipal console.

## Resume commands

```bash
git status && git branch --show-current     # expect feat/phase2-iot-foundation
npm run db:dev                              # local Postgres on 5433 (UTC sessions)
npm run dev:api                             # API on 4000
npm run test -w @smart-light/api
```

Open decisions: `PENDING_DECISIONS.md`.
