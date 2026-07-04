#!/usr/bin/env bash
# CostGate GitHub setup — run after: gh auth login
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

ORG_NAME="${COSTGATE_ORG:-costgate}"
GITHUB_USER=$(gh api user --jq .login)

echo "==> GitHub user: $GITHUB_USER"
gh auth status

# Create organization (skip if exists)
if gh api "orgs/$ORG_NAME" &>/dev/null; then
  echo "==> Organization $ORG_NAME already exists"
else
  echo "==> Creating organization: $ORG_NAME"
  gh org create "$ORG_NAME" --description "Gate your MCP. Cut your bill." || {
    echo "WARN: Could not create org '$ORG_NAME'. Using user account: $GITHUB_USER"
    ORG_NAME="$GITHUB_USER"
  }
fi

# Public repo: costgate
if gh repo view "$ORG_NAME/costgate" &>/dev/null; then
  echo "==> Repo $ORG_NAME/costgate already exists"
else
  echo "==> Creating public repo: $ORG_NAME/costgate"
  gh repo create "$ORG_NAME/costgate" \
    --public \
    --description "Gate your MCP. Cut your bill. — MCP token optimization (Probe + Gate)" \
    --homepage "https://github.com/$ORG_NAME/costgate"
fi

cd /home/yuki/work/costgate
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$ORG_NAME/costgate.git"
git push -u origin main

# Private repo: costgate-cloud
if gh repo view "$ORG_NAME/costgate-cloud" &>/dev/null; then
  echo "==> Repo $ORG_NAME/costgate-cloud already exists"
else
  echo "==> Creating private repo: $ORG_NAME/costgate-cloud"
  gh repo create "$ORG_NAME/costgate-cloud" \
    --private \
    --description "CostGate commercial platform (Pro / Team / Enterprise)" \
    --homepage "https://github.com/$ORG_NAME/costgate"
fi

cd /home/yuki/work/costgate-cloud
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$ORG_NAME/costgate-cloud.git"
git push -u origin main

echo ""
echo "==> Done!"
echo "    Public:  https://github.com/$ORG_NAME/costgate"
echo "    Private: https://github.com/$ORG_NAME/costgate-cloud"
