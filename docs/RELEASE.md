# Release guide

CostGate OSS 配布手順（**@costgate/cli** + Probe npm + Gate GitHub Releases）。

## ユーザー向け導線（推奨）

```bash
npx @costgate/cli@latest init
```

`init` が Gate バイナリ（GitHub Releases）と `mcp.json` / `hooks.json` を設定します。

## リリース（メンテナ）

**前提:** GitHub repo secret `NPM_TOKEN`（npm automation token）

```bash
npm ci && npm run build && npm run publish:check
npm run release:check   # goreleaser

git tag v0.6.0
git push origin v0.6.0
```

tag `v*` push で CI が並行実行:

| Workflow | 成果物 |
|----------|--------|
| `release.yml` | `costgate-gate` バイナリ（GitHub Releases） |
| `npm-publish.yml` | `@costgate/schema`, `@costgate/probe`, `@costgate/cli` |

## @costgate/cli — npm publish

- `packages/cli` の `prepublishOnly` で `scripts/` + `catalog/` を `runtime/` にコピー
- CLI の `postinstall` は **なし**（バイナリ取得は `init` / `update` で明示実行）

ローカル dry-run:

```bash
npm run build -w @costgate/cli
npm pack -w @costgate/cli
```

## Gate — GitHub Releases

```bash
npm run build:gate
goreleaser release --clean   # tag push で CI release.yml も可
```

バイナリのみ（Dashboard なし）:

```bash
./scripts/install-gate.sh
# または costgate init が ~/.costgate/bin/ に配置
```

## Probe — npm

```bash
npx @costgate/probe   # 計測専用
```

## バージョン整合

```bash
npm run publish:check
```

`@costgate/schema` / `@costgate/probe` / `@costgate/cli` の version が一致すること。

## 開発者向け Cursor 切替（clone）

```bash
npm run docker:update
# または
npm run build:gate && npm run cursor:production
```

## リリース後

1. [docs/benchmarks.md](./benchmarks.md) に計測値が変われば追記
2. `npm run eval -- --out test/eval/baseline.json` で baseline 更新
3. Release notes に Gate バイナリ + npm パッケージ版本を記載
