# Deployment Configuration

This directory contains deployment blueprints and platform guidance for independent deployments:

- **Render**: See [`render.yaml`](./render.yaml) for the `apps/api` web service blueprint and planned background workers (MQTT ingestion & BullMQ).
- **Vercel**: Each Next.js app (`apps/citizen-web`, `apps/municipal-admin`, `apps/super-admin`) deploys as an independent Vercel project. See [`docs/architecture/deployment-architecture.md`](../../docs/architecture/deployment-architecture.md) for Root Directory, build commands, and environment variables.
