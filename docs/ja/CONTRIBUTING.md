# CostGate へのコントリビューション

> **言語:** [English](../CONTRIBUTING.md) · 日本語（このファイル）

## モノレポ構成

| パス | 言語 | 配布 |
|------|------|------|
| `packages/schema` | TypeScript | workspace のみ |
| `packages/probe` | TypeScript | npm `@costgate/probe` |
| `packages/cli` | JavaScript | npm `@costgate/cli` |
| `packages/gate` | Go | GitHub Releases |

## 開発環境セットアップ

### 利用者向け（`@costgate/cli`）

```bash
npx @costgate/cli@latest init
```

### ホスト（Node 20+、Go は任意）

```bash
git clone https://github.com/YukiMiyatake/costgate.git
cd costgate
npm install
npm run build
```

### Docker（ホストに Node/Go 不要）

```bash
npm run docker:setup
```

詳細: [docker.md](./docker.md)

## ブランチ運用

| ブランチ | 役割 |
|----------|------|
| `main` | 安定版。feature PR のマージ先 |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | 機能ブランチ（`main` 向け PR を 1 本ずつ） |

`develop` ブランチは **使いません**。

### 日常ワークフロー

```bash
npm run hooks:install          # 初回: main 直 push 禁止
npm run feat:start -- short-name
git add …
npm run feat:ship -- -m "変更の説明"
```

- コミットメッセージは **日本語**
- `main` への直接 push 禁止（PR 経由）
- 詳細は英語版 [CONTRIBUTING.md](../CONTRIBUTING.md) の Branch policy を参照

## ドキュメント多言語化

- 正本: 英語（`docs/`、`README.md`）
- 日本語: `docs/ja/`、`README.ja.md`
- 対応表: [i18n.md](./i18n.md)

## npm 公開（メンテナ）

tag `v*` で `@costgate/schema` → `@costgate/probe` → `@costgate/cli` を publish。  
Gate バイナリは goreleaser。手順: [RELEASE.md](./RELEASE.md)
