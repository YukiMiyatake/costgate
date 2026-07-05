#!/usr/bin/env node
/**
 * Cursor hook: sanitize Agent Read tool input by swapping to a redacted shadow file.
 *
 * Event: preToolUse (matcher: Read)
 * Install: npm run cursor:registry (Phase 32c)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Mode, redactText, shieldEnabled, ShieldVault } from "./lib/shield-redact.mjs";
import { resolveWorkspaceRootFromPath } from "./lib/resolve-workspace-root.mjs";

const SANITIZED_SEGMENT = ".costgate/sanitized";
const READ_TOOL_NAMES = new Set(["Read"]);

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export function extractReadToolInput(payload) {
  return payload?.tool_input ?? payload?.input ?? payload ?? {};
}

export function extractReadPath(payload) {
  const input = extractReadToolInput(payload);
  const path = input.path ?? input.file_path ?? input.filePath ?? null;
  return typeof path === "string" && path ? path : null;
}

export function isReadPreToolUse(payload) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  if (event !== "preToolUse") return false;
  const tool = String(payload?.tool_name ?? payload?.tool ?? "");
  return READ_TOOL_NAMES.has(tool) || tool.endsWith(" Read");
}

export function sanitizedRoot(projectRoot) {
  return join(projectRoot, ".costgate", "sanitized");
}

export function isSanitizedPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes(`/${SANITIZED_SEGMENT}/`) || normalized.includes(`${SANITIZED_SEGMENT}/`);
}

/** Map an absolute source path to its shadow file under `.costgate/sanitized/`. */
export function shadowPathFor(originalPath, projectRoot) {
  const abs = resolve(originalPath);
  const root = resolve(projectRoot);
  const rel = relative(root, abs);
  const safeRel =
    !rel || rel.startsWith("..") || isAbsolute(rel)
      ? join("_abs", `${shortPathHash(abs)}${extname(abs)}`)
      : rel;
  return join(sanitizedRoot(root), safeRel);
}

function shortPathHash(absPath) {
  return createHash("sha256").update(absPath).digest("hex").slice(0, 16);
}

export function resolveProjectRootForFile(filePath, payload, context = {}) {
  if (context.projectRoot) return context.projectRoot;
  const roots = payload?.workspace_roots ?? [];
  for (const root of roots) {
    const resolved = resolveWorkspaceRootFromPath(root);
    if (resolved) return resolved;
  }
  return resolveWorkspaceRootFromPath(filePath);
}

export function sanitizeFileContent(content, options = {}) {
  const mode = options.mode ?? Mode.Aggressive;
  const vault = options.vault ?? new ShieldVault(options.vaultOptions ?? {});
  const redacted = redactText(content, mode, vault);
  return { redacted, vault, changed: redacted !== content };
}

export function writeShadowFile(originalPath, projectRoot, content, options = {}) {
  const shadow = shadowPathFor(originalPath, projectRoot);
  mkdirSync(join(shadow, ".."), { recursive: true });
  writeFileSync(shadow, content, "utf8");
  return shadow;
}

export function toCursorHookOutput(result) {
  const out = { permission: result.permission ?? "allow" };
  if (result.user_message) out.user_message = result.user_message;
  if (result.agent_message) out.agent_message = result.agent_message;
  if (result.updated_input) out.updated_input = result.updated_input;
  return out;
}

export function handleCursorShieldReadHook(payload, context = {}) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  if (!isReadPreToolUse(payload)) {
    return { ok: true, skipped: true, event, permission: "allow" };
  }

  if (!shieldEnabled() && !context.forceEnabled) {
    return { ok: true, skipped: true, event, reason: "shield_disabled", permission: "allow" };
  }

  const originalPath = extractReadPath(payload);
  if (!originalPath) {
    return { ok: true, skipped: true, event, reason: "no_path", permission: "allow" };
  }

  if (isSanitizedPath(originalPath)) {
    return { ok: true, skipped: true, event, reason: "already_sanitized", permission: "allow" };
  }

  const absPath = resolve(originalPath);
  if (!existsSync(absPath)) {
    return { ok: true, skipped: true, event, reason: "missing_file", permission: "allow" };
  }

  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return { ok: true, skipped: true, event, reason: "stat_failed", permission: "allow" };
  }
  if (!stat.isFile()) {
    return { ok: true, skipped: true, event, reason: "not_file", permission: "allow" };
  }

  const projectRoot = resolveProjectRootForFile(absPath, payload, context);
  if (!projectRoot) {
    return { ok: true, skipped: true, event, reason: "no_project_root", permission: "allow" };
  }

  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return { ok: true, skipped: true, event, reason: "read_failed", permission: "allow" };
  }

  const mode = context.mode ?? Mode.Aggressive;
  const vaultOptions = context.vaultOptions ?? {};
  const { redacted, changed } = sanitizeFileContent(content, { mode, vaultOptions });

  if (!changed) {
    return {
      ok: true,
      event,
      original_path: absPath,
      shadow_path: absPath,
      redacted: false,
      permission: "allow",
    };
  }

  const shadowPath = writeShadowFile(absPath, projectRoot, redacted, context);
  const toolInput = extractReadToolInput(payload);
  const updatedInput = { ...toolInput, path: shadowPath };

  return {
    ok: true,
    event,
    original_path: absPath,
    shadow_path: shadowPath,
    redacted: true,
    permission: "allow",
    updated_input: updatedInput,
    agent_message: `CostGate Shield: Read redirected to sanitized copy of ${basename(absPath)}.`,
  };
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-shield-read-hook] invalid JSON on stdin\n");
    process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
    return;
  }

  try {
    const result = handleCursorShieldReadHook(payload);
    process.stdout.write(`${JSON.stringify(toCursorHookOutput(result))}\n`);
  } catch (e) {
    process.stderr.write(`[cursor-shield-read-hook] ${e.message ?? e}\n`);
    process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-shield-read-hook] ${e.message ?? e}\n`);
    process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
    process.exit(0);
  });
}
