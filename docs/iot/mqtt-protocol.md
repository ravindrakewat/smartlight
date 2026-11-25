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
2. **`auto`** – the downloaded daily schedule (needs a valid clock: RTC or network time).
3. **`failsafe`** – no schedule or no valid clock: the lamp stays **ON at 100 %**.

Day and night come from an **astronomical clock**: the controller computes today's sunrise and
sunset at the pole from its coordinates (sent with the schedule). There is no light sensor on
the pole. Daytime darkness (storms, smog, fog) is handled in the cloud as a zone override
(`set_output`). Lighting never depends on connectivity, and any doubt leaves the street lit.

## Commands

All commands carry `v`, `cmdId` (UUID), `issuedAt`, `expiresAt`, `action`. The device:

- rejects commands whose `expiresAt` has passed (when its clock is valid);
- treats a repeated `cmdId` as already applied and re-sends `accepted` (QoS 1 redelivery);
- always answers on `cmd/ack` when `cmdId` is readable.

| `action`       | Fields                                                                  | Notes                                          |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `set_output`   | `on`, `dimPercent`, `overrideUntil`                                     | Duration = `overrideUntil - issuedAt`, max 7 d |
| `set_auto`     | –                                                                       | Ends a manual override                         |
| `set_schedule` | `scheduleId`, `utcOffsetMinutes` (IST = 330), `location`, `steps[1-12]` | See below; persisted                           |
| `set_config`   | `telemetryIntervalSec` (30–3600), `motionBoostPercent`                  | Persisted                                      |
| `reboot`       | –                                                                       | Acknowledged, then restarts after 3 s          |
| `ota_update`   | `firmwareVersion`, `url` (HTTPS), `sha256`                              | Contract defined; firmware support pending     |

### Schedule steps

Each step is anchored to a fixed local time or to today's sunset/sunrise at the pole:

```json
{ "anchor": "sunset",  "offsetMinutes": 10,  "on": true,  "dimPercent": 100 }
{ "anchor": "clock",   "atMinute": 1380,     "on": true,  "dimPercent": 60 }
{ "anchor": "sunrise", "offsetMinutes": -10, "on": false, "dimPercent": 0 }
```

- `clock`: `atMinute` = minutes after local midnight (0–1439).
- `sunset` / `sunrise`: `offsetMinutes` from the event, −240…240.
- `location` (`{ latitude, longitude }`) is required when any step uses sunset/sunrise; the
  controller stores it with the schedule.
- `scheduleId` identifies one version of a schedule (`<uuid>@<version>`); the platform compares
  it with the id the controller last accepted to show whether the controller is up to date.

Each day the controller turns every step into a local minute, then applies the latest step at or
before the current minute, wrapping to the last step of the previous day.

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

`day_burning` and `sensor_fault` are part of the contract and will be derived server-side or
added to firmware in a later phase.

## Platform side

The IoT worker (`apps/api/src/worker.ts`) subscribes to `sl/v1/+/+/{telemetry,status,event,cmd/ack}`
with a backend credential, stores readings and events, opens a work order for `lamp_failure`,
`relay_stuck` and `over_current` (one per pole), verifies repairs from telemetry, and publishes
commands from the database outbox (`device_commands`). A controller that comes back online is
sent its current schedule if it does not have it.

## LoRaWAN link (RAK3172, ChirpStack v4)

A controller may also carry a RAK3172 LoRaWAN module as an **additional** link
(4G and Wi-Fi stay). LoRaWAN frames are too small for the JSON documents above, so
the controller sends compact binary frames; the backend decodes them into the same
v1 payloads. Source of truth: `packages/shared/src/iot/lorawan.ts`, mirrored in
`sl_protocol.h` (`SL_LW_*`).

| Port | Direction | Bytes | Content |
| --- | --- | --- | --- |
| 10 | up | 22 | Telemetry: flags (lamp, motion, dark, dark-known, mode), dim %, V x10, mA, W x10, Wh, board C (-128 = none), clock, uptime |
| 20 | up | 8 | Event: event code, severity, clock, cleared-event code |
| 30 | up | 18 | Command acknowledgement: command id (16 bytes), status |
| 40 | down | 28 / 22 | `set_output` (on, dim, override-until, expiry) / `set_auto` (expiry) |

Big-endian, byte 0 = version 1. Everything fits IN865 DR0 (51 bytes). Schedules and
configuration are not sent over LoRaWAN (too large); they use Wi-Fi / 4G.

ChirpStack topics (JSON marshaler): events on
`application/{applicationId}/device/{devEui}/event/{up,join,ack,txack}`; downlinks
published to `application/{applicationId}/device/{devEui}/command/down` with the
command id as the queue item id, confirmed, port 40.

**Status: simulator-tested only.** The RAK3172 and the gateway are ordered and not
yet received; no real OTAA join or radio frame has been tested. The firmware driver
is not written yet.

