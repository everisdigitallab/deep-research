# AGENTS.md

## Mission

This repository hosts the Density OS application and its deployment scaffolding.
The current runnable implementation lives in `webapp/`, while the repository
structure is being normalized toward a platform-oriented layout.

## Working Model

- Treat `webapp/` as the source of truth for the current Cloudflare MVP.
- Treat `app/` and `platform/` as the target structure for shared contracts and
  deployment assets.
- Prefer additive changes over destructive moves unless explicitly requested.
- Keep Cloudflare support first-class while preserving an Azure container path
  that does not depend on AKS.

## Target Layout

- `app/`: shared application contracts and future framework-neutral code.
- `platform/cloudflare/`: Cloudflare-specific config and deployment assets.
- `platform/azure/container/`: container assets for Azure Container Instances or
  VM-based deployment.
- `.github/workflows/`: CI/CD automation.
- `webapp/`: current Hono + Vite + Cloudflare implementation during migration.

## Guardrails

- Do not introduce AKS-specific manifests or assumptions.
- Do not assume Azure-only services are available at runtime.
- Keep configuration portable across Cloudflare and Azure where possible.
- Any new environment variable must be reflected in `app/src/config/env.ts`.
