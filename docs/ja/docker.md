# Docker 開発環境

> **言語:** [English](../docker.md) · 日本語（このファイル）

CostGate uses Docker for **toolchain isolation** (Node + Go). Cursor still runs MCP on the **host** — the binary path in `mcp.json` is always a host path.

## Quick start (Docker only — no host Node/Go)

```bash
cd costgate

# 初回セットアップ（install + build + gate）
chmod +x docker.sh
./docker.sh npm install
./docker.sh npm run build
./docker.sh npm run build:gate

# または npm がある場合
npm run docker:setup
```

Cursor 用 MCP 設定:

```bash
./docker.sh node scripts/cursor-mcp.mjs production
# Reload Window
```

## 日常コマンド

| ホスト Node あり | Docker のみ |
|------------------|-------------|
| `npm run build` | `./docker.sh npm run build` |
| `npm run build:gate` | `./docker.sh npm run build:gate` |
| `npm run compare` | `./docker.sh npm run compare` |
| `npm run cursor:update` | `npm run docker:update`（いずれもローカル再ビルド） |

汎用ラッパー:

```bash
./docker.sh npm run test:tokens
npm run docker -- npm run compress-report   # ホストに npm がある場合
```

## toolchain サービス

`docker-compose.dev.yml` の `toolchain` = **Node 22 + Go 1.25**（`.docker/Dockerfile`）。

マウント:

| ホスト | 用途 |
|--------|------|
| リポジトリ `./` | ソース・ビルド成果物 |
| `~/.costgate` | backends.json / Probe ログ |
| `~/.cursor` | `cursor:production` が `mcp.json` を更新 |

環境変数 `COSTGATE_HOST_ROOT=${PWD}` により、コンテナ内から `cursor:production` しても **ホスト絶対パス** が `mcp.json` に書き込まれます。

## What Docker is NOT for

- MCP プロセス自体を Compose 常駐させること（Cursor はホストから stdio spawn）
- `feat:ship` / `gh`（ホストの git 認証が必要。ビルド・計測は Docker で OK）

## Dev Container

Command Palette → **Dev Containers: Reopen in Container**

`.devcontainer/` + `toolchain` イメージ。コンテナ内ターミナルでは通常の `npm run build` がそのまま使えます。

## Legacy

```bash
docker compose -f docker-compose.dev.yml run --rm toolchain bash
```

`dev` / `go` サービス名は `toolchain` のエイリアスです。
