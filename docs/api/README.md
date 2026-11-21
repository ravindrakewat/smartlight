# API (`apps/api`)

Interactive docs: **`/api/docs`** (Swagger UI) and **`/api/openapi.json`** — generated from the
same Zod schemas that validate requests. Enabled by default outside production
(`API_DOCS_ENABLED`).

## Structure

```text
apps/api/src/
├── app.ts / server.ts      Express setup, graceful shutdown
├── config/env.ts           Zod-validated environment (fails fast)
├── lib/                    prisma client, OpenAPI registry, response helpers
├── middlewares/            authenticate, authorize, csrf-origin, rate-limit, error-handler, …
├── modules/<feature>/      one folder per feature
│   ├── <feature>.routes.ts       URL → middleware → controller
│   ├── <feature>.controller.ts   parse input (Zod), call service, send envelope
│   ├── <feature>.service.ts      business rules, transactions, audit
│   ├── <feature>.repository.ts   Prisma queries (always tenant-filtered)
│   └── <feature>.openapi.ts      Swagger registration
└── routes/index.ts         /api/health, /api/v1/*, docs
```

Rules: controllers never touch Prisma; services never touch `req`/`res` (except passing the
request through for audit metadata); every tenant-owned query filters by `tenantId`.

## Conventions

- **Versioning:** business endpoints live under `/api/v1`. Health probes stay unversioned.
- **Envelope:** `{ success: true, data, meta }` or `{ success: false, error: { code, message, details? }, meta }`.
- **Errors:** throw `errors.*` / `AppError`; Zod and Prisma errors are translated centrally.
- **Auth:** `authenticate` accepts `Authorization: Bearer` (mobile) or the `sl_at` httpOnly cookie
  (web). Sessions are re-checked on every request, so logout and account disabling apply instantly.
- **Roles:** `requireRoles(...)` after `authenticate`. Tenant scope comes from the token
  (`requireTenantId`); SUPER_ADMIN must name the tenant explicitly.
- **CSRF:** cookie-authenticated state-changing requests must send an allowed `Origin`.
- **Audit:** security-relevant and data-changing actions call `recordAudit` (append-only table).

## Auth flow

| Endpoint                    | Purpose                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/login`   | Web: sets `sl_at` (15 min) + `sl_rt` (30 days, path `/api/v1/auth`). Mobile: returns tokens. 5 failures → 15 min lock. |
| `POST /api/v1/auth/refresh` | Rotates the refresh token. Re-using an old one revokes the whole login (theft detection).                              |
| `POST /api/v1/auth/logout`  | Revokes the session.                                                                                                   |
| `GET /api/v1/auth/me`       | Current user, tenant and agency.                                                                                       |

## Tests

`npm run test -w @smart-light/api` starts a throwaway PostgreSQL (embedded, no Docker), applies
all migrations and runs the integration tests. Set `TEST_DATABASE_URL` to use an existing database.
