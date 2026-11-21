# System Overview

## 1. Purpose

The **Smart Street Light Management System** is a multi-tenant SaaS platform designed to help municipalities monitor, automate, control, and maintain urban street lighting networks while giving citizens a transparent channel to report outages and track resolutions.

## 2. High-Level Architecture

The platform follows a **centralized API / multi-client architecture**:

```text
┌────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  Citizen Website   │  │   Municipal Admin    │  │    Super Admin     │  │   Mobile App       │
│  (Next.js / Web)   │  │   (Next.js / Web)    │  │  (Next.js / Web)   │  │  (Expo / RN)       │
└─────────┬──────────┘  └──────────┬───────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          │                        │                        │                       │
          └────────────────────────┴───────────┬────────────┴───────────────────────┘
                                               │ HTTPS (REST JSON) + WSS (Socket.IO, future)
                                               ▼
                             ┌───────────────────────────────────┐
                             │       Central Backend API         │
                             │  (Node.js + Express + TypeScript) │
                             └───────┬───────────┬───────┬───────┘
                                     │           │       │
                    ┌────────────────┘           │       └────────────────┐
                    ▼                            ▼                        ▼
           ┌─────────────────┐         ┌─────────────────┐      ┌──────────────────┐
           │   PostgreSQL    │         │  Redis + BullMQ │      │  S3-Compatible   │
           │ (Prisma, future)│         │ (Jobs, future)  │      │ Storage (future) │
           └─────────────────┘         └────────▲────────┘      └──────────────────┘
                                                │
                                      ┌─────────┴─────────┐
                                      │  MQTT Ingestion   │
                                      │  Service (future) │
                                      └─────────▲─────────┘
                                                │ MQTT over TLS
                                      ┌─────────┴─────────┐
                                      │ Street Light IoT  │
                                      │ Nodes (Firmware)  │
                                      └───────────────────┘
```

## 3. Application Communication Model

### Central API as the Single Source of Truth

All five applications follow a strict hub-and-spoke communication model:

1. **Citizen Website (`apps/citizen-web`)**:
   - Connects to `apps/api` over HTTPS using `NEXT_PUBLIC_API_BASE_URL`.
   - Consumes public/citizen endpoints (status lookup, issue submission, complaint tracking in future phases).
   - Contains **no** database access and **no** local Next.js API routes duplicating backend logic.

2. **Municipal Admin (`apps/municipal-admin`)**:
   - Connects to `apps/api` over HTTPS (and future Socket.IO channels for live pole telemetry and fault alerts).
   - Operates within a strictly enforced municipal tenant boundary validated by `apps/api`.

3. **Super Admin (`apps/super-admin`)**:
   - Connects to `apps/api` over HTTPS using privileged platform-operator roles (introduced in the auth phase).
   - Manages tenant provisioning, platform configuration, and global system oversight.

4. **Mobile Application (`apps/mobile`)**:
   - Consumes the **exact same REST endpoints** (and future Socket.IO events) exposed by `apps/api`, configured via `EXPO_PUBLIC_API_BASE_URL`.
   - Shares API response types, enums, and Zod validation contracts via `@smart-light/shared`, guaranteeing payload parity across web and mobile without sharing UI components.

5. **Central Backend API (`apps/api`)**:
   - Exposes versioned/namespaced REST APIs under `/api/*` (starting with `GET /api/health` in Phase 0).
   - Owns authentication, authorization, multi-tenant scoping, persistence, job dispatching, and real-time event emission.

## 4. Future MQTT & IoT Integration

Street light field controllers (`firmware/`) will **not** connect directly to frontend clients or databases. Instead:

- Devices connect to a managed/dedicated **MQTT broker over TLS** with mutual TLS or per-device credentials (`infra/mqtt/`).
- Devices publish telemetry (voltage, current, power consumption, lux level, fault codes, heartbeat) to tenant-namespaced topics (e.g., `tenants/{tenantId}/devices/{deviceId}/telemetry`).
- A dedicated **MQTT Ingestion Worker** (sharing `@smart-light/shared` schemas and database contracts) subscribes to broker topics, validates payloads with Zod, persists telemetry, and enqueues fault/alert processing jobs onto **Redis + BullMQ**.
- Command messages (dimming schedules, manual on/off overrides, OTA metadata) are authorized by `apps/api`, audited in PostgreSQL, queued via BullMQ, and published back to device command topics.
- Real-time state updates are broadcast to connected Municipal Admin and Mobile clients via **Socket.IO** backed by a Redis adapter.

## 5. Shared Package Consumption

- `@smart-light/shared`: Consumed by **all five applications** (`api`, `citizen-web`, `municipal-admin`, `super-admin`, `mobile`) for API response envelopes, common enums, and Zod schemas.
- `@smart-light/ui`: Consumed **only by the three Next.js applications** (`citizen-web`, `municipal-admin`, `super-admin`) via Next.js `transpilePackages`. Mobile maintains its own native UI layer.
- `@smart-light/config`: Consumed by all workspaces as a development dependency for consistent TypeScript, ESLint, and Prettier rules.
