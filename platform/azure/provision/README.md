# Azure Provisioning

This folder contains a bootstrap script for the Azure resources required by the
Container Apps deployment flow.

## What It Creates

- Resource Group
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server
- Project database inside the PostgreSQL server
- Firewall access for Azure services to reach PostgreSQL
- Storage Account
- Azure File Share
- Container Apps environment
- Container App bootstrap instance
- System-assigned identity on the Container App
- `AcrPull` role assignment from the Container App identity to ACR
- Azure DNS records for a custom subdomain in an existing Azure DNS zone
- Managed custom-domain binding on the Container App
- Optional service principal for GitHub Actions

## Usage

1. Use [ci/.env.azure-provision.example](/Users/rperinfe/Documents/ntt/density_os/ci/.env.azure-provision.example) as the tracked template
2. Generate your local working file with `bash platform/azure/provision/setup-azure-provision-env.sh`
3. Run the bootstrap script

```bash
bash platform/azure/provision/bootstrap-azure.sh
```

## One-Command Guided Flow

To run the full interactive flow from project setup through GitHub CI sync:

```bash
bash platform/azure/provision/run-azure-bootstrap-flow.sh
```

This wrapper runs:

- `setup-azure-provision-env.sh`
- `preflight-genspark.sh`
- `bootstrap-azure.sh`
- `sync-github-env.sh`

It also prompts for whether `AZURE_CLI_DISABLE_CONNECTION_VERIFICATION`
should be set for local proxy/TLS-bypass scenarios.
If the target GitHub repository does not exist, the wrapper can also create it
through `gh repo create` before syncing CI variables and secrets.
If the local project is not already a Git repository, the wrapper initializes
one and adds `origin` pointing at the selected GitHub repository when `origin`
is missing.

## Diagnose A Running Container App

When a deploy completes in Azure but the app is still unreachable, run:

```bash
bash platform/azure/provision/check-container-app.sh
```

This checks the current image, ingress target port, revisions, replicas, and
recent logs for the latest revision. If your local machine is behind a proxy
that breaks TLS validation, you can temporarily bypass the local HTTP probe:

```bash
SKIP_TLS_VERIFY=true bash platform/azure/provision/check-container-app.sh
```

## Sync To GitHub

After provisioning, you can push the generated values into GitHub Secrets and
Variables with the GitHub CLI.

1. Use [ci/.env.github-sync.example](/Users/rperinfe/Documents/ntt/density_os/ci/.env.github-sync.example) as the tracked template
2. Let the bootstrap flow generate `ci/.env.github-sync.local`
3. Run the sync script

```bash
bash platform/azure/provision/sync-github-env.sh
```

## Output

The script prints:

- GitHub Variables to configure
- GitHub Secrets to configure
- `AZURE_CREDENTIALS` JSON when `CREATE_SERVICE_PRINCIPAL=true`

## Notes

- `PROJECT_NAME` is the main input. The script derives Azure resource names,
  the file share name, and the custom subdomain from it unless you override
  them explicitly.
- `APP_MODE` controls whether the template provisions an `app-runtime`,
  `static-web-with-api`, or `static-web` deployment.
- `app-runtime` provisions PostgreSQL, Azure Files, runtime env vars, and the
  migration-oriented CI path.
- `static-web-with-api` also provisions PostgreSQL and Azure Files, but serves
  `webapp/` through the Node runtime instead of relying on the current
  framework-backed shell.
- `static-web` skips PostgreSQL and Azure Files provisioning, and uses a static
  container image plus `/` health checks in CI.
- `STATIC_API_TEMPLATE` is intentionally project-owned input for
  `static-web-with-api`. The bootstrap flow now prompts for it explicitly
  instead of assuming a baked-in example template.
- PostgreSQL server name, database name, admin username, SKU, storage, and
  version are also derived by default but can be overridden in the local env.
- Defaults are `eastus2` for region, `example.com` for the DNS zone, and `1`
  for max replicas.
- The script is idempotent for the main Azure resources.
- The service principal step may reset credentials if rerun with the same name.
- The script creates a bootstrap Container App so DNS and managed certificate
  binding can be completed before the CI pipeline starts deploying real images.
- The bootstrap flow also grants the Container App's system-assigned identity
  permission to pull images from ACR, so runtime image pulls do not depend on
  ACR admin credentials.
- If the target subdomain already exists as a CNAME in the Azure DNS zone, the
  bootstrap flow repoints it to the new Container App ingress automatically.
- If the target subdomain exists with a non-CNAME record type, the bootstrap
  flow stops and asks for manual cleanup instead of overwriting a potentially
  incompatible DNS record set.
- Locked Azure DNS zones are supported for the TXT verification record path:
  the bootstrap flow no longer tries to delete the existing `asuid` record and
  instead appends the current verification value only when it is missing.
- The bootstrap flow provisions PostgreSQL and syncs both `DATABASE_URL` and
  the derived PostgreSQL connection metadata into the generated GitHub sync env.
- Generated local env files are written to ignored `ci/.env.*.local` paths so
  tracked `.example` files can stay credential-free in the template repo.
- The GitHub sync script requires `gh auth login` to be completed first.
