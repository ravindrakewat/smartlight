# Deployment Architecture

This document describes how each application in the monorepo is prepared for independent deployment across **Vercel**, **Render**, and **Expo EAS**. No production credentials or live infrastructure are provisioned in Phase 0.

---

## 1. Deployment Topology

| Component                      | Workspace                      | Target Platform                | Build Strategy                                   |
| ------------------------------ | ------------------------------ | ------------------------------ | ------------------------------------------------ |
| Citizen Website                | `apps/citizen-web`             | **Vercel** (Project 1)         | Next.js monorepo build                           |
| Municipal Admin                | `apps/municipal-admin`         | **Vercel** (Project 2)         | Next.js monorepo build                           |
| Super Admin                    | `apps/super-admin`             | **Vercel** (Project 3)         | Next.js monorepo build                           |
| Central Backend API            | `apps/api`                     | **Render** (Web Service)       | Build `@smart-light/shared` + `@smart-light/api` |
| MQTT Ingestion Worker (future) | `apps/api` or dedicated worker | **Render** (Background Worker) | Node.js long-running worker                      |
| BullMQ Job Worker (future)     | `apps/api` or dedicated worker | **Render** (Background Worker) | Node.js long-running worker                      |
| Mobile App                     | `apps/mobile`                  | **Expo EAS Build**             | Native iOS & Android binaries                    |

---

## 2. Vercel Deployment (Frontend Web Applications)

Each Next.js application deploys as its own independent Vercel project connected to the same Git repository:

1. **Citizen Website**
   - **Root Directory**: `apps/citizen-web`
   - **Framework Preset**: Next.js
   - **Install Command**: `npm ci --prefix ../..` (or Vercel automatic npm workspace detection from repo root)
   - **Build Command**: `npm run build -w @smart-light/shared && npm run build -w @smart-light/citizen-web`
   - **Environment Variables**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`

2. **Municipal Admin**
   - **Root Directory**: `apps/municipal-admin`
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build -w @smart-light/shared && npm run build -w @smart-light/municipal-admin`
   - **Environment Variables**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`

3. **Super Admin**
   - **Root Directory**: `apps/super-admin`
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build -w @smart-light/shared && npm run build -w @smart-light/super-admin`
   - **Environment Variables**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_NAME`

### Independent Change Filtering (Vercel Ignored Build Step)

To avoid rebuilding unaffected apps on every commit, configure each Vercel project's **Ignored Build Step** to deploy only when its app directory or shared packages change:

- `citizen-web`: rebuild on changes to `apps/citizen-web`, `packages/shared`, `packages/ui`, `packages/config`, or root `package*.json`.
- `municipal-admin`: rebuild on changes to `apps/municipal-admin`, `packages/shared`, `packages/ui`, `packages/config`, or root `package*.json`.
- `super-admin`: rebuild on changes to `apps/super-admin`, `packages/shared`, `packages/ui`, `packages/config`, or root `package*.json`.

---

## 3. Render Deployment (Backend API & Future Workers)

A starter blueprint is maintained in [`infra/deployment/render.yaml`](../../infra/deployment/render.yaml).

### Central Backend API (`apps/api`)

- **Service Type**: Render Web Service (Node.js)
- **Root Directory**: Repository root (`.`) so npm workspaces resolve `@smart-light/shared` cleanly.
- **Build Command**: `npm ci && npm run build -w @smart-light/shared && npm run build -w @smart-light/api`
- **Start Command**: `npm run start -w @smart-light/api`
- **Health Check Path**: `/api/health`
- **Graceful Shutdown**: `apps/api` listens to `SIGTERM` and `SIGINT` to drain active HTTP connections cleanly during zero-downtime Render deploys.

### Future Background & IoT Services on Render

- **BullMQ Worker Service**: Separate Render Background Worker sharing the same compiled workspace artifacts, processing asynchronous jobs (notifications, scheduled dimming, report generation, alert escalation).
- **MQTT Ingestion Service**: Separate Render Background Worker maintaining persistent TLS connections to the managed MQTT broker, validating device telemetry via `@smart-light/shared`, and writing to PostgreSQL/Redis.
- **Managed Infrastructure (Future)**: Managed PostgreSQL, Managed Redis, S3-compatible object storage, and TLS-enabled MQTT broker configured solely through Render secret environment groups.

---

## 4. Environment & Secrets Hygiene

- Never commit `.env` files to Git.
- Separate environments cleanly (`development`, `staging`, `production`) using Vercel Environment Variables and Render Environment Groups.
- Restrict `CORS_ORIGINS` on `apps/api` in staging/production to the exact deployed origins of `citizen-web`, `municipal-admin`, and `super-admin`.
