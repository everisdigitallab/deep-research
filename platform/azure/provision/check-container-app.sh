#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/ci/.env.azure-provision.local"
FALLBACK_ENV_FILE="${ROOT_DIR}/ci/.env.azure-provision.example"

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

step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

command -v az >/dev/null 2>&1 || {
  echo "Azure CLI (az) is required." >&2
  exit 1
}

require_env AZURE_SUBSCRIPTION_ID
require_env AZURE_RESOURCE_GROUP
require_env AZURE_CONTAINER_APP_NAME

az account set --subscription "${AZURE_SUBSCRIPTION_ID}"

step "1/6" "Container App summary"
az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --query "{fqdn:properties.configuration.ingress.fqdn,image:properties.template.containers[0].image,targetPort:properties.configuration.ingress.targetPort,external:properties.configuration.ingress.external,provisioningState:properties.provisioningState,runningStatus:properties.runningStatus,latestRevision:properties.latestRevisionName}" \
  --output table

step "2/6" "Revision status"
az containerapp revision list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${AZURE_CONTAINER_APP_NAME}" \
  --query "[].{name:name,active:properties.active,trafficWeight:properties.trafficWeight,healthState:properties.healthState,provisioningState:properties.provisioningState,replicas:properties.replicas}" \
  --output table

LATEST_REVISION="$(
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --query "properties.latestRevisionName" \
    --output tsv
)"

if [[ -n "${LATEST_REVISION}" && "${LATEST_REVISION}" != "null" ]]; then
  step "3/6" "Replica status for latest revision"
  if ! az containerapp replica list \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --revision "${LATEST_REVISION}" \
    --output table; then
    echo "No replica information was returned for ${LATEST_REVISION}."
  fi

  step "4/6" "Recent logs for latest revision"
  if ! az containerapp logs show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --revision "${LATEST_REVISION}" \
    --tail 100; then
    echo "Could not fetch logs for ${LATEST_REVISION}. This usually means the revision never reached a runnable state."
  fi
else
  step "3/6" "Replica status for latest revision"
  echo "No latest revision was reported by Azure."
  step "4/6" "Recent logs for latest revision"
  echo "Skipped because no latest revision was found."
fi

step "5/6" "Health endpoint probe"
APP_FQDN="$(
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${AZURE_CONTAINER_APP_NAME}" \
    --query "properties.configuration.ingress.fqdn" \
    --output tsv
)"

if [[ -n "${APP_FQDN}" && "${APP_FQDN}" != "null" ]]; then
  if command -v curl >/dev/null 2>&1; then
    CURL_ARGS=(--silent --show-error --max-time 15)

    if [[ "${SKIP_TLS_VERIFY:-false}" == "true" ]]; then
      CURL_ARGS+=(--insecure)
    fi

    if ! curl "${CURL_ARGS[@]}" "https://${APP_FQDN}/api/health"; then
      echo
      echo "Health probe failed."
      echo "If the error is local certificate verification only, rerun with SKIP_TLS_VERIFY=true."
    else
      echo
    fi
  else
    echo "curl is not installed, skipping HTTP probe."
  fi
else
  echo "No ingress FQDN is configured yet."
fi

step "6/6" "Troubleshooting hints"
cat <<'EOF'
If the revision exists but has no healthy replica:
- verify ingress target port is 3000:
  az containerapp ingress update --resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_CONTAINER_APP_NAME" --target-port 3000 --type external --transport auto
- confirm the active image is the app image, not the bootstrap hello-world image
- inspect the logs above for startup failures or image pull/authentication errors

If the only failure is TLS verification from your machine:
- import your corporate proxy/root CA into the trust store used by Azure CLI and curl
- or use SKIP_TLS_VERIFY=true only for temporary local diagnostics
EOF
