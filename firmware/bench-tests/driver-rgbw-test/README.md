# Driver + RGBW bench test (Arduino / PlatformIO)

Not production firmware. Production code: [`../../street-light-controller`](../../street-light-controller).

## Phone control (no router needed)

Join Wi-Fi `SmartLight-RGBW` (password `test12345`) and open http://192.168.4.1.

## MQTT (protocol v1, plain MQTT to the dev broker)

1. Copy `src/secrets.example.h` to `src/secrets.h` and set your 2.4 GHz Wi-Fi, the PC's IPv4
   address (`ipconfig`), tenant and device id. `secrets.h` is git-ignored.
2. Start the broker (repo root): `npm run dev:broker -w @smart-light/api`. Allow Node through
   Windows Firewall on private networks (port 1883).
3. Flash the board, open the serial monitor (115200).
4. Send commands from the PC (repo root):

   ```bash
   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs watch
   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs on 60
   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs off
   node firmware/bench-tests/driver-rgbw-test/tools/mqtt-bench.mjs auto
   ```

5. Optional, control from the municipal console: set `MQTT_URL=mqtt://localhost:1883` in
   `apps/api/.env`, run `npm run dev:worker -w @smart-light/api` next to `npm run dev`, and open
   the pole whose controller is `DEVICE_ID`. Do not run the simulator for the same device id.

## Cloud broker (Render worker + Vercel consoles)

1. Broker with TLS on 8883 (EMQX Cloud Serverless, or an own VPS with a Let's Encrypt
   certificate). Create two users: `sl-backend-worker` (for the Render worker) and one per
   device, username = device id. Restrict each device to `sl/v1/<tenant>/<device>/#`.
2. Render background worker `smart-light-iot-worker` (see `infra/deployment/render.yaml`):
   `MQTT_URL=mqtts://<host>:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD`, plus the same
   `DATABASE_URL` (internal), `JWT_ACCESS_SECRET` and `MFA_ENCRYPTION_KEY` as the API.
3. `src/secrets.h`: use "Option B" from `secrets.example.h` (`MQTT_TLS 1`, host, user, password)
   and a `DEVICE_ID` that exists on a pole in the production database. The pole page in the
   municipal console shows it ("Controller sl-…"); demo data uses `sl-indore-mc-<pole number>`.
4. With TLS the board waits for internet time (SNTP) before connecting: certificates have
   validity dates. Trusted roots: `src/mqtt_ca.h` (DigiCert Global Root G2 and Global Root CA
   for EMQX Cloud,
   ISRG Root X1 for Let's Encrypt). A broker signed by another CA needs its root added there.

Supported commands: `set_output`, `set_auto`, `set_config`, `reboot`. `set_schedule` and
`ota_update` are rejected (no schedule on the bench: "auto" = fail-safe ON 100 %). Telemetry
every 30 s with electrical readings 0 (no sensors fitted).
