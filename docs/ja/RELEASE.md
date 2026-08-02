# リリース手順

> **言語:** [English](../RELEASE.md) · 日本語（このファイル）

CostGate OSS 配布手順（**@costgate/cli** + Probe npm + Gate GitHub Releases）。

## ユーザー向け導線（推奨）

```bash
npx @costgate/cli@latest init
```

`init` が Gate バイナリ（GitHub Releases）と `mcp.json` / `hooks.json` を設定します。

## リリース（メンテナ）

**前提:** GitHub repo secret `NPM_TOKEN`（npm automation token）

リリース頻度は固定していません（初期は速くなる想定）。手順は常に同じです。

### 1. リポジトリ内のバージョンを上げる

```bash
npm run release:version -- 1.0.0 --note "初回 OSS リリース"
npm run publish:check
npm run release:check   # goreleaser
```

`packages/*/package.json`・probe の schema 依存・`CHANGELOG.md` を更新します。

### 2. リリース PR を出す

```bash
git add packages CHANGELOG.md
npm run feat:ship -- -m "chore: release v1.0.0"
```

CI と auto-merge は GitHub Actions が担当します。

### 3. マージ後に tag push

```bash
git checkout main && git pull origin main
git tag v1.0.0
git push origin v1.0.0
```

tag `v*` push で CI が並行実行:

| Workflow | 成果物 |
|----------|--------|
| `release.yml` | `costgate-gate` バイナリ（GitHub Releases） |
| `npm-publish.yml` | `@costgate/schema`, `@costgate/probe`, `@costgate/cli` |

`npm-publish.yml` は **repo 内の version が tag と一致すること**を検証します（CI での書き換えはしません）。

## @costgate/cli — npm publish

- `packages/cli` の `prepublishOnly` で `scripts/` + `catalog/` を `runtime/` にコピー
- CLI の `postinstall` は **なし**（バイナリ取得は `init` / `update` で明示実行）

## Gate — GitHub Releases

```bash
npm run build:gate
goreleaser release --clean
```

## バージョン整合

```bash
npm run publish:check
```

`@costgate/schema` / `@costgate/probe` / `@costgate/cli` の version が repo 内で一致すること。

## 開発者向け Cursor 切替（clone）

```bash
npm run docker:update
# または
npm run build:gate && npm run cursor:production
```

## リリース後

1. [docs/benchmarks.md](./benchmarks.md) に計測値が変われば追記
2. `npm run eval -- --out test/eval/baseline.json` で baseline 更新
3. GitHub Release と npm の版本を確認
