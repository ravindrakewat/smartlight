# Smart Street Light Management System

Enterprise-grade, multi-tenant SaaS monorepo for managing municipal smart street lighting infrastructure, IoT telemetry, maintenance operations, and citizen issue reporting.

> **Current Stage:** Phase 0 — Monorepo Foundation. Business modules, authentication, database schemas, and IoT ingestion will be implemented in subsequent phases.

---

## Architecture Overview

| Workspace              | Package                        | Stack                                   | Port (Dev) |
| ---------------------- | ------------------------------ | --------------------------------------- | ---------- |
| `apps/citizen-web`     | `@smart-light/citizen-web`     | Next.js (App Router), React, TypeScript | `3000`     |
| `apps/municipal-admin` | `@smart-light/municipal-admin` | Next.js (App Router), React, TypeScript | `3001`     |
| `apps/super-admin`     | `@smart-light/super-admin`     | Next.js (App Router), React, TypeScript | `3002`     |
| `apps/mobile`          | `@smart-light/mobile`          | React Native, Expo, TypeScript          | Expo Metro |
| `apps/api`             | `@smart-light/api`             | Node.js, Express.js, TypeScript, Zod    | `4000`     |
| `packages/shared`      | `@smart-light/shared`          | TypeScript, Zod                         | —          |
| `packages/ui`          | `@smart-light/ui`              | React, TypeScript (Web-only)            | —          |
| `packages/config`      | `@smart-light/config`          | TSConfig, ESLint, Prettier presets      | —          |

All business logic and API endpoints live exclusively in `apps/api`. Next.js apps do not define duplicate backend APIs.

---

## Prerequisites

- **Node.js**: `>= 20.18.0` (tested on Node 22 LTS)
- **npm**: `>= 10.0.0`

---

## Getting Started

1. **Install dependencies** from the repository root:

   ```bash
   npm install
   ```

2. **Build shared packages** (required before starting `apps/api` for the first time):

   ```bash
   npm run build:packages
   ```

3. **Configure environment variables**:
   Copy each app's `.env.example` to `.env` (or `.env.local` for Next.js) as needed. Never commit `.env` files.

   - `apps/api/.env.example` → `apps/api/.env`
   - `apps/citizen-web/.env.example` → `apps/citizen-web/.env.local`
   - `apps/municipal-admin/.env.example` → `apps/municipal-admin/.env.local`
   - `apps/super-admin/.env.example` → `apps/super-admin/.env.local`
   - `apps/mobile/.env.example` → `apps/mobile/.env`

---

## Workspace Commands

### Run Applications Independently

```bash
npm run dev:api              # Express API on http://localhost:4000
npm run dev:citizen          # Citizen Web on http://localhost:3000
npm run dev:municipal        # Municipal Admin on http://localhost:3001
npm run dev:super-admin      # Super Admin on http://localhost:3002
npm run dev:mobile           # Expo dev server for React Native app
```

### Quality & Verification

```bash
npm run typecheck            # TypeScript check across all apps and packages
npm run lint                 # ESLint check across all apps and packages
npm run format               # Format repository with Prettier
npm run format:check         # Verify Prettier formatting
npm run build                # Build shared packages, API, and all 3 Next.js apps
```

### Health Check

When `apps/api` is running:

```bash
curl http://localhost:4000/api/health
```

---

## Environment Variables by Application

| Application            | File                                | Variables                                                                   |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `apps/api`             | `apps/api/.env.example`             | `NODE_ENV`, `PORT`, `API_HOST`, `LOG_LEVEL`, `CORS_ORIGINS`, `SERVICE_NAME` |
| `apps/citizen-web`     | `apps/citizen-web/.env.example`     | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`                          |
| `apps/municipal-admin` | `apps/municipal-admin/.env.example` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`                          |
| `apps/super-admin`     | `apps/super-admin/.env.example`     | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`                          |
| `apps/mobile`          | `apps/mobile/.env.example`          | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_NAME`                          |

Future phases will add database (`DATABASE_URL`), Redis (`REDIS_URL`), MQTT (`MQTT_BROKER_URL`), S3 storage, and auth secret variables exclusively to `apps/api` and worker services.

---

## Documentation

- [AGENTS.md](./AGENTS.md) — Contributor & AI agent engineering rules
- [System Overview](./docs/architecture/system-overview.md)
- [Monorepo Structure](./docs/architecture/monorepo-structure.md)
- [Deployment Architecture](./docs/architecture/deployment-architecture.md)
- [Technology Decisions](./docs/architecture/technology-decisions.md)
