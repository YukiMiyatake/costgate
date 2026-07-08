## ブランチ運用

| ブランチ | 役割 |
|----------|------|
| `main` | 安定版。feature PR のマージ先 |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | 機能ブランチ（`main` 向け PR を 1 本ずつ） |

`develop` ブランチは **使いません**（リモートも削除済みを想定）。

### 役割分担

| 作業 | 担当 |
|------|------|
| commit / push / PR 作成 | ローカル・Cursor（`feat:ship`） |
| CI / レビューコメント / auto-merge | GitHub Actions |
| マージ後の main 同期 | 任意（`feat:sync`） |

### 日常ワークフロー

```bash
npm run hooks:install          # 初回: main 直 push 禁止
npm run feat:start -- short-name
git add …
npm run feat:ship -- -m "変更の説明"
npm run feat:sync                # マージ後に main を同期
```

- コミットメッセージは **日本語**
- `main` への直接 push 禁止（PR 経由）
- 詳細は英語版 [CONTRIBUTING.md](../CONTRIBUTING.md) の Branch policy を参照

### リリース

```bash
npm run release:version -- 0.6.0 --note "概要"
npm run feat:ship -- -m "chore: release v0.6.0"
# マージ後: git tag v0.6.0 && git push origin v0.6.0
```

手順: [RELEASE.md](./RELEASE.md)
