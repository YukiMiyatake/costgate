# Release guide

CostGate OSS 配布手順（Probe npm + Gate GitHub Releases）。

## Probe — npm publish

**前提:** GitHub repo secret `NPM_TOKEN`（npm automation token）

```bash
# ローカル確認
npm ci && npm run build
npm run release:check   # goreleaser（Gate 用）

# 初回 / 次バージョン
git tag v0.5.0
git push origin v0.5.0
# → .github/workflows/npm-publish.yml が @costgate/schema + @costgate/probe を publish
```

**導入（ユーザー）:**

```bash
npx @costgate/probe
# または package.json devDependency
```

## Gate — GitHub Releases

```bash
npm run build:gate
goreleaser release --clean   # tag push で CI release.yml も可
```

**インストール（ユーザー）:**

```bash
./scripts/install-gate.sh          # latest
./scripts/install-gate.sh v0.5.0     # 特定 tag
# PATH に ~/.local/bin を追加
```

WSL / 古い glibc 環境:

```bash
CGO_ENABLED=0 npm run build:gate    # 静的バイナリ
npm run cursor:update
```

## バージョン整合チェック

```bash
npm run publish:check
```

`@costgate/schema` / `@costgate/probe` の version と probe の schema 依存が一致しているか確認。

## Cursor 本番切替

```bash
npm run docker:update    # 推奨（Docker ビルド + mcp.json 更新）
# または
npm run build:gate && npm run cursor:production
```

## リリース後

1. [docs/benchmarks.md](./benchmarks.md) に計測値が変われば追記
2. `npm run eval -- --out test/eval/baseline.json` で baseline 更新（タスク追加時）
3. GitHub Release notes に Gate バイナリ + Probe npm バージョンを記載
