#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/ci/.env.azure-provision.local"
FALLBACK_ENV_FILE="${ROOT_DIR}/ci/.env.azure-provision.example"
GITHUB_SYNC_ENV_FILE="${ROOT_DIR}/ci/.env.github-sync.local"

if [[ -f "${DEFAULT_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${DEFAULT_ENV_FILE}"
  set +a
elif [[ -f "${FALLBACK_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${FALLBACK_ENV_FILE}"
  set +a
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

slugify() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

alnumify() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9]+//g'
}

truncate_chars() {
  local value="$1"
  local max_len="$2"
  printf '%s' "${value:0:${max_len}}"
}

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\"'\"'/g")"
}

validate_app_mode() {
  case "$1" in
    static-web|static-web-with-api|app-runtime) return 0 ;;
    *)
      echo "APP_MODE must be one of: static-web, static-web-with-api, app-runtime." >&2
      exit 1
      ;;
  esac
}

command -v az >/dev/null 2>&1 || {
  echo "Azure CLI (az) is required." >&2
  exit 1
}

PROJECT_NAME="${PROJECT_NAME:-}"
APP_MODE="${APP_MODE:-app-runtime}"
AZURE_SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-}"
AZURE_LOCATION="${AZURE_LOCATION:-eastus2}"
AZURE_DNS_ZONE_NAME="${AZURE_DNS_ZONE_NAME:-example.com}"
require_env PROJECT_NAME
validate_app_mode "${APP_MODE}"

PROJECT_SLUG="$(slugify "${PROJECT_NAME}")"
PROJECT_ALNUM="$(alnumify "${PROJECT_NAME}")"

if [[ -z "${PROJECT_SLUG}" || -z "${PROJECT_ALNUM}" ]]; then
  echo "PROJECT_NAME must contain at least one alphanumeric character." >&2
  exit 1
fi

AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-${PROJECT_SLUG}}"
AZURE_CONTAINER_REGISTRY="${AZURE_CONTAINER_REGISTRY:-$(truncate_chars "icb${PROJECT_ALNUM}acr" 50)}"
AZURE_STORAGE_ACCOUNT_NAME="${AZURE_STORAGE_ACCOUNT_NAME:-$(truncate_chars "icb${PROJECT_ALNUM}st" 24)}"
AZURE_FILE_SHARE_NAME="${AZURE_FILE_SHARE_NAME:-$(truncate_chars "${PROJECT_SLUG}-data" 63)}"
AZURE_CONTAINER_APPS_ENVIRONMENT="${AZURE_CONTAINER_APPS_ENVIRONMENT:-$(truncate_chars "${PROJECT_SLUG}-env" 32)}"
AZURE_CONTAINER_APP_NAME="${AZURE_CONTAINER_APP_NAME:-$(truncate_chars "${PROJECT_SLUG}-app" 32)}"
AZURE_CUSTOM_SUBDOMAIN="${AZURE_CUSTOM_SUBDOMAIN:-${PROJECT_SLUG}}"
AZURE_DNS_ZONE_RESOURCE_GROUP="${AZURE_DNS_ZONE_RESOURCE_GROUP:-${AZURE_RESOURCE_GROUP}}"
AZURE_CONTAINER_APP_STORAGE_NAME="${AZURE_CONTAINER_APP_STORAGE_NAME:-appdata}"
AZURE_POSTGRES_SERVER_NAME="${AZURE_POSTGRES_SERVER_NAME:-$(truncate_chars "icb-${PROJECT_SLUG}-pg" 63)}"
AZURE_POSTGRES_DATABASE_NAME="${AZURE_POSTGRES_DATABASE_NAME:-${PROJECT_ALNUM}}"
AZURE_POSTGRES_ADMIN_USERNAME="${AZURE_POSTGRES_ADMIN_USERNAME:-pgadmin}"
AZURE_POSTGRES_SKU_NAME="${AZURE_POSTGRES_SKU_NAME:-Standard_B1ms}"
AZURE_POSTGRES_TIER="${AZURE_POSTGRES_TIER:-Burstable}"
AZURE_POSTGRES_STORAGE_SIZE_GB="${AZURE_POSTGRES_STORAGE_SIZE_GB:-32}"
AZURE_POSTGRES_VERSION="${AZURE_POSTGRES_VERSION:-16}"

APP_NAME="${APP_NAME:-${PROJECT_SLUG}}"
APP_ENV="${APP_ENV:-production}"
APP_RUNTIME="${APP_RUNTIME:-azure-container-apps}"
API_BASE_PATH="${API_BASE_PATH:-/api}"
AI_ENABLED="${AI_ENABLED:-false}"
DATABASE_PROVIDER="${DATABASE_PROVIDER:-}"
STATIC_SITE_ROOT="${STATIC_SITE_ROOT:-}"
STATIC_API_TEMPLATE="${STATIC_API_TEMPLATE:-}"
AZURE_CONTAINER_PORT="${AZURE_CONTAINER_PORT:-}"
AZURE_HEALTHCHECK_PATH="${AZURE_HEALTHCHECK_PATH:-}"

AZURE_CONTAINER_CPU="${AZURE_CONTAINER_CPU:-1}"
AZURE_CONTAINER_MEMORY="${AZURE_CONTAINER_MEMORY:-2}"
AZURE_CONTAINER_MIN_REPLICAS="${AZURE_CONTAINER_MIN_REPLICAS:-0}"
AZURE_CONTAINER_MAX_REPLICAS="${AZURE_CONTAINER_MAX_REPLICAS:-1}"
AZURE_DATA_MOUNT_PATH="${AZURE_DATA_MOUNT_PATH:-/mnt/app-data}"
SQLITE_PATH="${SQLITE_PATH:-${AZURE_DATA_MOUNT_PATH}/database/app.sqlite}"
DOCUMENTS_PATH="${DOCUMENTS_PATH:-${AZURE_DATA_MOUNT_PATH}/documents}"
AUTO_RUN_MIGRATIONS="${AUTO_RUN_MIGRATIONS:-true}"
AUTO_SEED_ON_EMPTY_DB="${AUTO_SEED_ON_EMPTY_DB:-false}"

CREATE_SERVICE_PRINCIPAL="${CREATE_SERVICE_PRINCIPAL:-true}"
AZURE_SERVICE_PRINCIPAL_NAME="${AZURE_SERVICE_PRINCIPAL_NAME:-${PROJECT_SLUG}-gha}"
AZURE_SERVICE_PRINCIPAL_ROLE="${AZURE_SERVICE_PRINCIPAL_ROLE:-Contributor}"
APP_BASE_URL="${APP_BASE_URL:-}"
ADMIN_BOOTSTRAP_TOKEN="${ADMIN_BOOTSTRAP_TOKEN:-}"
POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD:-}"

if [[ "${APP_MODE}" == "static-web" ]]; then
  STATIC_SITE_ROOT="${STATIC_SITE_ROOT:-webapp}"
  STATIC_API_TEMPLATE="${STATIC_API_TEMPLATE:-}"
  AZURE_CONTAINER_PORT="${AZURE_CONTAINER_PORT:-80}"
  AZURE_HEALTHCHECK_PATH="${AZURE_HEALTHCHECK_PATH:-/}"
  DATABASE_PROVIDER="${DATABASE_PROVIDER:-}"
  AZURE_DATA_MOUNT_PATH="${AZURE_DATA_MOUNT_PATH:-}"
  SQLITE_PATH="${SQLITE_PATH:-}"
  DOCUMENTS_PATH="${DOCUMENTS_PATH:-}"
  AUTO_RUN_MIGRATIONS="${AUTO_RUN_MIGRATIONS:-false}"
else
  DATABASE_PROVIDER="${DATABASE_PROVIDER:-postgres}"
  AZURE_CONTAINER_PORT="${AZURE_CONTAINER_PORT:-3000}"
  AZURE_HEALTHCHECK_PATH="${AZURE_HEALTHCHECK_PATH:-/api/health}"
  if [[ "${APP_MODE}" == "static-web-with-api" ]]; then
    STATIC_SITE_ROOT="${STATIC_SITE_ROOT:-webapp}"
    require_env STATIC_API_TEMPLATE
  fi
fi

require_env AZURE_SUBSCRIPTION_ID
require_env AZURE_LOCATION
require_env AZURE_DNS_ZONE_NAME

AZURE_CONTAINER_APP_DOMAIN="${AZURE_CUSTOM_SUBDOMAIN}.${AZURE_DNS_ZONE_NAME}"

if [[ -z "${APP_BASE_URL}" ]]; then
  APP_BASE_URL="https://${AZURE_CONTAINER_APP_DOMAIN}"
fi

if [[ -z "${ADMIN_BOOTSTRAP_TOKEN}" ]]; then
  ADMIN_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
fi

echo "Using subscription: ${AZURE_SUBSCRIPTION_ID}"
az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
az extension add --name containerapp --upgrade --only-show-errors >/dev/null

echo "Creating resource group if needed..."
az group create \
  --name "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

echo "Checking Azure DNS zone..."
az network dns zone show \
  --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
  --name "${AZURE_DNS_ZONE_NAME}" \
  --output none

echo "Creating Azure Container Registry if needed..."
az acr create \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_REGISTRY}" \
  --sku Basic \
  --admin-enabled false \
  --location "${AZURE_LOCATION}" \
  --output none

POSTGRES_HOST=""
POSTGRES_PORT=""
POSTGRES_DATABASE=""
POSTGRES_USER=""
POSTGRES_SSLMODE=""
DATABASE_URL=""
AZURE_STORAGE_ACCOUNT_KEY=""

if [[ "${APP_MODE}" != "static-web" ]]; then
  echo "Creating Azure Database for PostgreSQL Flexible Server if needed..."
  POSTGRES_SERVER_EXISTS="false"
  if az postgres flexible-server show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_POSTGRES_SERVER_NAME}" >/dev/null 2>&1; then
    POSTGRES_SERVER_EXISTS="true"
  fi

  if [[ "${POSTGRES_SERVER_EXISTS}" == "false" ]]; then
    if [[ -z "${POSTGRES_ADMIN_PASSWORD}" ]]; then
      POSTGRES_ADMIN_PASSWORD="Aa1!$(openssl rand -hex 20)"
    fi

    if [[ -f "${DEFAULT_ENV_FILE}" ]]; then
      perl -0pi -e "s/^POSTGRES_ADMIN_PASSWORD=.*/POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}/m" "${DEFAULT_ENV_FILE}" 2>/dev/null || true
    fi

    az postgres flexible-server create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${AZURE_POSTGRES_SERVER_NAME}" \
      --location "${AZURE_LOCATION}" \
      --admin-user "${AZURE_POSTGRES_ADMIN_USERNAME}" \
      --admin-password "${POSTGRES_ADMIN_PASSWORD}" \
      --sku-name "${AZURE_POSTGRES_SKU_NAME}" \
      --tier "${AZURE_POSTGRES_TIER}" \
      --storage-size "${AZURE_POSTGRES_STORAGE_SIZE_GB}" \
      --version "${AZURE_POSTGRES_VERSION}" \
      --public-access 0.0.0.0 \
      --yes \
      --output none
  else
    if [[ -z "${POSTGRES_ADMIN_PASSWORD}" ]]; then
      echo "POSTGRES_ADMIN_PASSWORD is required in ${DEFAULT_ENV_FILE} to reuse the existing PostgreSQL server ${AZURE_POSTGRES_SERVER_NAME} without rotating credentials." >&2
      exit 1
    fi
  fi

  echo "Ensuring PostgreSQL database exists..."
  az postgres flexible-server db create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server-name "${AZURE_POSTGRES_SERVER_NAME}" \
    --database-name "${AZURE_POSTGRES_DATABASE_NAME}" \
    --output none

  echo "Ensuring PostgreSQL firewall access for Azure services..."
  az postgres flexible-server firewall-rule create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --server-name "${AZURE_POSTGRES_SERVER_NAME}" \
    --name allow-azure-services \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0 \
    --output none || true

  POSTGRES_HOST="$(
    az postgres flexible-server show \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${AZURE_POSTGRES_SERVER_NAME}" \
      --query 'fullyQualifiedDomainName' \
      --output tsv
  )"
  POSTGRES_PORT="5432"
  POSTGRES_DATABASE="${AZURE_POSTGRES_DATABASE_NAME}"
  POSTGRES_USER="${AZURE_POSTGRES_ADMIN_USERNAME}"
  POSTGRES_SSLMODE="require"
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_ADMIN_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=${POSTGRES_SSLMODE}"

  echo "Creating storage account if needed..."
  az storage account create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_STORAGE_ACCOUNT_NAME}" \
    --location "${AZURE_LOCATION}" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --allow-blob-public-access false \
    --output none

  echo "Fetching storage account key..."
  AZURE_STORAGE_ACCOUNT_KEY="$(
    az storage account keys list \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --account-name "${AZURE_STORAGE_ACCOUNT_NAME}" \
      --query '[0].value' \
      --output tsv
  )"

  echo "Creating Azure File share if needed..."
  az storage share create \
    --name "${AZURE_FILE_SHARE_NAME}" \
    --account-name "${AZURE_STORAGE_ACCOUNT_NAME}" \
    --account-key "${AZURE_STORAGE_ACCOUNT_KEY}" \
    --quota 100 \
    --output none
fi

echo "Fetching ACR metadata..."
AZURE_CONTAINER_REGISTRY_LOGIN_SERVER="$(
  az acr show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_REGISTRY}" \
    --query 'loginServer' \
    --output tsv
)"
AZURE_CONTAINER_REGISTRY_ID="$(
  az acr show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_REGISTRY}" \
    --query 'id' \
    --output tsv
)"

echo "Creating Container Apps environment if needed..."
if ! az containerapp env show \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APPS_ENVIRONMENT}" >/dev/null 2>&1; then
  az containerapp env create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APPS_ENVIRONMENT}" \
    --location "${AZURE_LOCATION}" \
    --environment-mode ConsumptionOnly \
    --output none
fi

if [[ "${APP_MODE}" != "static-web" ]]; then
  echo "Linking Azure Files storage to Container Apps environment..."
  az containerapp env storage set \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APPS_ENVIRONMENT}" \
    --storage-name "${AZURE_CONTAINER_APP_STORAGE_NAME}" \
    --storage-type AzureFile \
    --azure-file-account-name "${AZURE_STORAGE_ACCOUNT_NAME}" \
    --azure-file-account-key "${AZURE_STORAGE_ACCOUNT_KEY}" \
    --azure-file-share-name "${AZURE_FILE_SHARE_NAME}" \
    --access-mode ReadWrite \
    --output none
fi

echo "Creating bootstrap Container App if needed..."
if ! az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APP_NAME}" >/dev/null 2>&1; then
  az containerapp create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --environment "${AZURE_CONTAINER_APPS_ENVIRONMENT}" \
    --image mcr.microsoft.com/k8se/quickstart:latest \
    --ingress external \
    --target-port 80 \
    --min-replicas 0 \
    --max-replicas 1 \
    --env-vars APP_NAME="${APP_NAME}" APP_ENV="${APP_ENV}" APP_RUNTIME="${APP_RUNTIME}" \
    --output none
fi

echo "Ensuring system-assigned identity exists on Container App..."
az containerapp identity assign \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --system-assigned \
  --output none

CONTAINER_APP_PRINCIPAL_ID="$(
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --query "identity.principalId" \
    --output tsv
)"

if [[ -z "${CONTAINER_APP_PRINCIPAL_ID}" || "${CONTAINER_APP_PRINCIPAL_ID}" == "null" ]]; then
  echo "Failed to resolve system-assigned identity principal id for ${AZURE_CONTAINER_APP_NAME}." >&2
  exit 1
fi

echo "Granting AcrPull to Container App identity if needed..."
if ! az role assignment list \
  --assignee-object-id "${CONTAINER_APP_PRINCIPAL_ID}" \
  --scope "${AZURE_CONTAINER_REGISTRY_ID}" \
  --query "[?roleDefinitionName=='AcrPull'] | [0].id" \
  --output tsv | grep -q .; then
  az role assignment create \
    --assignee-object-id "${CONTAINER_APP_PRINCIPAL_ID}" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull \
    --scope "${AZURE_CONTAINER_REGISTRY_ID}" \
    --output none
fi

echo "Fetching Container App ingress data..."
CONTAINER_APP_FQDN="$(
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --query "properties.configuration.ingress.fqdn" \
    --output tsv
)"

CUSTOM_DOMAIN_VERIFICATION_ID="$(
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --query "properties.customDomainVerificationId" \
    --output tsv
)"

echo "Creating Azure DNS records for custom subdomain..."
EXISTING_SUBDOMAIN_RECORD_TYPES="$(
  az network dns record-set list \
    --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
    --zone-name "${AZURE_DNS_ZONE_NAME}" \
    --query "[?name=='${AZURE_CUSTOM_SUBDOMAIN}'].type" \
    --output tsv
)"

if [[ -n "${EXISTING_SUBDOMAIN_RECORD_TYPES}" ]] && ! printf '%s\n' "${EXISTING_SUBDOMAIN_RECORD_TYPES}" | grep -qx "Microsoft.Network/dnszones/CNAME"; then
  echo "Custom subdomain ${AZURE_CONTAINER_APP_DOMAIN} already exists in Azure DNS with a non-CNAME record type. Please remove or migrate the conflicting record set before bootstrap can repoint it safely." >&2
  exit 1
fi

if ! az network dns record-set cname show \
  --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
  --zone-name "${AZURE_DNS_ZONE_NAME}" \
  --name "${AZURE_CUSTOM_SUBDOMAIN}" >/dev/null 2>&1; then
  az network dns record-set cname create \
    --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
    --zone-name "${AZURE_DNS_ZONE_NAME}" \
    --name "${AZURE_CUSTOM_SUBDOMAIN}" \
    --ttl 300 \
    --output none
fi

az network dns record-set cname set-record \
  --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
  --zone-name "${AZURE_DNS_ZONE_NAME}" \
  --record-set-name "${AZURE_CUSTOM_SUBDOMAIN}" \
  --cname "${CONTAINER_APP_FQDN}" \
  --output none

if ! az network dns record-set txt show \
  --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
  --zone-name "${AZURE_DNS_ZONE_NAME}" \
  --name "asuid.${AZURE_CUSTOM_SUBDOMAIN}" >/dev/null 2>&1; then
  az network dns record-set txt create \
    --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
    --zone-name "${AZURE_DNS_ZONE_NAME}" \
    --name "asuid.${AZURE_CUSTOM_SUBDOMAIN}" \
    --ttl 300 \
    --output none
fi

EXISTING_VERIFICATION_VALUES="$(
  az network dns record-set txt show \
    --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
    --zone-name "${AZURE_DNS_ZONE_NAME}" \
    --name "asuid.${AZURE_CUSTOM_SUBDOMAIN}" \
    --query "txtRecords[].value[]" \
    --output tsv 2>/dev/null || true
)"

if ! printf '%s\n' "${EXISTING_VERIFICATION_VALUES}" | grep -Fxq "${CUSTOM_DOMAIN_VERIFICATION_ID}"; then
  az network dns record-set txt add-record \
    --resource-group "${AZURE_DNS_ZONE_RESOURCE_GROUP}" \
    --zone-name "${AZURE_DNS_ZONE_NAME}" \
    --record-set-name "asuid.${AZURE_CUSTOM_SUBDOMAIN}" \
    --value "${CUSTOM_DOMAIN_VERIFICATION_ID}" \
    --output none
fi

echo "Adding custom hostname to Container App..."
for attempt in 1 2 3 4 5; do
  if az containerapp hostname add \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --hostname "${AZURE_CONTAINER_APP_DOMAIN}" \
    --output none; then
    break
  fi

  if [[ "${attempt}" -eq 5 ]]; then
    echo "Failed to add custom hostname after waiting for DNS propagation." >&2
    exit 1
  fi

  echo "Waiting for DNS propagation before retrying hostname add..."
  sleep 30
done

echo "Verifying custom hostname is attached to Container App..."
if ! az containerapp hostname list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --query "[?name=='${AZURE_CONTAINER_APP_DOMAIN}'] | [0].name" \
  --output tsv | grep -q .; then
  echo "Custom hostname ${AZURE_CONTAINER_APP_DOMAIN} was not attached to ${AZURE_CONTAINER_APP_NAME}." >&2
  exit 1
fi

echo "Binding managed certificate to custom hostname..."
for attempt in 1 2 3 4 5; do
  if az containerapp hostname bind \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --environment "${AZURE_CONTAINER_APPS_ENVIRONMENT}" \
    --hostname "${AZURE_CONTAINER_APP_DOMAIN}" \
    --validation-method CNAME \
    --output none; then
    break
  fi

  if [[ "${attempt}" -eq 5 ]]; then
    echo "Failed to bind custom hostname after waiting for DNS propagation." >&2
    exit 1
  fi

  echo "Waiting for DNS propagation before retrying hostname bind..."
  sleep 30
done

SERVICE_PRINCIPAL_FILE=""
AZURE_CREDENTIALS=""
if [[ "${CREATE_SERVICE_PRINCIPAL}" == "true" ]]; then
  echo "Creating or resetting service principal..."
  SERVICE_PRINCIPAL_FILE="$(mktemp)"
  SCOPE="/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${AZURE_RESOURCE_GROUP}"

  az ad sp create-for-rbac \
    --name "${AZURE_SERVICE_PRINCIPAL_NAME}" \
    --role "${AZURE_SERVICE_PRINCIPAL_ROLE}" \
    --scopes "${SCOPE}" \
    --sdk-auth \
    --output json > "${SERVICE_PRINCIPAL_FILE}"

  AZURE_CREDENTIALS="$(cat "${SERVICE_PRINCIPAL_FILE}")"
fi

cat > "${GITHUB_SYNC_ENV_FILE}" <<EOF
# GitHub sync template for platform/azure/provision/sync-github-env.sh
# Generated by platform/azure/provision/bootstrap-azure.sh

GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-owner/repo}
GITHUB_ENVIRONMENT=${GITHUB_ENVIRONMENT:-}
APP_MODE=${APP_MODE}

AZURE_CREDENTIALS=$(shell_quote "${AZURE_CREDENTIALS}")
APP_BASE_URL=$(shell_quote "${APP_BASE_URL}")
ADMIN_BOOTSTRAP_TOKEN=$(shell_quote "${ADMIN_BOOTSTRAP_TOKEN}")
POSTGRES_ADMIN_PASSWORD=$(shell_quote "${POSTGRES_ADMIN_PASSWORD}")
DATABASE_URL=$(shell_quote "${DATABASE_URL}")

AZURE_RESOURCE_GROUP=${AZURE_RESOURCE_GROUP}
AZURE_LOCATION=${AZURE_LOCATION}
AZURE_CONTAINER_REGISTRY=${AZURE_CONTAINER_REGISTRY}
AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=${AZURE_CONTAINER_REGISTRY_LOGIN_SERVER}
AZURE_CONTAINER_APPS_ENVIRONMENT=${AZURE_CONTAINER_APPS_ENVIRONMENT}
AZURE_CONTAINER_APP_NAME=${AZURE_CONTAINER_APP_NAME}
AZURE_CONTAINER_APP_DOMAIN=${AZURE_CONTAINER_APP_DOMAIN}
AZURE_DNS_ZONE_NAME=${AZURE_DNS_ZONE_NAME}
AZURE_DNS_ZONE_RESOURCE_GROUP=${AZURE_DNS_ZONE_RESOURCE_GROUP}
AZURE_CUSTOM_SUBDOMAIN=${AZURE_CUSTOM_SUBDOMAIN}
AZURE_FILE_SHARE_NAME=${AZURE_FILE_SHARE_NAME}
AZURE_CONTAINER_APP_STORAGE_NAME=${AZURE_CONTAINER_APP_STORAGE_NAME}
AZURE_POSTGRES_SERVER_NAME=${AZURE_POSTGRES_SERVER_NAME}
AZURE_POSTGRES_DATABASE_NAME=${AZURE_POSTGRES_DATABASE_NAME}
AZURE_POSTGRES_ADMIN_USERNAME=${AZURE_POSTGRES_ADMIN_USERNAME}

AZURE_CONTAINER_CPU=${AZURE_CONTAINER_CPU}
AZURE_CONTAINER_MEMORY=${AZURE_CONTAINER_MEMORY}
AZURE_CONTAINER_MIN_REPLICAS=${AZURE_CONTAINER_MIN_REPLICAS}
AZURE_CONTAINER_MAX_REPLICAS=${AZURE_CONTAINER_MAX_REPLICAS}
AZURE_DATA_MOUNT_PATH=${AZURE_DATA_MOUNT_PATH}
SQLITE_PATH=${SQLITE_PATH}
DOCUMENTS_PATH=${DOCUMENTS_PATH}
AUTO_RUN_MIGRATIONS=${AUTO_RUN_MIGRATIONS}
AUTO_SEED_ON_EMPTY_DB=${AUTO_SEED_ON_EMPTY_DB}
APP_NAME=${APP_NAME}
APP_ENV=${APP_ENV}
APP_RUNTIME=${APP_RUNTIME}
API_BASE_PATH=${API_BASE_PATH}
AI_ENABLED=${AI_ENABLED}
DATABASE_PROVIDER=${DATABASE_PROVIDER}
STATIC_SITE_ROOT=${STATIC_SITE_ROOT}
STATIC_API_TEMPLATE=${STATIC_API_TEMPLATE}
AZURE_CONTAINER_PORT=${AZURE_CONTAINER_PORT}
AZURE_HEALTHCHECK_PATH=${AZURE_HEALTHCHECK_PATH}
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_DATABASE=${POSTGRES_DATABASE}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_SSLMODE=${POSTGRES_SSLMODE}
EOF

echo
echo "Provisioning complete."
echo
echo "GitHub Variables"
echo "APP_MODE=${APP_MODE}"
echo "AZURE_RESOURCE_GROUP=${AZURE_RESOURCE_GROUP}"
echo "AZURE_LOCATION=${AZURE_LOCATION}"
echo "AZURE_CONTAINER_REGISTRY=${AZURE_CONTAINER_REGISTRY}"
echo "AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=${AZURE_CONTAINER_REGISTRY_LOGIN_SERVER}"
echo "AZURE_CONTAINER_APPS_ENVIRONMENT=${AZURE_CONTAINER_APPS_ENVIRONMENT}"
echo "AZURE_CONTAINER_APP_NAME=${AZURE_CONTAINER_APP_NAME}"
echo "AZURE_CONTAINER_APP_DOMAIN=${AZURE_CONTAINER_APP_DOMAIN}"
echo "AZURE_DNS_ZONE_NAME=${AZURE_DNS_ZONE_NAME}"
echo "AZURE_DNS_ZONE_RESOURCE_GROUP=${AZURE_DNS_ZONE_RESOURCE_GROUP}"
echo "AZURE_CUSTOM_SUBDOMAIN=${AZURE_CUSTOM_SUBDOMAIN}"
echo "AZURE_FILE_SHARE_NAME=${AZURE_FILE_SHARE_NAME}"
echo "AZURE_CONTAINER_APP_STORAGE_NAME=${AZURE_CONTAINER_APP_STORAGE_NAME}"
echo "AZURE_POSTGRES_SERVER_NAME=${AZURE_POSTGRES_SERVER_NAME}"
echo "AZURE_POSTGRES_DATABASE_NAME=${AZURE_POSTGRES_DATABASE_NAME}"
echo "AZURE_POSTGRES_ADMIN_USERNAME=${AZURE_POSTGRES_ADMIN_USERNAME}"
echo "AZURE_CONTAINER_CPU=${AZURE_CONTAINER_CPU}"
echo "AZURE_CONTAINER_MEMORY=${AZURE_CONTAINER_MEMORY}"
echo "AZURE_CONTAINER_MIN_REPLICAS=${AZURE_CONTAINER_MIN_REPLICAS}"
echo "AZURE_CONTAINER_MAX_REPLICAS=${AZURE_CONTAINER_MAX_REPLICAS}"
echo "AZURE_DATA_MOUNT_PATH=${AZURE_DATA_MOUNT_PATH}"
echo "SQLITE_PATH=${SQLITE_PATH}"
echo "DOCUMENTS_PATH=${DOCUMENTS_PATH}"
echo "AUTO_RUN_MIGRATIONS=${AUTO_RUN_MIGRATIONS}"
echo "AUTO_SEED_ON_EMPTY_DB=${AUTO_SEED_ON_EMPTY_DB}"
echo "APP_NAME=${APP_NAME}"
echo "APP_ENV=${APP_ENV}"
echo "APP_RUNTIME=${APP_RUNTIME}"
echo "API_BASE_PATH=${API_BASE_PATH}"
echo "AI_ENABLED=${AI_ENABLED}"
echo "DATABASE_PROVIDER=${DATABASE_PROVIDER}"
echo "STATIC_SITE_ROOT=${STATIC_SITE_ROOT}"
echo "STATIC_API_TEMPLATE=${STATIC_API_TEMPLATE}"
echo "AZURE_CONTAINER_PORT=${AZURE_CONTAINER_PORT}"
echo "AZURE_HEALTHCHECK_PATH=${AZURE_HEALTHCHECK_PATH}"
if [[ "${APP_MODE}" != "static-web" ]]; then
  echo "POSTGRES_HOST=${POSTGRES_HOST}"
  echo "POSTGRES_PORT=${POSTGRES_PORT}"
  echo "POSTGRES_DATABASE=${POSTGRES_DATABASE}"
  echo "POSTGRES_USER=${POSTGRES_USER}"
  echo "POSTGRES_SSLMODE=${POSTGRES_SSLMODE}"
fi
echo
echo "GitHub Secrets"
echo "APP_BASE_URL=${APP_BASE_URL}"
if [[ "${APP_MODE}" != "static-web" ]]; then
  echo "ADMIN_BOOTSTRAP_TOKEN=${ADMIN_BOOTSTRAP_TOKEN}"
  echo "POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}"
  echo "DATABASE_URL=${DATABASE_URL}"
fi

if [[ -n "${SERVICE_PRINCIPAL_FILE}" ]]; then
  echo
  echo "AZURE_CREDENTIALS JSON"
  cat "${SERVICE_PRINCIPAL_FILE}"
  rm -f "${SERVICE_PRINCIPAL_FILE}"
fi

echo
echo "GitHub sync env file written to ${GITHUB_SYNC_ENV_FILE}"
