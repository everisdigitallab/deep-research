# App Runtime Sample

This folder contains the shared `app-runtime` sample package used by the
template's Azure and Cloudflare-compatible runtime flow.

## Purpose

- Provide a working fullstack sample for `APP_MODE=app-runtime`
- Exercise the portable SQLite/PostgreSQL database layer
- Demonstrate CI, migrations, seed loading, auth, storage, and deployment wiring

## Scope

- `src/` contains the runtime server, routes, and portability code
- `migrations/` and `seed.sql` define the sample schema and demo data
- `generated/postgres/` is compiled from the SQLite source artifacts
- `public/` contains the sample portal shell for this runtime package

## Ownership Boundary

- Project-specific static-site apps should keep their UI and seed templates in
  `webapp/`
- Shared deployment, portability, and runtime scaffolding should stay generic
  and reusable from this package

## Note

The current sample domain is intentionally kept as a neutral innovation-program
portal so the runtime remains demonstrable without being tied to a specific
customer project.
