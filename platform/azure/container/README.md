# Azure Container Apps Deploy

This folder contains the container assets for deploying the template app to
Azure Container Apps without AKS.

Azure resource bootstrap for this deploy flow lives in
[platform/azure/provision](/Users/rperinfe/Documents/ntt/density_os/platform/azure/provision).

## GitHub Actions Configuration

Configure these repository or environment settings before enabling automated
deployment.

### Required GitHub Secrets

- `AZURE_CREDENTIALS`: service principal JSON for `azure/login`
- `APP_BASE_URL`: public base URL for the deployed app
- `ADMIN_BOOTSTRAP_TOKEN`: bootstrap/admin token for the current app version
- `DATABASE_URL`: Azure Database for PostgreSQL connection URL
- `POSTGRES_ADMIN_PASSWORD`: PostgreSQL administrator password for provisioning and maintenance

### Required GitHub Variables

- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_CONTAINER_REGISTRY`
- `AZURE_CONTAINER_REGISTRY_LOGIN_SERVER`
- `AZURE_CONTAINER_APPS_ENVIRONMENT`
- `AZURE_CONTAINER_APP_NAME`
- `AZURE_CONTAINER_APP_DOMAIN`
- `AZURE_DNS_ZONE_NAME`
- `AZURE_CUSTOM_SUBDOMAIN`
- `AZURE_FILE_SHARE_NAME`
- `AZURE_CONTAINER_APP_STORAGE_NAME`
- `AZURE_POSTGRES_SERVER_NAME`
- `AZURE_POSTGRES_DATABASE_NAME`
- `AZURE_POSTGRES_ADMIN_USERNAME`

### Optional GitHub Variables

- `APP_MODE`
- `IMAGE_NAME`
- `AZURE_CONTAINER_CPU`
- `AZURE_CONTAINER_MEMORY`
- `AZURE_CONTAINER_MIN_REPLICAS`
- `AZURE_CONTAINER_MAX_REPLICAS`
- `AZURE_DATA_MOUNT_PATH`
- `SQLITE_PATH`
- `DOCUMENTS_PATH`
- `AUTO_RUN_MIGRATIONS`
- `AUTO_SEED_ON_EMPTY_DB`
- `APP_NAME`
- `APP_ENV`
- `APP_RUNTIME`
- `API_BASE_PATH`
- `AI_ENABLED`
- `STATIC_SITE_ROOT`
- `AZURE_CONTAINER_PORT`
- `AZURE_HEALTHCHECK_PATH`
- `DATABASE_PROVIDER`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DATABASE`
- `POSTGRES_USER`
- `POSTGRES_SSLMODE`

## Notes

- The workflow builds the app from `app/`, pushes the container image to ACR,
  then creates or updates an Azure Container App revision with the new image.
- `APP_MODE=app-runtime` uses the Node runtime image in
  [Dockerfile](/Users/rperinfe/Documents/ntt/density_os/platform/azure/container/Dockerfile:1).
- `APP_MODE=static-web-with-api` also uses the Node runtime image, but serves
  `webapp/` directly while keeping the runtime-managed database path.
- `STATIC_API_TEMPLATE` is project-specific input for `static-web-with-api`
  and should point at the template data your app owns.
- `APP_MODE=static-web` uses
  [Dockerfile.static](/Users/rperinfe/Documents/ntt/density_os/platform/azure/container/Dockerfile.static:1)
  to serve `webapp/` through `nginx`.
- The GitHub Actions runner logs in to ACR through Azure CLI, while the
  Container App itself pulls from ACR through its system-assigned identity.
- Azure Container Apps should be fed an `linux/amd64` image. On Apple Silicon,
  manual local pushes should use `docker buildx build --platform linux/amd64`
  so Azure does not fail with `exec format error`.
- Health probes target `/api/health` on port `3000` so Azure can promote the
  revision to ready status more reliably.
- The Azure runtime is Node-based and does not depend on Wrangler or the
  Cloudflare emulator.
- The Azure File share is linked at the Container Apps environment level and
  mounted into the app for both the SQLite database file and uploaded
  documents.
- The Azure bootstrap flow also provisions an Azure Database for PostgreSQL
  Flexible Server and passes its connection settings into the Container App.
- The workflow validates the PostgreSQL runtime bootstrap before pushing the
  image, so portability or connectivity issues fail in CI rather than only at
  revision startup.
- Runtime-only database validation and volume mounts are skipped automatically
  only when `APP_MODE=static-web`.
- The recommended custom-domain shape is a subdomain in an existing Azure DNS
  zone, bound to the container app through a managed certificate.
- Migrations run automatically on boot by default. Seed loading is opt-in
  through `AUTO_SEED_ON_EMPTY_DB=true`.
