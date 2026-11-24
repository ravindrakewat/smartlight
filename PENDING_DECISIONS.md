# Pending decisions

Decisions only the owner can make. Work that does not depend on them continues; the code is kept
configurable so no option is locked in.

| # | Decision | Needed before | Current default in code | Notes |
| --- | --- | --- | --- | --- |
| 1 | Approve Phase 1 (admin two-factor) for production | Deploying `feat/phase1-admin-2fa` | Not deployed | Steps: `docs/security/phase1-two-factor.md` |
| 2 | Where to run ChirpStack v4 + Mosquitto (staging, then production): India-region VPS, or another host | First real gateway test | Docker Compose files in `infra/lorawan/`, not running anywhere | Render cannot host UDP / long-lived MQTT; this PC has no Docker |
| 3 | Gateway model and backhaul (Ethernet / Wi-Fi / 4G); Semtech UDP packet forwarder or LoRa Basics Station | Gateway configuration | Compose includes the UDP Gateway Bridge for IN865 | Decide after the ordered gateway arrives and is inspected |
| 4 | LoRaWAN device class for the controllers (A or C) | First device profile | `A` (field `lorawan_devices.deviceClass`) | Class C allows faster downlinks on mains-powered poles; must match RAK3172 firmware support |
| 5 | Which link carries commands when a controller has 4G and LoRaWAN | Multi-link pilots | Lowest `device_interfaces.priority` that is online | Schedules and safety stay local on the controller either way |
| 6 | Photo storage provider and region | Repair photos | None | India region preferred |
| 7 | Production hosting region (Render Singapore today) | Go-live | Unchanged | Government data may need India-region hosting |
| 8 | Run the ward mapping and demo-simulated marking on production | After approval of #1-style review | Run on local dev only | `npm run map:wards -w @smart-light/db` (dry run first) |
| 9 | Remove the 23 November demo data from production | Go-live | Untouched | `demo:clear:render` exists; needs explicit approval |
| 10 | Rotate the Render database password (was pasted in chat) | As soon as possible | Owner action | Not done by the assistant (production secret) |

Hardware choices already fixed by the owner (do not change without a written comparison and
approval): ESP32-S3, A7670C 4G, Wi-Fi, HLK-LD2451, RV-3028, ZMCT103C, ZMPT101B, sun times on
the device; BH1750 optional; RAK3172 added as an extra LoRaWAN link (ordered, not received).
