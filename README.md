# Smart Street Light Management System

Multi-tenant platform for municipal corporations to monitor street lights, run repairs with a
24-hour SLA, and let citizens report faults by scanning the QR code on a pole. Built for
government deployment (Hindi + English, GIGW 3.0 / WCAG 2.1 AA, append-only audit trail).

## What is in the box

| Workspace              | What it is                                                                 | Dev port |
| ---------------------- | -------------------------------------------------------------------------- | -------- |
| `apps/api`             | Central REST API (Express 5, Prisma 7, PostgreSQL). Swagger at `/api/docs` | `4000`   |
| `apps/citizen-web`     | Citizen portal: QR pole page, complaint with SMS OTP, tracking (Next.js)   | `3000`   |
| `apps/municipal-admin` | Control centre: dashboard, work orders, poles (Next.js)                    | `3001`   |
| `apps/super-admin`     | Platform console: municipalities, health (Next.js)                         | `3002`   |
| `apps/mobile`          | Field technician app: jobs, GPS start/complete, QR scan (Expo)             | Metro    |
| `packages/db`          | Prisma schema, migrations, seed, local PostgreSQL                          | `5433`   |
| `packages/shared`      | Zod contracts, API client, pole codes, IoT MQTT contract                   | —        |
| `packages/ui`          | Web design system (Tailwind v4 tokens, accessible components)              | —        |
| `firmware/`            | ESP32-S3 street-light controller (ESP-IDF)                                 | —        |

Architecture and rules for contributors: [`AGENTS.md`](./AGENTS.md) · API guide:
[`docs/api`](./docs/api/README.md) · Device protocol: [`docs/iot/mqtt-protocol.md`](./docs/iot/mqtt-protocol.md)

## Run it locally (no Docker needed)

Requires Node.js ≥ 20.18 (22 LTS recommended).

```bash
npm install
npm run build:packages

# 1. Database — a real PostgreSQL 17 from npm; keep this terminal open
cp packages/db/.env.example packages/db/.env
npm run db:dev

# 2. In a second terminal: schema + demo data
npm run migrate:deploy -w @smart-light/db
npm run seed -w @smart-light/db

# 3. API (copy apps/api/.env.example to apps/api/.env and set JWT_ACCESS_SECRET first)
npm run dev:api            # http://localhost:4000/api/docs

# 4. Any of the apps
npm run dev:citizen        # http://localhost:3000
npm run dev:municipal      # http://localhost:3001
npm run dev:super-admin    # http://localhost:3002
npm run dev:mobile         # Expo; see apps/mobile/.env.example for the API URL on a phone
```

### Demo accounts (local seed only)

All seeded accounts use the password `SmartLight@2026`. The seed refuses to run in production.

| Role                        | Email                                | Use in                 |
| --------------------------- | ------------------------------------ | ---------------------- |
| Platform administrator      | `superadmin@smartlight.local`        | Super admin            |
| Municipal administrator     | `admin@indore.smartlight.local`      | Municipal console      |
| Supervisor (JE)             | `supervisor@indore.smartlight.local` | Municipal console, app |
| Technician (municipal)      | `tech1@indore.smartlight.local`      | Mobile app             |
| Technician (contractor)     | `tech2@prakash.smartlight.local`     | Mobile app             |
| Agency manager (contractor) | `manager@prakash.smartlight.local`   | Municipal console      |

Citizen OTP codes are printed in the API log in development (no SMS is sent).
Try the QR flow at <http://localhost:3000/p/IND-000002-6>.

## Quality gates (run in CI on every push)

```bash
npm run format:check   # Prettier
npm run typecheck      # all workspaces
npm run lint           # ESLint, zero warnings
npm run check:i18n     # every English string has a Hindi translation
npm run test           # API integration tests on a throwaway PostgreSQL + shared unit tests
npm run build          # packages, API and all web apps
npm run export -w @smart-light/mobile   # Android + iOS bundles
```

The firmware is compiled with ESP-IDF in a separate CI job.

## Deployment

- **API** → Render (`infra/deployment/render.yaml`; migrations run as the pre-deploy step).
  Production has no seed data: create the first platform administrator with
  `npm run bootstrap:admin:render -w @smart-light/db` (reads `RENDER_EXTERNAL_DATABASE_URL`
  from `apps/api/.env`; the password is typed hidden in the terminal).
- **Web apps** → three Vercel projects (root directories `apps/citizen-web`, `apps/municipal-admin`,
  `apps/super-admin`).
- **Mobile** → Expo Application Services (EAS Build).

Never commit `.env` files. Every app documents its variables in `.env.example`.
