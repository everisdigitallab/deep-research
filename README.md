# Density OS

## Structure

- `app/`: primary application source, assets, migrations, and seed data.
- `platform/cloudflare/`: Cloudflare deployment configuration.
- `platform/azure/container/`: Azure container deployment assets.
- `webapp/`: compatibility wrapper for the current Cloudflare build output and
  local deployment scripts.

## Current Runtime

The active implementation is a Hono + Vite application built from `app/` and
deployed through Cloudflare Pages/Workers. Build output is emitted to
`webapp/dist` so existing Cloudflare and PM2 flows continue to work during the
migration.

Cloudflare/Genspark should be treated as the `dev` environment for this
repository. Azure Container Apps plus Azure Database for PostgreSQL is the
`production` path and should hold real production data.

## Common Commands

```bash
npm run dev
npm run build
npm run preview
npm run db:compile:postgres
npm run db:migrate:local
npm run db:seed
```

## Database Portability

SQLite / Cloudflare D1 remains the authoring and `dev` database shape. To
generate PostgreSQL-ready SQL artifacts for Azure production, run:

```bash
cd app
npm run db:compile:postgres
```

The generic portability layer lives in
[platform/database](/Users/rperinfe/Documents/ntt/density_os/platform/database/README.md).
