#!/usr/bin/env node
/**
 * Phase 32a: preToolUse Read sanitizer hook tests.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractReadPath,
  handleCursorShieldReadHook,
  isReadPreToolUse,
  isSanitizedPath,
  sanitizeFileContent,
  shadowPathFor,
  toCursorHookOutput,
} from "../scripts/cursor-shield-read-hook.mjs";
import { Mode, redactString, shieldEnabled } from "../scripts/lib/shield-redact.mjs";
import { ShieldVault } from "../scripts/lib/shield-vault.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-shield-read-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupProject(base) {
  mkdirSync(join(base, ".git"), { recursive: true });
  mkdirSync(join(base, ".costgate", "vault"), { recursive: true });
  return base;
}

function hookContext(base) {
  return {
    forceEnabled: true,
    projectRoot: base,
    vaultOptions: { dir: join(base, ".costgate", "vault"), sessionId: "test-read" },
  };
}

function existsShadow(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

function testMatcher() {
  assert(
    isReadPreToolUse({ hook_event_name: "preToolUse", tool_name: "Read" }),
    "Read preToolUse"
  );
  assert(!isReadPreToolUse({ hook_event_name: "preToolUse", tool_name: "Shell" }), "not Read");
  assert(!isReadPreToolUse({ hook_event_name: "postToolUse", tool_name: "Read" }), "wrong event");
  assert(extractReadPath({ tool_input: { path: "/a/b.ts" } }) === "/a/b.ts", "extract path");
  console.error("[shield-read-hook] matcher ok");
}

function testRedactPatterns() {
  const vault = new ShieldVault({ dir: join(tempRoot(), "vault"), sessionId: "redact" });
  const token = "ghp_1234567890abcdefghijklmnopqrst";
  const out = redactString(`key=${token}`, Mode.Secrets, vault);
  assert(!out.includes(token), "token redacted");
  assert(out.includes("[[CG:GITHUB_PAT:"), "placeholder present");
  console.error("[shield-read-hook] redact patterns ok");
}

function testShadowPath() {
  const base = tempRoot();
  const src = join(base, "src", "app.ts");
  const shadow = shadowPathFor(src, base);
  assert(shadow.endsWith(".costgate/sanitized/src/app.ts"), "relative shadow");
  assert(!isSanitizedPath(src), "source not sanitized");
  assert(isSanitizedPath(shadow), "shadow is sanitized");
  console.error("[shield-read-hook] shadow path ok");
}

function testSanitizeAndRedirect() {
  const base = setupProject(tempRoot());
  const srcDir = join(base, "src");
  mkdirSync(srcDir, { recursive: true });
  const token = "ghp_abcdefghijklmnopqrstuvwxyz1234";
  const src = join(srcDir, "secrets.ts");
  writeFileSync(src, `export const KEY = "${token}";\n`);

  const result = handleCursorShieldReadHook(
    {
      hook_event_name: "preToolUse",
      tool_name: "Read",
      tool_input: { path: src, limit: 50 },
      workspace_roots: [base],
    },
    hookContext(base)
  );

  assert(result.redacted === true, "redacted flag");
  assert(result.updated_input?.path !== src, "path swapped");
  assert(result.updated_input?.limit === 50, "limit preserved");
  assert(existsShadow(result.shadow_path), "shadow exists");

  const shadowContent = readFileSync(result.shadow_path, "utf8");
  assert(!shadowContent.includes(token), "secret not in shadow");
  assert(shadowContent.includes("[[CG:GITHUB_PAT:"), "placeholder in shadow");

  const out = toCursorHookOutput(result);
  assert(out.permission === "allow", "allow");
  assert(out.updated_input.path === result.shadow_path, "cursor output path");

  rmSync(base, { recursive: true, force: true });
  console.error("[shield-read-hook] sanitize redirect ok");
}

function testSkipWhenUnchanged() {
  const base = setupProject(tempRoot());
  const src = join(base, "clean.ts");
  writeFileSync(src, "export const x = 1;\n");

  const result = handleCursorShieldReadHook(
    {
      hook_event_name: "preToolUse",
      tool_name: "Read",
      tool_input: { path: src },
      workspace_roots: [base],
    },
    hookContext(base)
  );

  assert(result.redacted === false, "unchanged content");
  assert(!result.updated_input, "no path swap");
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-read-hook] skip unchanged ok");
}

function testSkipSanitizedPath() {
  const base = setupProject(tempRoot());
  const shadow = join(base, ".costgate", "sanitized", "x.ts");
  mkdirSync(join(shadow, ".."), { recursive: true });
  writeFileSync(shadow, "sanitized\n");

  const result = handleCursorShieldReadHook(
    {
      hook_event_name: "preToolUse",
      tool_name: "Read",
      tool_input: { path: shadow },
      workspace_roots: [base],
    },
    hookContext(base)
  );

  assert(result.skipped === true, "skipped");
  assert(result.reason === "already_sanitized", "reason");
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-read-hook] skip sanitized ok");
}

function testShieldDisabled() {
  const prev = process.env.COSTGATE_SHIELD;
  delete process.env.COSTGATE_SHIELD;
  assert(!shieldEnabled(), "disabled by default");

  const base = setupProject(tempRoot());
  const src = join(base, "secret.ts");
  writeFileSync(src, 'const t = "ghp_1234567890abcdefghijklmnopqrst";\n');

  const result = handleCursorShieldReadHook(
    {
      hook_event_name: "preToolUse",
      tool_name: "Read",
      tool_input: { path: src },
      workspace_roots: [base],
    },
    { projectRoot: base }
  );

  assert(result.skipped === true, "skipped when disabled");
  assert(result.reason === "shield_disabled", "shield_disabled");
  if (prev !== undefined) process.env.COSTGATE_SHIELD = prev;
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-read-hook] shield disabled ok");
}

function testEnvRedaction() {
  const base = tempRoot();
  const vault = new ShieldVault({ dir: join(base, "vault"), sessionId: "env" });
  const { redacted, changed } = sanitizeFileContent("API_KEY=super-secret-value\n", {
    mode: Mode.Aggressive,
    vault,
  });
  assert(changed, "env changed");
  assert(!redacted.includes("super-secret-value"), "env value redacted");
  assert(redacted.includes("[[CG:ENV:"), "env placeholder");
  console.error("[shield-read-hook] env redaction ok");
}

function testSkipOtherEvents() {
  const result = handleCursorShieldReadHook({ hook_event_name: "sessionStart" });
  assert(result.skipped === true, "skipped");
  console.error("[shield-read-hook] skip other events ok");
}

async function main() {
  testMatcher();
  testRedactPatterns();
  testShadowPath();
  testSanitizeAndRedirect();
  testSkipWhenUnchanged();
  testSkipSanitizedPath();
  testShieldDisabled();
  testEnvRedaction();
  testSkipOtherEvents();
  console.error("[shield-read-hook] all passed");
}

main().catch((e) => {
  console.error("[shield-read-hook] fatal:", e);
  process.exit(1);
});
