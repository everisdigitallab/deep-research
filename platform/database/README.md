# Database Portability Layer

This folder holds the project-agnostic SQL portability layer for template-based
apps that:

- author schema and seed data in a SQLite / Cloudflare D1-friendly subset
- need to run the same logical schema against PostgreSQL in Azure production

## Authoring Model

The source-of-truth SQL stays in the app folder:

- `app/migrations/*.sql`
- `app/seed.sql`

These files are authored in a constrained SQLite-compatible dialect that can be
compiled to PostgreSQL.

## Compiler

Generate PostgreSQL-ready SQL with:

```bash
cd app
npm run db:compile:postgres
```

This writes:

- `app/generated/postgres/migrations/*.sql`
- `app/generated/postgres/seed.sql`
- `app/generated/postgres/manifest.json`

## Supported Portability Rules

The compiler currently translates the SQLite authoring subset used by this
template:

- `datetime('now')` -> `CURRENT_TIMESTAMP`
- `date('now')` -> `CURRENT_DATE`
- `INSERT OR IGNORE INTO ...` -> `INSERT INTO ... ON CONFLICT DO NOTHING`
- drops `PRAGMA ...` statements for PostgreSQL targets
- removes `AUTOINCREMENT`

## Important Limits

This is intentionally a portability layer, not a full SQL parser.

It does not yet rewrite:

- SQLite catalog queries such as `sqlite_master`
- SQLite runtime helpers like `last_insert_rowid()`
- SQLite-only DDL beyond the supported subset
- application query semantics that depend on SQLite-specific behavior

That means this layer is enough to bridge migration and seed files, but the app
runtime still needs a PostgreSQL database adapter before Azure production can
fully switch away from SQLite semantics.

## Template Guidance

For future apps based on this template:

1. Keep schema authoring inside the supported portability subset.
2. Treat generated PostgreSQL SQL as build artifacts derived from the source
   migrations and seed files.
3. Avoid introducing SQLite-only query features into shared runtime code unless
   the portability layer and adapter abstraction are extended first.
4. For Azure/PostgreSQL builds, ensure the generated artifacts are produced
   before container packaging so `app/generated/postgres` is available at
   runtime.
