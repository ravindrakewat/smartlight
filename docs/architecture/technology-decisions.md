# Technology Decisions

This document captures the rationale behind the Phase 0 technology stack and architectural boundaries for the **Smart Street Light Management System**.

---

## 1. Monorepo with npm Workspaces

- **Decision**: Use a single Git repository managed with native **npm workspaces**.
- **Rationale**:
  - Zero extra package manager prerequisites beyond Node.js and npm.
  - Deterministic single lockfile (`package-lock.json`) prevents version drift across five applications.
  - Enables atomic cross-cutting changes when updating shared API contracts (`@smart-light/shared`) alongside backend and frontend consumers.
  - Directly supported by Vercel, Render, and GitHub Actions without custom build wrappers.

## 2. Three Separate Next.js Applications

- **Decision**: Split web interfaces into `citizen-web`, `municipal-admin`, and `super-admin` rather than a single monolithic web app.
- **Rationale**:
  - **Security & Blast Radius**: Public citizen traffic, tenant-scoped municipal operations, and privileged SaaS super-admin controls have distinct threat models, auth flows, and domain boundaries.
  - **Independent Deployment & Scaling**: Each portal deploys to its own Vercel project and domain (e.g., `lights.city.gov`, `admin.platform.com`, `console.platform.com`) with independent release cadences.
  - **Shared Consistency**: Visual cohesion is achieved via `@smart-light/ui` without coupling application lifecycles.

## 3. Central Express.js API (No Next.js Backend Duplication)

- **Decision**: Consolidate all backend business logic in `apps/api` (Node.js + Express.js + TypeScript) and prohibit business APIs inside Next.js applications.
- **Rationale**:
  - Four distinct clients (three web apps + React Native mobile app) require a single authoritative API surface.
  - Centralizes multi-tenant isolation, RBAC, audit logging, rate limiting, and future Socket.IO + BullMQ + MQTT orchestration in one backend runtime suited for long-lived processes on Render.
  - Eliminates duplicated validation, drift between web and mobile behavior, and accidental exposure of database credentials to frontend deployments.

## 4. React Native + Expo for Mobile (Separate UI Layer)

- **Decision**: Use React Native + Expo + TypeScript in `apps/mobile`, sharing `@smart-light/shared` but **not** `@smart-light/ui`.
- **Rationale**:
  - Field maintenance workflows require native capabilities (GPS, camera photo capture for pole inspections, offline-resilient UX, push notifications).
  - Keeping `@smart-light/ui` strictly web-only avoids fragile React Native Web abstractions and lets web portals and mobile apps follow their native platform idioms cleanly.

## 5. TypeScript + Zod Across the Stack

- **Decision**: Enforce strict TypeScript across every workspace and use **Zod** for runtime validation (environment variables in Phase 0; HTTP DTOs and MQTT telemetry payloads in future phases).
- **Rationale**:
  - TypeScript provides compile-time safety; Zod provides runtime boundary validation with automatic static type inference (`z.infer`).
  - Sharing Zod schemas via `@smart-light/shared` ensures frontend forms, mobile clients, backend controllers, and IoT ingestors validate identical data shapes.

## 6. Planned Data, Real-Time, and IoT Stack (Future Phases)

- **PostgreSQL + Prisma**: Relational integrity, row-level/tenant-scoped indexing, and type-safe migrations for multi-tenant SaaS assets, schedules, and work orders.
- **Redis + BullMQ**: Reliable background job queues for alert processing, scheduled dimming commands, and notification delivery.
- **Socket.IO**: Low-latency bi-directional updates for live street light status maps and outage alerts in admin portals and mobile apps.
- **MQTT over TLS**: Lightweight publish/subscribe transport standard for constrained street light IoT controllers.
- **S3-Compatible Storage**: Durable storage for citizen complaint photos, field maintenance attachments, and generated compliance reports.
- **OpenAPI / Swagger**: Machine-readable API specification generated/served from `apps/api` to document contracts for web, mobile, and external integrators.
