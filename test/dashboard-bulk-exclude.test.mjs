#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const base = join(tmpdir(), `costgate-bulk-exclude-${process.pid}`);
  mkdirSync(base, { recursive: true });
  const overridesPath = join(base, "tool-overrides.json");
  writeFileSync(overridesPath, JSON.stringify({ version: 1, tools: {} }, null, 2));

  const server = createDashboardServer({
    controlPaths: { overridesPath },
    dataOptions: { overridesPath },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tools/bulk-exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        names: ["serena/find_symbol", "aieph/aieph_search"],
        tokens_saved: 1059,
      }),
    });
    assert(res.ok, `status ${res.status}`);
    const body = await res.json();
    assert(body.count === 2, "hidden count");
    assert(body.tokens_saved === 1059, "tokens echoed");
    assert(body.overrides.tools["serena/find_symbol"]?.force_tier === "hidden", "override saved");
    console.error("[dashboard-bulk-exclude] ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((e) => {
  console.error("[dashboard-bulk-exclude] fatal:", e);
  process.exit(1);
});
