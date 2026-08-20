#!/usr/bin/env bash

set -euo pipefail

step() {
  printf '\n[%s] %s\n' "$1" "$2"
}

warn() {
  printf 'WARN: %s\n' "$1" >&2
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

have_command() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1
}

install_with_brew() {
  local formula="$1"
  brew list "${formula}" >/dev/null 2>&1 || brew install "${formula}"
}

install_gh() {
  if have_command gh; then
    return 0
  fi

  warn "GitHub CLI (gh) is missing. Attempting installation..."

  if have_command brew; then
    install_with_brew gh
    return 0
  fi

  if have_command apt-get; then
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg |
      sudo dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null 2>&1
    sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" |
      sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y gh
    return 0
  fi

  if have_command yum; then
    sudo yum install -y 'dnf-command(config-manager)' || true
    sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
    sudo yum install -y gh
    return 0
  fi

  fail "Could not install gh automatically. Install it manually and rerun this script."
}

install_az() {
  if have_command az; then
    return 0
  fi

  warn "Azure CLI (az) is missing. Attempting installation..."

  if have_command brew; then
    install_with_brew azure-cli
    return 0
  fi

  if have_command apt-get; then
    curl -fsSL https://aka.ms/InstallAzureCLIDeb | sudo bash
    return 0
  fi

  if have_command yum; then
    sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
    cat <<'EOF' | sudo tee /etc/yum.repos.d/azure-cli.repo >/dev/null
[azure-cli]
name=Azure CLI
baseurl=https://packages.microsoft.com/yumrepos/azure-cli
enabled=1
gpgcheck=1
gpgkey=https://packages.microsoft.com/keys/microsoft.asc
EOF
    sudo yum install -y azure-cli
    return 0
  fi

  fail "Could not install az automatically. Install it manually and rerun this script."
}

require_core_tools() {
  have_command bash || fail "Missing required command: bash"
  have_command curl || fail "Missing required command: curl"
}

step "1/7" "Checking local bootstrap tools"
require_core_tools

step "2/7" "Ensuring Azure CLI and GitHub CLI are installed"
install_az
install_gh

have_command az || fail "Azure CLI is still unavailable after installation attempt."
have_command gh || fail "GitHub CLI is still unavailable after installation attempt."

step "3/7" "Showing Azure CLI version"
az version --output table || fail "Unable to run 'az version'"

step "4/7" "Showing GitHub CLI version"
gh --version || fail "Unable to run 'gh --version'"

step "5/7" "Checking Azure authentication"
if az account show --output table >/dev/null 2>&1; then
  az account show --output table
else
  warn "No active Azure session found."
  warn "Starting Azure login flow..."
  az login || {
    warn "Azure login did not complete successfully."
    exit 2
  }
  az account show --output table || fail "Azure login completed, but no active subscription is available."
fi

step "6/7" "Checking GitHub authentication"
if gh auth status >/dev/null 2>&1; then
  gh auth status
else
  warn "No active GitHub CLI session found."
  warn "Starting GitHub CLI login flow..."
  if ! gh auth login; then
    warn "GitHub CLI login returned a non-zero status. Checking whether authentication still succeeded..."
  fi
  gh auth status || fail "GitHub CLI login completed, but no active GitHub session is available."
fi

step "7/7" "Running lightweight Azure API reachability checks"
SUBSCRIPTION_ID="$(az account show --query id --output tsv)" || fail "Unable to read Azure subscription id"
TENANT_ID="$(az account show --query tenantId --output tsv)" || fail "Unable to read Azure tenant id"

printf 'Azure subscription: %s\n' "${SUBSCRIPTION_ID}"
printf 'Azure tenant: %s\n' "${TENANT_ID}"

if ! az group list --output table >/dev/null 2>&1; then
  fail "Azure CLI is installed and logged in, but listing resource groups failed."
fi

printf '\nPreflight passed.\n'
printf 'Next recommended steps:\n'
printf '1. Review %s as the tracked template\n' "ci/.env.azure-provision.example"
printf '2. Generate/load local values with: bash platform/azure/provision/setup-azure-provision-env.sh\n'
printf '3. Run: bash platform/azure/provision/bootstrap-azure.sh\n'
printf '4. Review %s as the tracked GitHub sync template\n' "ci/.env.github-sync.example"
printf '5. Run: bash platform/azure/provision/sync-github-env.sh\n'
