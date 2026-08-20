# DEV-RULES.md

## Repo Rules

- Preserve the current `webapp/` app behavior while evolving the structure.
- Use `app/` for shared runtime contracts, not for platform-specific logic.
- Put Cloudflare config under `platform/cloudflare/`.
- Put Azure container and VM deployment assets under `platform/azure/`.
- Avoid hard-coding secrets, URLs, tenant IDs, or storage credentials.

## Deployment Rules

- Cloudflare remains the active prototype runtime.
- Azure support must target container or VM deployment only.
- Do not add AKS, Helm, or Kubernetes dependencies unless explicitly requested.
- CI should build deployable artifacts without requiring Cloudflare production
  credentials.

## Config Rules

- Environment parsing must fail closed for missing required values.
- Use explicit environment names such as `local`, `staging`, and `production`.
- Prefer storage and database bindings behind a shared config contract.

## Migration Rules

- Keep transitional compatibility files when moving toward the new layout.
- Favor references and documentation over large file moves in a first pass.
- Only relocate the live app source after scripts and deploy paths are updated.
