# Gate releases

`costgate-gate` is distributed as **GitHub Release binaries** (no Go required on the host).

## Install

```bash
chmod +x scripts/install-gate.sh
./scripts/install-gate.sh              # latest
./scripts/install-gate.sh v0.4.0       # specific tag
INSTALL_DIR=/usr/local/bin ./scripts/install-gate.sh
```

Add `~/.local/bin` to `PATH` if needed.

## Verify

```bash
costgate-gate --version
# costgate-gate 0.4.0 (abc1234)
```

## Platforms

| OS | Arch | Archive |
|----|------|---------|
| linux | amd64, arm64 | `.tar.gz` |
| darwin | amd64, arm64 | `.tar.gz` |
| windows | amd64, arm64 | `.zip` |

Asset name: `costgate-gate_{version}_{os}_{arch}.{tar.gz|zip}`

## Maintainer: cut a release

1. Merge changes to `main`
2. Tag and push:

```bash
git tag v0.4.0
git push origin v0.4.0
```

3. GitHub Actions runs:
   - **`release.yml`** — goreleaser → Gate binaries
   - **`npm-publish.yml`** — `@costgate/schema` + `@costgate/probe` to npm (requires `NPM_TOKEN`)

Local dry-run (requires [goreleaser](https://goreleaser.com/) installed):

```bash
npm run release:check    # goreleaser check
goreleaser release --snapshot --clean
# dist/ にバイナリ（GitHub には upload しない）
```

## npm (Probe)

Same tag `v*` publishes `@costgate/probe` and `@costgate/schema` to npm.

```bash
npx @costgate/probe@latest
```

Set repository secret **`NPM_TOKEN`** (npm automation token with publish scope).

## Cursor setup

After install, point `~/.cursor/mcp.json` at the binary:

```json
{
  "mcpServers": {
    "costgate-gate": {
      "command": "/home/you/.local/bin/costgate-gate",
      "env": {
        "COSTGATE_CONFIG": "/home/you/.costgate/backends.json",
        "COSTGATE_COMPRESS": "1"
      }
    }
  }
}
```

Or use `npm run cursor:production` when building from a cloned repo.
