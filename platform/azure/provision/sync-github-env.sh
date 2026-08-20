#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/ci/.env.github-sync.local"
FALLBACK_ENV_FILE="${ROOT_DIR}/ci/.env.github-sync.example"
WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-${ROOT_DIR}/webapp/.env}"

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

# Keep runtime credentials local, then promote their values to GitHub below.
# The .env file is intentionally never copied into the repository or image.
if [[ -f "${WEBAPP_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${WEBAPP_ENV_FILE}"
  set +a
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
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

command -v gh >/dev/null 2>&1 || {
  echo "GitHub CLI (gh) is required." >&2
  exit 1
}

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
GITHUB_ENVIRONMENT="${GITHUB_ENVIRONMENT:-}"
APP_MODE="${APP_MODE:-app-runtime}"

require_env GITHUB_REPOSITORY
require_env AZURE_CREDENTIALS
validate_app_mode "${APP_MODE}"
require_env AZURE_RESOURCE_GROUP
require_env AZURE_LOCATION
require_env AZURE_CONTAINER_REGISTRY
require_env AZURE_CONTAINER_REGISTRY_LOGIN_SERVER
require_env AZURE_CONTAINER_APPS_ENVIRONMENT
require_env AZURE_CONTAINER_APP_NAME
require_env AZURE_CONTAINER_APP_DOMAIN
require_env AZURE_DNS_ZONE_NAME
require_env AZURE_CUSTOM_SUBDOMAIN
require_env AZURE_FILE_SHARE_NAME
require_env AZURE_CONTAINER_APP_STORAGE_NAME
require_env APP_BASE_URL

set_repository_variable() {
  local name="$1"
  local value="$2"
  gh variable set "${name}" --repo "${GITHUB_REPOSITORY}" --body "${value}"
}

if [[ -n "${GITHUB_ENVIRONMENT}" ]]; then
  # This selector must be repository-scoped so the job can choose the
  # environment before resolving its environment-scoped credentials.
  set_repository_variable DEPLOYMENT_ENVIRONMENT "${GITHUB_ENVIRONMENT}"
fi

set_secret() {
  local name="$1"
  local value="$2"
  if [[ -n "${GITHUB_ENVIRONMENT}" ]]; then
    printf '%s' "${value}" | gh secret set "${name}" --repo "${GITHUB_REPOSITORY}" --env "${GITHUB_ENVIRONMENT}"
  else
    printf '%s' "${value}" | gh secret set "${name}" --repo "${GITHUB_REPOSITORY}"
  fi
}

set_secret_if_value() {
  local name="$1"
  local value="${2:-}"
  if [[ -n "${value}" ]]; then
    set_secret "${name}" "${value}"
  fi
}

set_variable() {
  local name="$1"
  local value="$2"
  if [[ -n "${GITHUB_ENVIRONMENT}" ]]; then
    gh variable set "${name}" --repo "${GITHUB_REPOSITORY}" --env "${GITHUB_ENVIRONMENT}" --body "${value}"
  else
    gh variable set "${name}" --repo "${GITHUB_REPOSITORY}" --body "${value}"
  fi
}

set_variable_if_value() {
  local name="$1"
  local value="${2:-}"
  if [[ -n "${value}" ]]; then
    set_variable "${name}" "${value}"
  fi
}

if [[ "${APP_MODE}" != "static-web" ]]; then
  require_env AZURE_POSTGRES_SERVER_NAME
  require_env AZURE_POSTGRES_DATABASE_NAME
  require_env AZURE_POSTGRES_ADMIN_USERNAME
  require_env ADMIN_BOOTSTRAP_TOKEN
  require_env DATABASE_URL
  require_env POSTGRES_ADMIN_PASSWORD
fi

echo "Setting GitHub Variables on ${GITHUB_REPOSITORY}${GITHUB_ENVIRONMENT:+ (environment: ${GITHUB_ENVIRONMENT})}..."
set_variable APP_MODE "${APP_MODE}"
set_variable AZURE_RESOURCE_GROUP "${AZURE_RESOURCE_GROUP}"
set_variable AZURE_LOCATION "${AZURE_LOCATION}"
set_variable AZURE_CONTAINER_REGISTRY "${AZURE_CONTAINER_REGISTRY}"
set_variable AZURE_CONTAINER_REGISTRY_LOGIN_SERVER "${AZURE_CONTAINER_REGISTRY_LOGIN_SERVER}"
set_variable AZURE_CONTAINER_APPS_ENVIRONMENT "${AZURE_CONTAINER_APPS_ENVIRONMENT}"
set_variable AZURE_CONTAINER_APP_NAME "${AZURE_CONTAINER_APP_NAME}"
set_variable AZURE_CONTAINER_APP_DOMAIN "${AZURE_CONTAINER_APP_DOMAIN}"
set_variable AZURE_DNS_ZONE_NAME "${AZURE_DNS_ZONE_NAME}"
set_variable AZURE_DNS_ZONE_RESOURCE_GROUP "${AZURE_DNS_ZONE_RESOURCE_GROUP:-${AZURE_RESOURCE_GROUP}}"
set_variable AZURE_CUSTOM_SUBDOMAIN "${AZURE_CUSTOM_SUBDOMAIN}"
set_variable AZURE_FILE_SHARE_NAME "${AZURE_FILE_SHARE_NAME}"
set_variable AZURE_CONTAINER_APP_STORAGE_NAME "${AZURE_CONTAINER_APP_STORAGE_NAME}"
set_variable AZURE_CONTAINER_CPU "${AZURE_CONTAINER_CPU:-1}"
set_variable AZURE_CONTAINER_MEMORY "${AZURE_CONTAINER_MEMORY:-2}"
set_variable AZURE_CONTAINER_MIN_REPLICAS "${AZURE_CONTAINER_MIN_REPLICAS:-0}"
set_variable AZURE_CONTAINER_MAX_REPLICAS "${AZURE_CONTAINER_MAX_REPLICAS:-3}"
set_variable_if_value AZURE_DATA_MOUNT_PATH "${AZURE_DATA_MOUNT_PATH:-}"
set_variable_if_value SQLITE_PATH "${SQLITE_PATH:-}"
set_variable_if_value DOCUMENTS_PATH "${DOCUMENTS_PATH:-}"
set_variable AUTO_RUN_MIGRATIONS "${AUTO_RUN_MIGRATIONS:-true}"
set_variable AUTO_SEED_ON_EMPTY_DB "${AUTO_SEED_ON_EMPTY_DB:-false}"
set_variable APP_NAME "${APP_NAME:-app}"
set_variable APP_ENV "${APP_ENV:-production}"
set_variable APP_RUNTIME "${APP_RUNTIME:-azure-container-apps}"
set_variable API_BASE_PATH "${API_BASE_PATH:-/api}"
set_variable AI_ENABLED "${AI_ENABLED:-false}"
set_variable STATIC_SITE_ROOT "${STATIC_SITE_ROOT:-webapp}"
set_variable_if_value STATIC_API_TEMPLATE "${STATIC_API_TEMPLATE:-}"
set_variable AZURE_CONTAINER_PORT "${AZURE_CONTAINER_PORT:-3000}"
set_variable AZURE_HEALTHCHECK_PATH "${AZURE_HEALTHCHECK_PATH:-/api/health}"
set_variable_if_value DATABASE_PROVIDER "${DATABASE_PROVIDER:-}"
set_variable_if_value OPENAI_BASE_URL "${OPENAI_BASE_URL:-}"
set_variable_if_value NEXT_PUBLIC_GPTR_API_URL "${NEXT_PUBLIC_GPTR_API_URL:-}"
set_variable_if_value ENDPOINT_URL "${ENDPOINT_URL:-}"
set_variable_if_value DEPLOYMENT_NAME "${DEPLOYMENT_NAME:-}"
set_variable_if_value AZURE_OPENAI_ENDPOINT "${AZURE_OPENAI_ENDPOINT:-}"
set_variable_if_value AZURE_OPENAI_API_VERSION "${AZURE_OPENAI_API_VERSION:-}"
set_variable_if_value AZURE_API_VERSION "${AZURE_API_VERSION:-}"
set_variable_if_value FAST_LLM "${FAST_LLM:-}"
set_variable_if_value SMART_LLM "${SMART_LLM:-}"
set_variable_if_value STRATEGIC_LLM "${STRATEGIC_LLM:-}"
set_variable_if_value EMBEDDING "${EMBEDDING:-}"
set_variable_if_value DOC_PATH "${DOC_PATH:-}"
set_variable_if_value MAX_SCRAPER_WORKERS "${MAX_SCRAPER_WORKERS:-}"
set_variable_if_value SCRAPER_RATE_LIMIT_DELAY "${SCRAPER_RATE_LIMIT_DELAY:-}"
set_variable_if_value COMPRESSION_THRESHOLD "${COMPRESSION_THRESHOLD:-}"
set_variable_if_value LANGCHAIN_TRACING_V2 "${LANGCHAIN_TRACING_V2:-}"
set_variable_if_value LANGCHAIN_ENDPOINT "${LANGCHAIN_ENDPOINT:-}"
set_variable_if_value LANGCHAIN_PROJECT "${LANGCHAIN_PROJECT:-}"
set_variable_if_value FAST_TOKEN_LIMIT "${FAST_TOKEN_LIMIT:-}"
set_variable_if_value SMART_TOKEN_LIMIT "${SMART_TOKEN_LIMIT:-}"
set_variable_if_value STRATEGIC_TOKEN_LIMIT "${STRATEGIC_TOKEN_LIMIT:-}"

if [[ "${APP_MODE}" != "static-web" ]]; then
  set_variable AZURE_POSTGRES_SERVER_NAME "${AZURE_POSTGRES_SERVER_NAME}"
  set_variable AZURE_POSTGRES_DATABASE_NAME "${AZURE_POSTGRES_DATABASE_NAME}"
  set_variable AZURE_POSTGRES_ADMIN_USERNAME "${AZURE_POSTGRES_ADMIN_USERNAME}"
  set_variable POSTGRES_HOST "${POSTGRES_HOST}"
  set_variable POSTGRES_PORT "${POSTGRES_PORT:-5432}"
  set_variable POSTGRES_DATABASE "${POSTGRES_DATABASE}"
  set_variable POSTGRES_USER "${POSTGRES_USER}"
  set_variable POSTGRES_SSLMODE "${POSTGRES_SSLMODE:-require}"
fi

echo "Setting GitHub Secrets on ${GITHUB_REPOSITORY}${GITHUB_ENVIRONMENT:+ (environment: ${GITHUB_ENVIRONMENT})}..."
set_secret AZURE_CREDENTIALS "${AZURE_CREDENTIALS}"
set_secret APP_BASE_URL "${APP_BASE_URL}"
set_secret_if_value OPENAI_API_KEY "${OPENAI_API_KEY:-}"
set_secret_if_value TAVILY_API_KEY "${TAVILY_API_KEY:-}"
set_secret_if_value XQUIK_API_KEY "${XQUIK_API_KEY:-}"
set_secret_if_value AZURE_OPENAI_API_KEY "${AZURE_OPENAI_API_KEY:-}"
set_secret_if_value LANGCHAIN_API_KEY "${LANGCHAIN_API_KEY:-}"
if [[ "${APP_MODE}" != "static-web" ]]; then
  set_secret ADMIN_BOOTSTRAP_TOKEN "${ADMIN_BOOTSTRAP_TOKEN}"
  set_secret DATABASE_URL "${DATABASE_URL}"
  set_secret POSTGRES_ADMIN_PASSWORD "${POSTGRES_ADMIN_PASSWORD}"
else
  set_secret_if_value ADMIN_BOOTSTRAP_TOKEN "${ADMIN_BOOTSTRAP_TOKEN:-}"
fi

echo "GitHub configuration sync complete."
