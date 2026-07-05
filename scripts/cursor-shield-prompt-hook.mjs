#!/usr/bin/env node
/**
 * Cursor hook: detect secrets in user prompt and block submit before cloud LLM.
 *
 * Event: beforeSubmitPrompt (block only — Cursor cannot rewrite prompt)
 * Install: npm run cursor:registry (Phase 33a)
 */
import { pathToFileURL } from "node:url";
import {
  inferSecrets,
  shieldPromptEnabled,
  shieldPromptFailOpen,
} from "./lib/shield-redact.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export function extractPromptText(payload) {
  const prompt = payload?.prompt;
  return typeof prompt === "string" ? prompt : "";
}

export function buildSecretBlockMessage(findings) {
  const kinds = [...new Set(findings.map((f) => f.kind))];
  const label = kinds.length === 1 ? kinds[0] : kinds.join(", ");
  return `CostGate Shield: Possible secret detected in your prompt (${label}). Submit blocked to prevent leaking secrets to the cloud LLM. Remove the secret and try again.`;
}

export function toCursorHookOutput(result) {
  const out = { continue: result.continue ?? true };
  if (result.user_message) out.user_message = result.user_message;
  return out;
}

export function handleCursorShieldPromptHook(payload, context = {}) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  if (event !== "beforeSubmitPrompt") {
    return { ok: true, skipped: true, event, continue: true };
  }

  const enabled = context.forceEnabled ?? shieldPromptEnabled();
  if (!enabled) {
    return { ok: true, skipped: true, event, reason: "shield_prompt_disabled", continue: true };
  }

  const prompt = extractPromptText(payload);
  if (!prompt.trim()) {
    return { ok: true, skipped: true, event, reason: "empty_prompt", continue: true };
  }

  const findings = inferSecrets(prompt, context.inferOptions ?? {});
  if (findings.length === 0) {
    return { ok: true, event, continue: true, findings: [] };
  }

  return {
    ok: true,
    event,
    continue: false,
    findings,
    user_message: buildSecretBlockMessage(findings),
  };
}

function allowOnError() {
  return shieldPromptFailOpen();
}

function errorOutput(message) {
  if (allowOnError()) {
    return { continue: true };
  }
  return {
    continue: false,
    user_message: message,
  };
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-shield-prompt-hook] invalid JSON on stdin\n");
    process.stdout.write(
      `${JSON.stringify(
        errorOutput("CostGate Shield: prompt hook received invalid input; submit blocked.")
      )}\n`
    );
    return;
  }

  try {
    const result = handleCursorShieldPromptHook(payload);
    process.stdout.write(`${JSON.stringify(toCursorHookOutput(result))}\n`);
  } catch (e) {
    process.stderr.write(`[cursor-shield-prompt-hook] ${e.message ?? e}\n`);
    process.stdout.write(
      `${JSON.stringify(
        errorOutput("CostGate Shield: prompt secret check failed; submit blocked.")
      )}\n`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-shield-prompt-hook] ${e.message ?? e}\n`);
    process.stdout.write(
      `${JSON.stringify(
        errorOutput("CostGate Shield: prompt hook crashed; submit blocked.")
      )}\n`
    );
    process.exit(0);
  });
}
