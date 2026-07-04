# Architecture

## Target layout (Cursor)

```
Cursor mcp.json
├── serena              … 直結（常時 ON。Probe / Gate の外）
├── costgate-probe      … GitHub MCP 等の計測（開発）
└── costgate-gate       … GitHub / Browser 等（将来・ツール定義を絞る）
```

**Serena は Probe でも Gate でも呼ばない。** Cursor 直結のみ。

## Roles

| コンポーネント | Serena | GitHub MCP 等 |
|---|---|---|
| **Cursor 直結** | ✅ 常時 | ❌ |
| **Probe** | ❌ 計測しない | ✅ 計測用プロキシ |
| **Gate** | ❌ | ✅ 削減用プロキシ |

## Daily development

```
Cursor
├── serena           … コード操作
└── costgate-probe   … GitHub 計測（任意・PAT 要）
         │
         └── GitHub MCP（subprocess）
```

Serena と Probe は **同時 ON で問題なし**（別 MCP・別ツール）。

## Overview

```
                    ┌── serena ────────────── 直結（常時）
Cursor ─────────────┼── costgate-probe ────── GitHub MCP（計測）
                    └── costgate-gate ─────── browser, …（将来）
```

## Probe (measurement)

- stdio proxy for **GitHub and other heavy MCPs only**
- Never spawns Serena
- JSONL to `~/.costgate/logs/`

## Gate (production)

- Filters `tools/list` for delegated backends
- Serena stays outside Gate

## Cloud (private — costgate-cloud repo)

- Optional metrics upload (opt-in)
- Pro / Enterprise reports and support
