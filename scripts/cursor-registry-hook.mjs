#!/usr/bin/env node
/**
 * Cursor hook: record workspace folders in CostGate Activity Registry.
 *
 * Handles workspaceOpen → source cursor:workspace
 * (cursor:file via Agent/Tab is added in a follow-up hook config.)
 *
 * Install: npm run registry:install-cursor-hook
 */
import { touchRegistryPath } from "./lib/dashboard-workspaces.mjs";
import { pathToFileURL } from "node:url";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export function handleCursorRegistryHook(payload) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  const touched = [];

  if (event === "workspaceOpen") {
    for (const root of payload.workspace_roots ?? []) {
      if (!root) continue;
      touchRegistryPath(root, { source: "cursor:workspace" });
      touched.push(root);
    }
  }

  return { ok: true, event, touched };
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write("{}\n");
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-registry-hook] invalid JSON on stdin\n");
    process.exit(0);
  }
  const result = handleCursorRegistryHook(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-registry-hook] ${e.message ?? e}\n`);
    process.exit(0);
  });
}
