#!/usr/bin/env node
/**
 * Phase 32b: shield cache, trust mode, vault JS↔Go interop tests.
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildCacheMeta,
  contentHash,
  isCacheValid,
  readCacheMeta,
  writeCacheMeta,
} from "../scripts/lib/shield-cache.mjs";
import { isBinaryFile } from "../scripts/lib/shield-binary.mjs";
import { redactModeForRead, trustToRedactMode } from "../scripts/lib/shield-trust.mjs";
import { Mode } from "../scripts/lib/shield-redact.mjs";
import {
  PLACEHOLDER_PATTERN,
  ShieldVault,
  unredactString,
} from "../scripts/lib/shield-vault.mjs";
import {
  handleCursorShieldReadHook,
  shadowPathFor,
  tryReuseCachedShadow,
  writeShadowFile,
} from "../scripts/cursor-shield-read-hook.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-shield-32b-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupProject(base) {
  mkdirSync(join(base, ".git"), { recursive: true });
  mkdirSync(join(base, ".costgate", "vault"), { recursive: true });
  return base;
}

function hookContext(base, extra = {}) {
  return {
    forceEnabled: true,
    projectRoot: base,
    vaultOptions: { dir: join(base, ".costgate", "vault"), sessionId: "test-read" },
    ...extra,
  };
}

function testTrustToMode() {
  assert(trustToRedactMode("trusted") === Mode.Off, "trusted → off");
  assert(trustToRedactMode("standard") === Mode.Secrets, "standard → secrets");
  assert(trustToRedactMode("restricted") === Mode.Aggressive, "restricted → aggressive");
  assert(trustToRedactMode("untrusted") === Mode.Full, "untrusted → full");
  console.error("[shield-32b] trust→mode ok");
}

function testRedactModeForRead() {
  const base = tempRoot();
  mkdirSync(join(base, ".costgate"), { recursive: true });
  writeFileSync(
    join(base, ".costgate", "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      defaults: { gate_backend: "standard", direct_mcp: "restricted", unknown: "standard" },
      servers: {},
    })}\n`
  );
  assert(redactModeForRead({ projectRoot: base }) === Mode.Secrets, "unknown=standard");
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] redactModeForRead ok");
}

function testCacheMetaRoundTrip() {
  const base = tempRoot();
  const shadow = join(base, ".costgate", "sanitized", "a.ts");
  mkdirSync(join(shadow, ".."), { recursive: true });
  writeFileSync(shadow, "sanitized\n");
  const stat = { mtimeMs: 1000, size: 10 };
  const meta = buildCacheMeta("/src/a.ts", stat, {
    contentHash: "abc123",
    mode: Mode.Secrets,
    sessionId: "sess",
  });
  writeCacheMeta(shadow, meta);
  const loaded = readCacheMeta(shadow);
  assert(loaded.hash === "abc123", "hash stored");
  assert(isCacheValid("/src/a.ts", shadow, stat, { mode: Mode.Secrets, sessionId: "sess", contentHash: "abc123" }), "valid");
  assert(!isCacheValid("/src/a.ts", shadow, { ...stat, mtimeMs: 2000 }, { mode: Mode.Secrets, sessionId: "sess", contentHash: "abc123" }), "mtime invalidates");
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] cache meta ok");
}

function testCacheHitSkipsRewrite() {
  const base = setupProject(tempRoot());
  const token = "ghp_abcdefghijklmnopqrstuvwxyz1234";
  const src = join(base, "secret.ts");
  writeFileSync(src, `export const KEY = "${token}";\n`);

  const ctx = hookContext(base);
  const first = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: src }, workspace_roots: [base] },
    ctx
  );
  assert(first.redacted === true && !first.cache_hit, "first write");

  const shadowMtime = statSync(first.shadow_path).mtimeMs;
  const second = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: src }, workspace_roots: [base] },
    ctx
  );
  assert(second.cache_hit === true, "cache hit");
  assert(second.shadow_path === first.shadow_path, "same shadow");
  assert(statSync(first.shadow_path).mtimeMs === shadowMtime, "shadow not rewritten");

  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] cache hit ok");
}

function testCacheInvalidatesOnChange() {
  const base = setupProject(tempRoot());
  const token = "ghp_abcdefghijklmnopqrstuvwxyz1234";
  const src = join(base, "mutate.ts");
  writeFileSync(src, `const t = "${token}";\n`);

  const ctx = hookContext(base);
  const first = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: src }, workspace_roots: [base] },
    ctx
  );
  assert(first.redacted === true, "first redact");

  writeFileSync(src, `const t = "${token}";\nconst x = 2;\n`);
  const second = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: src }, workspace_roots: [base] },
    ctx
  );
  assert(!second.cache_hit, "cache miss after edit");
  assert(second.redacted === true, "rewritten");

  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] cache invalidate ok");
}

function testBinarySkip() {
  const base = setupProject(tempRoot());
  const png = join(base, "image.png");
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const result = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: png }, workspace_roots: [base] },
    hookContext(base)
  );
  assert(result.skipped === true && result.reason === "binary_file", "png skipped");

  const bin = join(base, "data.txt");
  writeFileSync(bin, "text\x00binary");
  const result2 = handleCursorShieldReadHook(
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: bin }, workspace_roots: [base] },
    hookContext(base)
  );
  assert(result2.skipped === true && result2.reason === "binary_content", "nul skipped");

  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] binary skip ok");
}

function goAvailable() {
  const r = spawnSync("go", ["version"], { stdio: "ignore" });
  return r.status === 0;
}

function testVaultJsGoRoundTrip() {
  const dir = tempRoot();
  const session = "js-go-roundtrip";
  const token = "ghp_abcdefghijklmnopqrstuvwxyz1234";
  const vault = new ShieldVault({ dir, sessionId: session });
  const placeholder = vault.store("GITHUB_PAT", token);
  PLACEHOLDER_PATTERN.lastIndex = 0;
  const match = PLACEHOLDER_PATTERN.exec(placeholder);
  assert(match, "placeholder parsed");
  const id = match[2];

  const restored = unredactString(placeholder, vault);
  assert(restored === token, "JS round-trip");

  if (goAvailable()) {
    const gateDir = join(process.cwd(), "packages", "gate");
    execSync("go test ./internal/shield/ -run TestVaultJSInterop -count=1", {
      cwd: gateDir,
      env: {
        ...process.env,
        COSTGATE_SHIELD_DIR: dir,
        COSTGATE_SHIELD_SESSION: session,
        COSTGATE_VAULT_LOOKUP_ID: id,
        COSTGATE_VAULT_EXPECTED_VALUE: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    console.error("[shield-32b] vault JS↔Go skipped (go not installed)");
  }

  rmSync(dir, { recursive: true, force: true });
  console.error("[shield-32b] vault JS↔Go ok");
}

function testSessionIdFromEnv() {
  const prev = process.env.COSTGATE_SHIELD_SESSION;
  process.env.COSTGATE_SHIELD_SESSION = "shared-session-32b";
  const dir = tempRoot();
  const vault = new ShieldVault({ dir });
  assert(vault.sessionId === "shared-session-32b", "session from env");
  if (prev === undefined) delete process.env.COSTGATE_SHIELD_SESSION;
  else process.env.COSTGATE_SHIELD_SESSION = prev;
  rmSync(dir, { recursive: true, force: true });
  console.error("[shield-32b] session id ok");
}

function testTryReuseCachedShadow() {
  const base = tempRoot();
  const src = join(base, "src.ts");
  writeFileSync(src, "x\n");
  const stat = statSync(src);
  const shadow = shadowPathFor(src, base);
  writeShadowFile(src, base, "sanitized\n", {
    cacheMeta: buildCacheMeta(src, stat, {
      contentHash: contentHash("x\n"),
      mode: Mode.Aggressive,
      sessionId: "s1",
    }),
  });
  const reused = tryReuseCachedShadow(src, base, stat, {
    mode: Mode.Aggressive,
    sessionId: "s1",
    contentHash: contentHash("x\n"),
  });
  assert(reused === shadow, "reuse shadow");
  rmSync(base, { recursive: true, force: true });
  console.error("[shield-32b] tryReuse ok");
}

function testBinaryHeuristic() {
  assert(isBinaryFile("/a/image.png"), "png ext");
  assert(!isBinaryFile("/a/file.ts", "hello"), "text ok");
  assert(isBinaryFile("/a/file.ts", "hello\x00world"), "nul byte");
  console.error("[shield-32b] binary heuristic ok");
}

async function main() {
  testTrustToMode();
  testRedactModeForRead();
  testCacheMetaRoundTrip();
  testCacheHitSkipsRewrite();
  testCacheInvalidatesOnChange();
  testBinarySkip();
  testVaultJsGoRoundTrip();
  testSessionIdFromEnv();
  testTryReuseCachedShadow();
  testBinaryHeuristic();
  console.error("[shield-32b] all passed");
}

main().catch((e) => {
  console.error("[shield-32b] fatal:", e);
  process.exit(1);
});
