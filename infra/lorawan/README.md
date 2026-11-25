# LoRaWAN staging: ChirpStack v4 + Mosquitto (IN865)

**Status: files written, never started.** The development PC has no Docker, the RAK3172 and the
gateway are ordered but not received. Everything here must be validated on a staging host before
anyone relies on it. Nothing in this folder touches production.

## What runs

```
RAK3172 (on the ESP32-S3 controller) ──radio IN865──► Gateway (model TBD)
   ──UDP 1700 (Semtech packet forwarder)──► chirpstack-gateway-bridge-in865
   ──MQTT in865/gateway/#──► mosquitto ◄──► chirpstack (network + application server)
   ──MQTT application/{app}/device/{devEui}/event/*──► Smart Street Light IoT worker
   ◄── application/{app}/device/{devEui}/command/down (downlinks)
```

| Service | Image | Port | Notes |
| --- | --- | --- | --- |
| chirpstack | `chirpstack/chirpstack:4` | 127.0.0.1:8080 | UI + gRPC API; reach via SSH tunnel or TLS proxy |
| chirpstack-gateway-bridge-in865 | `chirpstack/chirpstack-gateway-bridge:4` | 1700/udp | Firewall the gateway's IP |
| mosquitto | `eclipse-mosquitto:2` | 8883 (TLS) | 1883 stays inside the Docker network |
| postgres | `postgres:16-alpine` | — | ChirpStack's own database (not the platform's) |
| redis | `redis:7-alpine` | — | ChirpStack device sessions |

The platform keeps its own PostgreSQL; ChirpStack's database is separate.

## Start on a staging host

1. `cp .env.example .env` and fill every value with `openssl rand -base64 32`.
2. Create MQTT users: `mosquitto_passwd -c configuration/mosquitto/passwd chirpstack`, then
   `gateway-bridge` and `sl-worker` (same file, without `-c`). Use the `.env` passwords for the
   first two.
3. Put a CA, server certificate and key in `certs/` (`ca.crt`, `server.crt`, `server.key`).
4. Compare `configuration/chirpstack/region_in865.toml` with the region file of the ChirpStack
   release you run, and with the gateway's channel plan.
5. `docker compose up -d`, then `docker compose logs -f chirpstack`.
6. In the ChirpStack UI (tunnel to 8080): change the default admin password, create a tenant,
   an application, and a device profile: region IN865, MAC version as the RAK3172 firmware
   supports (RAK default is 1.0.3), OTAA, class as decided (PENDING_DECISIONS #4). Note the
   application id.
7. Platform worker settings: `CHIRPSTACK_MQTT_URL=mqtts://<host>:8883`,
   `CHIRPSTACK_MQTT_USERNAME=sl-worker`, `CHIRPSTACK_MQTT_PASSWORD`, `CHIRPSTACK_APPLICATION_ID`.

Backup: `docker compose exec postgres pg_dump -U postgres chirpstack > chirpstack.sql` daily;
restore with `psql`. Rollback: `docker compose down` (volumes keep data); remove the worker's
`CHIRPSTACK_*` settings to switch the bridge off.

## When the hardware arrives (do not skip)

Inspect first: exact RAK3172 variant and firmware (`AT+VER=?`), supported AT commands, UART
voltage (3.3 V), antenna connector and an 865–867 MHz antenna, gateway make/model, IN865
support, packet forwarder vs Basics Station, backhaul. Check Indian equipment and RF rules
for the band before outdoor use.

Then, on the bench, one step at a time, recording each result as **physical**:

1. Gateway configured and shown online in ChirpStack.
2. Test device registered with its own DevEUI / JoinEUI / AppKey (never shared).
3. Real OTAA JoinRequest and JoinAccept seen in the ChirpStack device events.
4. Real uplink received; payload decodes (platform `lorawan_uplinks.result = ok`).
5. Real RSSI / SNR recorded.
6. One controlled confirmed downlink; txack, ack, then the controller's port-30 acknowledgement.
7. Lamp state checked against the controller's own telemetry (current sensor), not the command.

No connection to municipal poles without written approval.

## What is verified today

Only the platform side, against simulated ChirpStack events: decoding, deduplication, DevEUI
mapping, command states (`apps/api/test/lorawan.test.ts`, `packages/shared/test/lorawan.test.ts`).
