# Monorepo Structure

## 1. Directory Layout

```text
smart-street-light-management/
├── apps/
│   ├── citizen-web/        # Public Citizen Portal (Next.js App Router + TS)
│   ├── municipal-admin/    # Municipal Operations Console (Next.js App Router + TS)
│   ├── super-admin/        # Platform Super Admin Console (Next.js App Router + TS)
│   ├── mobile/             # Field Technician Mobile App (React Native + Expo + TS)
│   └── api/                # Central Backend API (Node.js + Express + TS)
├── packages/
│   ├── shared/             # Platform-agnostic types, enums, API contracts, Zod schemas
│   ├── ui/                 # Web-only React UI primitives for Next.js apps
│   └── config/             # Shared tsconfig, ESLint flat configs, Prettier config
├── firmware/               # Embedded street light controller code & protocols (future)
├── infra/
│   ├── docker/             # Local dev Docker Compose (Postgres, Redis, MQTT, MinIO)
│   ├── mqtt/               # MQTT broker configuration & ACL definitions (future)
│   └── deployment/         # Render blueprints and Vercel deployment guides
├── docs/
│   ├── architecture/       # System, monorepo, deployment, and tech decision docs
│   ├── database/           # ERD, Prisma schema design, tenancy model (future)
│   ├── api/                # OpenAPI / Swagger specs and endpoint guides (future)
│   ├── workflows/          # Operational runbooks and CI/CD workflows
│   └── decisions/          # Architecture Decision Records (ADRs)
├── tests/                  # Cross-app E2E & system integration tests (future)
├── .github/
│   └── workflows/          # GitHub Actions CI pipelines
├── AGENTS.md               # Engineering rules for contributors and AI agents
├── README.md               # Quick start and command reference
├── package.json            # Root npm workspaces manifest and scripts
├── package-lock.json       # Single deterministic lockfile for the entire monorepo
├── .gitignore
├── .editorconfig
└── .prettierrc
```

## 2. Workspace Dependency Graph

```text
@smart-light/config  (devDependency across all workspaces)
        ▲
        │
@smart-light/shared  (runtime-agnostic: TS + Zod)
   ▲     ▲     ▲     ▲     ▲
   │     │     │     │     └────────── @smart-light/api
   │     │     │     └──────────────── @smart-light/mobile
   │     │     └────────────────────── @smart-light/ui  (Web-only React)
   │     │                              ▲       ▲       ▲
   │     ├──────────────────────────────┼───────┼───────┴── @smart-light/super-admin
   │     ├──────────────────────────────┼───────┴────────── @smart-light/municipal-admin
   └─────┴──────────────────────────────┴────────────────── @smart-light/citizen-web
```

## 3. Package & Boundary Rules

1. **Single Lockfile**: All dependencies are managed from the root via npm workspaces (`package-lock.json`). Do not run `npm install` inside individual app subdirectories with isolated lockfiles.
2. **Independent `package.json` per Workspace**: Every app and package declares its own explicit dependencies and scripts (`dev`, `build`, `typecheck`, `lint`) so it can be developed, tested, and deployed independently.
3. **Strict Isolation Between Apps**: Applications in `apps/*` never import from another application's `src/` or `app/` directory. All shared contracts must be promoted to `packages/shared` or `packages/ui`.
4. **Web vs. Mobile UI Separation**: `packages/ui` targets React DOM exclusively and is transpiled by Next.js (`transpilePackages`). `apps/mobile` implements its own React Native components and never depends on `@smart-light/ui`.
5. **Pre-built Shared Contracts**: `packages/shared` compiles TypeScript to `dist/` (`main`, `types`, `exports`) so Node.js (`apps/api`), Next.js, and Expo resolve a consistent, typed package entry point.
