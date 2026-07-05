#!/usr/bin/env node
/**
 * npm run help — grouped script reference.
 */
const groups = [
  {
    title: "Build",
    cmds: [
      ["build", "schema + probe をビルド"],
      ["build:gate", "costgate-gate Go バイナリ"],
      ["build:probe", "Probe のみ"],
      ["build:schema", "Schema のみ"],
      ["dev:probe", "Probe 開発モード"],
      ["install:gate", "~/.local/bin へ Gate インストール"],
    ],
  },
  {
    title: "Cursor / MCP",
    cmds: [
      ["cursor:production", "Gate 本番モード（Dashboard 自動起動込み）"],
      ["cursor:measurement", "Probe 計測モード"],
      ["cursor:mcp -- status", "現在の mcp.json モード確認"],
      ["cursor:update", "Gate/Probe 再ビルド + production 設定更新"],
      ["cursor:registry", "Cursor hooks インストール（registry + prompt-intent）"],
    ],
  },
  {
    title: "Dashboard",
    cmds: [
      ["dashboard", "手動起動 http://127.0.0.1:8787"],
      ["dashboard:test", "Dashboard 関連テスト一式"],
    ],
  },
  {
    title: "Reports（CLI）",
    cmds: [
      ["compare", "Gate ON/OFF 定義レイヤ比較"],
      ["compress-report", "圧縮・Code Mode 効果"],
      ["session-report", "セッション内訳・削減シナリオ"],
    ],
  },
  {
    title: "Test",
    cmds: [
      ["test", "CI と同等の Node テスト一式"],
      ["test:local", "test + Gate smoke / filter / cursor-gate"],
      ["test:gate", "Gate smoke（要 backends.json）"],
      ["test:gate:filter", "Gate filter モード"],
      ["test:integration", "Probe/Gate × mock MCP"],
      ["eval", "精度 eval（mock）"],
      ["eval:live", "精度 eval（GitHub live、要 token）"],
      ["benchmark:ci", "mock compare ベンチマーク"],
    ],
  },
  {
    title: "Git / PR",
    cmds: [
      ["hooks:install", "pre-push フック（main 直 push 禁止）"],
      ["feat:start -- name", "feature ブランチ作成"],
      ["feat:ship -- -m \"…\"", "commit → PR → auto-merge → main 同期"],
      ["feat:sync", "main を pull のみ"],
    ],
  },
  {
    title: "Docker / Release",
    cmds: [
      ["docker:setup", "コンテナ内 install + build"],
      ["docker:update", "コンテナ経由 cursor:update"],
      ["release:check", "goreleaser check"],
      ["publish:check", "npm publish 前チェック"],
      ["cloud:upload", "costgate-cloud へ opt-in アップロード"],
    ],
  },
];

console.log("CostGate npm scripts\n");
for (const g of groups) {
  console.log(g.title);
  for (const [cmd, desc] of g.cmds) {
    console.log(`  npm run ${cmd.padEnd(28)} ${desc}`);
  }
  console.log("");
}
