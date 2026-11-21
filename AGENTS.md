# AGENTS.md — Smart Street Light Management System

This document defines the architectural boundaries, engineering standards, and operational rules for all human contributors and AI coding agents working in the **Smart Street Light Management System** monorepo.

---

## 1. Project Architecture

The **Smart Street Light Management System** is a multi-tenant, enterprise-grade SaaS platform for municipal street lighting management, telemetry ingestion, fault handling, and citizen issue reporting.

The repository uses an **npm workspaces monorepo** organized around strict separation of concerns:

- **Four client applications** (three Next.js web applications + one React Native/Expo mobile application).
- **One central backend API** (Node.js + Express.js + TypeScript) that owns 100% of business logic, data persistence, authentication, authorization, and integrations.
- **Three shared internal packages** (`@smart-light/shared`, `@smart-light/ui`, `@smart-light/config`) providing contracts, web UI primitives, and tooling configurations.
- **Dedicated infrastructure, firmware, documentation, and testing directories** for future IoT, Docker, MQTT, and end-to-end testing phases.

```text
Citizen Web (Next.js)       ─┐
Municipal Admin (Next.js)   ─┼──► Central Backend API (Express + TS) ──► PostgreSQL / Redis / S3 / MQTT
Super Admin (Next.js)       ─┤                                      ▲
Mobile App (Expo / RN)      ─┘                                      │
                                                                    └── IoT Street Light Controllers (MQTT/TLS)
```

---

## 2. Technology Used by Each Folder

| Path                   | Package Name                   | Stack                                   | Purpose                                                    |
| ---------------------- | ------------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| `apps/citizen-web`     | `@smart-light/citizen-web`     | Next.js (App Router), React, TypeScript | Public-facing citizen portal                               |
| `apps/municipal-admin` | `@smart-light/municipal-admin` | Next.js (App Router), React, TypeScript | Tenant-scoped municipal operations portal                  |
| `apps/super-admin`     | `@smart-light/super-admin`     | Next.js (App Router), React, TypeScript | Platform-level SaaS governance portal                      |
| `apps/mobile`          | `@smart-light/mobile`          | React Native, Expo, TypeScript          | Mobile app for field technicians and operations            |
| `apps/api`             | `@smart-light/api`             | Node.js, Express.js, TypeScript, Zod    | Central REST API (and future Socket.IO, Prisma, BullMQ)    |
| `packages/shared`      | `@smart-light/shared`          | TypeScript, Zod                         | Platform-agnostic types, enums, API contracts, Zod schemas |
| `packages/ui`          | `@smart-light/ui`              | React, TypeScript                       | Shared **web-only** UI component library for Next.js apps  |
| `packages/config`      | `@smart-light/config`          | JSON, ESM                               | Shared TypeScript, ESLint, and Prettier configurations     |
| `firmware/`            | —                              | Embedded (future phase)                 | Street light controller firmware & MQTT payload specs      |
| `infra/docker/`        | —                              | Docker / Compose (future)               | Local development infrastructure definitions               |
| `infra/mqtt/`          | —                              | MQTT Broker config (future)             | TLS certificates template, ACLs, topic hierarchy           |
| `infra/deployment/`    | —                              | Render / Vercel configs                 | Deployment blueprints and platform guides                  |
| `docs/`                | —                              | Markdown                                | Architecture, database, API, workflows, ADRs               |
| `tests/`               | —                              | E2E / integration (future)              | Cross-application integration and system tests             |

---

## 3. Responsibilities of Each Application

- **`apps/citizen-web`**: Publicly accessible web portal for citizens to view public service status, report street light issues, and track complaint resolution. Consumes only public/citizen endpoints on `@smart-light/api`.
- **`apps/municipal-admin`**: Authenticated, tenant-isolated operations console for municipality administrators and operators to manage zones, assets, schedules, alerts, and work orders via `@smart-light/api`.
- **`apps/super-admin`**: Platform-level console for SaaS operators to onboard municipalities (tenants), manage global subscriptions, monitor system health, and audit platform activity via `@smart-light/api`.
- **`apps/mobile`**: Cross-platform iOS/Android Expo application for field maintenance technicians (and future mobile workflows). Maintains its own React Native UI system and communicates exclusively with `@smart-light/api`.
- **`apps/api`**: Single source of truth for all business logic, multi-tenant isolation, RBAC, database access (future Prisma/PostgreSQL), background jobs (future Redis/BullMQ), real-time updates (future Socket.IO), file storage (future S3), and IoT telemetry ingestion (future MQTT over TLS).

---

## 4. Backend Ownership of Business Logic

- **ALL business logic belongs strictly inside `apps/api`.**
- Next.js applications (`citizen-web`, `municipal-admin`, `super-admin`) are presentation layers only.
- **Do NOT create Next.js Route Handlers (`app/api/**`) or Server Actions that implement business rules, access databases, or bypass `apps/api`.**
- Frontend applications and the mobile application must communicate with `apps/api` over documented HTTP/WebSocket contracts.
- Never duplicate domain rules, authorization decisions, or persistence logic between frontend and backend.

---

## 5. Shared Package Rules

1. **`@smart-light/shared`**:
   - Must remain runtime-agnostic (zero DOM, zero React, zero React Native, zero Node-only APIs).
   - Contains shared TypeScript interfaces, enums, API response envelopes, and Zod schemas.
   - Must be built (`npm run build -w @smart-light/shared`) so compiled output in `dist/` is consumable by Node/Express and bundlers alike.
2. **`@smart-light/ui`**:
   - Strictly **web-only** (React DOM / Next.js).
   - Consumed ONLY by `apps/citizen-web`, `apps/municipal-admin`, and `apps/super-admin`.
   - **Never import `@smart-light/ui` in `apps/mobile` or `apps/api`.**
   - **Never add React Native components or primitives to `@smart-light/ui`.**
3. **`@smart-light/config`**:
   - Holds reusable `tsconfig`, ESLint flat config builders, and Prettier settings.
   - No runtime application code or business dependencies.
4. **Cross-App Import Prohibition**:
   - **No application may ever import files directly from another application's source directory** (e.g., `../../api/src/...` or `../citizen-web/src/...`).
   - Cross-cutting code must live in `packages/shared` or `packages/ui` (web-only).

---

## 6. Coding Standards

- Follow Prettier formatting (`.prettierrc`: 2 spaces, single quotes, semicolons, trailing commas, 100-char line width, LF line endings) and `.editorconfig`.
- Every workspace must pass ESLint (`npm run lint`) with zero errors and zero warnings where possible.
- Prefer small, cohesive modules with explicit responsibilities (routes → controllers → services → repositories in `apps/api`).
- Use descriptive names; avoid single-letter variables outside trivial loops/callbacks.
- Avoid unnecessary dependencies — evaluate whether standard library or existing workspace packages suffice before installing a new package.

---

## 7. TypeScript Standards

- `strict: true` is mandatory across all applications and packages.
- Additional strict flags enabled in `@smart-light/config`: `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`.
- Avoid `any`. Use `unknown` and narrow with type guards or Zod schemas.
- Explicitly type exported function signatures, API request/response contracts, and public component props.
- Use `import type` for type-only imports (`consistent-type-imports`).

---

## 8. Error Handling Standards

- All backend errors flow through the centralized Express error handler (`apps/api/src/middlewares/error-handler.ts`).
- Throw typed `AppError` instances for operational/expected errors (validation failures, not found, unauthorized, conflict).
- Never leak stack traces, internal SQL/ORM details, or environment values in production error responses.
- Every API error response must conform to the `ApiErrorResponse` contract in `@smart-light/shared`.
- Validate all external inputs (HTTP params/query/body, environment variables, future MQTT payloads) using Zod at the boundary.

---

## 9. Security Requirements

- **Never commit `.env` files, credentials, API keys, certificates, or hardcoded secrets to source control.**
- Every application must maintain a sanitized `.env.example` documenting all required variables with placeholder values only.
- Validate environment variables at application startup using Zod (fail fast on missing/invalid configuration).
- Follow least privilege for public client variables: only prefix truly public values with `NEXT_PUBLIC_` (Next.js) or `EXPO_PUBLIC_` (Expo). Never expose database URLs, JWT secrets, or S3 credentials to client bundles.
- Enforce security headers (`helmet`), explicit CORS origins, and body size limits in `apps/api`.
- Future phases must enforce strict multi-tenant data isolation on every tenant-scoped query.

---

## 10. Testing Requirements

- Every phase must pass full repository verification before handoff:
  - `npm run typecheck` (all workspaces)
  - `npm run lint` (all workspaces)
  - `npm run build` (packages, API, and all three Next.js apps)
  - Runtime verification of `apps/api` (`GET /api/health`) and `apps/mobile` Expo configuration.
- Future business phases must add:
  - Unit tests for domain services, validators, and shared schemas.
  - Integration tests for API routes and tenant isolation.
  - End-to-end tests in `tests/` for critical user journeys.

---

## 11. Git Conventions

- Use **Conventional Commits**:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `chore(scope): ...`
  - `docs(scope): ...`
  - `refactor(scope): ...`
  - `test(scope): ...`
  - `ci(scope): ...`
- Recommended scopes: `root`, `api`, `citizen-web`, `municipal-admin`, `super-admin`, `mobile`, `shared`, `ui`, `config`, `infra`, `docs`, `firmware`.
- Keep commits atomic, scoped to one logical change or phase, and verified before committing.
- Never force-push shared branches or commit unverified breaking changes.

---

## 12. Deployment Boundaries

- **Vercel (Independent Projects from One Monorepo)**:
  - `apps/citizen-web` → Vercel Project 1 (Root Directory: `apps/citizen-web`)
  - `apps/municipal-admin` → Vercel Project 2 (Root Directory: `apps/municipal-admin`)
  - `apps/super-admin` → Vercel Project 3 (Root Directory: `apps/super-admin`)
- **Render**:
  - `apps/api` → Render Web Service (Node.js)
  - Future MQTT ingestion workers and BullMQ background workers → Separate Render Background Worker services sharing the monorepo.
- **Mobile (`apps/mobile`)**:
  - Built and distributed via Expo Application Services (EAS Build) for iOS and Android.

---

## Strict Non-Negotiable Agent Rules

1. **Never mix Next.js application code with Express API code.**
2. **Never duplicate business logic between frontend and backend.**
3. **Never put secrets in source code.**
4. **Never create unnecessary dependencies.**
5. **Never modify unrelated working applications.**
6. **Inspect existing files before making changes.**
7. **Work in small, verifiable phases.**
8. **Ask before destructive operations.**
