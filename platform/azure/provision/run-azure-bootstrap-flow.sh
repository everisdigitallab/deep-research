#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROVISION_ENV_FILE="${ROOT_DIR}/ci/.env.azure-provision.local"
GITHUB_SYNC_ENV_FILE="${ROOT_DIR}/ci/.env.github-sync.local"

prompt_required() {
  local var_name="$1"
  local prompt_text="$2"
  local value=""

  while [[ -z "${value}" ]]; do
    read -r -p "${prompt_text}: " value
    value="$(printf '%s' "${value}" | xargs)"
  done

  printf -v "${var_name}" '%s' "${value}"
}

prompt_github_repository() {
  local var_name="$1"
  local default_value="${2:-}"
  local value=""

  while true; do
    if [[ -n "${default_value}" ]]; then
      read -r -p "GitHub repository (owner/repo) [${default_value}]: " value
    else
      read -r -p "GitHub repository (owner/repo): " value
    fi
    value="$(printf '%s' "${value}" | xargs)"

    if [[ -z "${value}" ]]; then
      value="${default_value}"
    fi

    if [[ "${value}" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]]; then
      printf -v "${var_name}" '%s' "${value}"
      return 0
    fi

    echo "Please enter the repository in owner/repo format."
  done
}

prompt_optional() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="${3:-}"
  local value=""

  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt_text} [${default_value}]: " value
  else
    read -r -p "${prompt_text}: " value
  fi

  value="$(printf '%s' "${value}" | xargs)"
  if [[ -z "${value}" ]]; then
    value="${default_value}"
  fi

  printf -v "${var_name}" '%s' "${value}"
}

prompt_yes_no() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="$3"
  local value=""
  local normalized_default

  normalized_default="$(printf '%s' "${default_value}" | tr '[:upper:]' '[:lower:]')"

  while true; do
    if [[ "${normalized_default}" == "true" ]]; then
      read -r -p "${prompt_text} [Y/n]: " value
    else
      read -r -p "${prompt_text} [y/N]: " value
    fi

    value="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]' | xargs)"
    if [[ -z "${value}" ]]; then
      value="${normalized_default}"
    elif [[ "${value}" == "y" || "${value}" == "yes" ]]; then
      value="true"
    elif [[ "${value}" == "n" || "${value}" == "no" ]]; then
      value="false"
    fi

    if [[ "${value}" == "true" || "${value}" == "false" ]]; then
      printf -v "${var_name}" '%s' "${value}"
      return 0
    fi
  done
}

step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

detect_github_repository_from_remote() {
  local remote_url=""

  if ! remote_url="$(git -C "${ROOT_DIR}" remote get-url origin 2>/dev/null)"; then
    return 1
  fi

  if [[ "${remote_url}" =~ ^git@github\.com:([^[:space:]]+)\.git$ ]]; then
    DETECTED_GITHUB_REPOSITORY="${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${remote_url}" =~ ^https://github\.com/([^[:space:]]+)\.git$ ]]; then
    DETECTED_GITHUB_REPOSITORY="${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${remote_url}" =~ ^https://github\.com/([^[:space:]]+)$ ]]; then
    DETECTED_GITHUB_REPOSITORY="${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

ensure_git_repository() {
  if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  git -C "${ROOT_DIR}" init
}

ensure_git_remote_origin() {
  local repo_slug="$1"
  local remote_url="git@github.com:${repo_slug}.git"
  local current_remote_url=""

  if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    ensure_git_repository
  fi

  if current_remote_url="$(git -C "${ROOT_DIR}" remote get-url origin 2>/dev/null)"; then
    if [[ "${current_remote_url}" == "${remote_url}" || "${current_remote_url}" == "https://github.com/${repo_slug}.git" || "${current_remote_url}" == "https://github.com/${repo_slug}" ]]; then
      return 0
    fi

    git -C "${ROOT_DIR}" remote set-url origin "${remote_url}"
    return 0
  fi

  git -C "${ROOT_DIR}" remote add origin "${remote_url}"
}

step "1/5" "Collecting project settings and generating Azure provision env"
bash "${ROOT_DIR}/platform/azure/provision/setup-azure-provision-env.sh"

set -a
# shellcheck disable=SC1090
source "${PROVISION_ENV_FILE}"
set +a

printf 'Selected APP_MODE=%s\n' "${APP_MODE:-app-runtime}"

step "2/5" "Running local preflight checks"
bash "${ROOT_DIR}/platform/azure/provision/preflight-genspark.sh"

step "3/5" "Provisioning Azure resources"
bash "${ROOT_DIR}/platform/azure/provision/bootstrap-azure.sh"

if [[ ! -f "${GITHUB_SYNC_ENV_FILE}" ]]; then
  echo "Expected GitHub sync env file was not generated: ${GITHUB_SYNC_ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${GITHUB_SYNC_ENV_FILE}"
set +a

step "4/5" "Collecting GitHub sync settings"
if [[ -z "${GITHUB_REPOSITORY:-}" ]] && detect_github_repository_from_remote; then
  GITHUB_REPOSITORY="${DETECTED_GITHUB_REPOSITORY}"
fi
prompt_github_repository GITHUB_REPOSITORY "${GITHUB_REPOSITORY:-}"
prompt_optional GITHUB_ENVIRONMENT "GitHub environment name (leave blank for repo-level secrets)" "${GITHUB_ENVIRONMENT:-}"

if ! gh repo view "${GITHUB_REPOSITORY}" >/dev/null 2>&1; then
  echo "GitHub repository ${GITHUB_REPOSITORY} does not exist or is not accessible with the current gh session."
  prompt_yes_no CREATE_GITHUB_REPO "Create ${GITHUB_REPOSITORY} now with GitHub CLI" "true"

  if [[ "${CREATE_GITHUB_REPO}" == "true" ]]; then
    prompt_optional GITHUB_REPO_VISIBILITY "Repository visibility" "private"
    if [[ "${GITHUB_REPO_VISIBILITY}" != "private" && "${GITHUB_REPO_VISIBILITY}" != "public" && "${GITHUB_REPO_VISIBILITY}" != "internal" ]]; then
      echo "Repository visibility must be one of: private, public, internal." >&2
      exit 1
    fi

    gh repo create "${GITHUB_REPOSITORY}" "--${GITHUB_REPO_VISIBILITY}"
  else
    echo "Cannot continue GitHub sync without an existing repository." >&2
    exit 1
  fi
fi

ensure_git_remote_origin "${GITHUB_REPOSITORY}"

python3 - <<'PY' "${GITHUB_SYNC_ENV_FILE}" "${GITHUB_REPOSITORY}" "${GITHUB_ENVIRONMENT}"
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
repo = sys.argv[2]
env = sys.argv[3]
text = path.read_text()
text = re.sub(r'^GITHUB_REPOSITORY=.*$', f'GITHUB_REPOSITORY={repo}', text, flags=re.M)
text = re.sub(r'^GITHUB_ENVIRONMENT=.*$', f'GITHUB_ENVIRONMENT={env}', text, flags=re.M)
path.write_text(text)
PY

set -a
# shellcheck disable=SC1090
source "${GITHUB_SYNC_ENV_FILE}"
set +a

step "5/5" "Syncing GitHub secrets and variables"
bash "${ROOT_DIR}/platform/azure/provision/sync-github-env.sh"

printf '\nAzure bootstrap flow complete.\n'
printf 'CI configuration is now synced for %s.\n' "${GITHUB_REPOSITORY}"
