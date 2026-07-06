#!/usr/bin/env node
/**
 * Phase 33a: beforeSubmitPrompt secret detection hook tests.
 */
import {
  buildSecretBlockMessage,
  extractPromptText,
  handleCursorShieldPromptHook,
  toCursorHookOutput,
} from "../scripts/cursor-shield-prompt-hook.mjs";
import {
  inferSecrets,
  promptInferMode,
  shieldPromptAggressive,
  shieldPromptEnabled,
  shieldPromptFailOpen,
  Mode,
} from "../scripts/lib/shield-redact.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const GITHUB_TOKEN = "ghp_1234567890abcdefghijklmnopqrst";

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function testInferSecrets() {
  const findings = inferSecrets(`Use token ${GITHUB_TOKEN} please`);
  assert(findings.length === 1, "one finding");
  assert(findings[0].kind === "GITHUB_PAT", "github kind");
  assert(findings[0].masked.includes("ghp_"), "masked keeps prefix");
  assert(!findings[0].masked.includes(GITHUB_TOKEN), "full token not in masked");

  assert(inferSecrets("hello world").length === 0, "clean prompt");
  assert(inferSecrets("").length === 0, "empty prompt");
  console.error("[shield-prompt-hook] inferSecrets ok");
}

function testExtractPrompt() {
  assert(extractPromptText({ prompt: "hi" }) === "hi", "prompt field");
  assert(extractPromptText({}) === "", "missing prompt");
  console.error("[shield-prompt-hook] extractPrompt ok");
}

function testBlockSecret() {
  const result = handleCursorShieldPromptHook(
    {
      hook_event_name: "beforeSubmitPrompt",
      prompt: `Deploy with ${GITHUB_TOKEN}`,
    },
    { forceEnabled: true }
  );
  assert(result.continue === false, "blocked");
  assert(result.findings?.length === 1, "findings");
  assert(result.user_message?.includes("GITHUB_PAT"), "user message kind");
  assert(result.user_message?.includes("blocked"), "user message blocked");

  const out = toCursorHookOutput(result);
  assert(out.continue === false, "output continue false");
  assert(out.user_message, "output user_message");
  console.error("[shield-prompt-hook] block secret ok");
}

function testAllowCleanPrompt() {
  const result = handleCursorShieldPromptHook(
    {
      hook_event_name: "beforeSubmitPrompt",
      prompt: "Refactor the login handler",
    },
    { forceEnabled: true }
  );
  assert(result.continue === true, "allowed");
  assert(result.findings?.length === 0, "no findings");
  console.error("[shield-prompt-hook] allow clean ok");
}

function testSkipWhenDisabled() {
  withEnv(
    { COSTGATE_SHIELD: undefined, COSTGATE_SHIELD_PROMPT: undefined },
    () => {
      assert(!shieldPromptEnabled(), "disabled by default");
      const result = handleCursorShieldPromptHook({
        hook_event_name: "beforeSubmitPrompt",
        prompt: `token ${GITHUB_TOKEN}`,
      });
      assert(result.skipped === true, "skipped");
      assert(result.continue === true, "continue when disabled");
    }
  );
  console.error("[shield-prompt-hook] skip disabled ok");
}

function testEnabledViaEnv() {
  withEnv({ COSTGATE_SHIELD: "1" }, () => {
    assert(shieldPromptEnabled(), "shield enables prompt");
  });
  withEnv({ COSTGATE_SHIELD: undefined, COSTGATE_SHIELD_PROMPT: "1" }, () => {
    assert(shieldPromptEnabled(), "prompt-only env");
  });
  console.error("[shield-prompt-hook] env enable ok");
}

function testSkipOtherEvents() {
  const result = handleCursorShieldPromptHook(
    { hook_event_name: "sessionStart" },
    { forceEnabled: true }
  );
  assert(result.skipped === true, "skipped other event");
  assert(result.continue === true, "continue other event");
  console.error("[shield-prompt-hook] skip other events ok");
}

function testBlockMessageMultipleKinds() {
  const msg = buildSecretBlockMessage([
    { kind: "GITHUB_PAT", masked: "ghp_…abcd" },
    { kind: "AWS_KEY", masked: "AKIA…WXYZ" },
  ]);
  assert(msg.includes("GITHUB_PAT"), "github in msg");
  assert(msg.includes("AWS_KEY"), "aws in msg");
  console.error("[shield-prompt-hook] block message ok");
}

function testFailOpenEnv() {
  withEnv({ COSTGATE_SHIELD_PROMPT_FAIL_OPEN: undefined }, () => {
    assert(!shieldPromptFailOpen(), "default fail-closed");
  });
  withEnv({ COSTGATE_SHIELD_PROMPT_FAIL_OPEN: "1" }, () => {
    assert(shieldPromptFailOpen(), "fail-open opt-in");
  });
  console.error("[shield-prompt-hook] fail-open env ok");
}

function testAwsAndBearer() {
  const aws = inferSecrets("key=AKIAIOSFODNN7EXAMPLE");
  assert(aws.some((f) => f.kind === "AWS_KEY"), "aws key");

  const bearer = inferSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
  assert(bearer.some((f) => f.kind === "BEARER" || f.kind === "JWT"), "bearer or jwt");
  console.error("[shield-prompt-hook] aws/bearer ok");
}

function testAggressiveEnv() {
  withEnv({ COSTGATE_SHIELD_PROMPT_AGGRESSIVE: undefined }, () => {
    assert(promptInferMode() === Mode.Secrets, "default secrets");
    assert(!shieldPromptAggressive(), "aggressive off");
  });
  withEnv({ COSTGATE_SHIELD_PROMPT_AGGRESSIVE: "1" }, () => {
    assert(promptInferMode() === Mode.Aggressive, "aggressive mode");
    const email = inferSecrets("contact me at user@example.com", { mode: promptInferMode() });
    assert(email.some((f) => f.kind === "EMAIL"), "email in aggressive");
  });
  console.error("[shield-prompt-hook] aggressive env ok");
}

function main() {
  testInferSecrets();
  testExtractPrompt();
  testBlockSecret();
  testAllowCleanPrompt();
  testSkipWhenDisabled();
  testEnabledViaEnv();
  testSkipOtherEvents();
  testBlockMessageMultipleKinds();
  testFailOpenEnv();
  testAwsAndBearer();
  testAggressiveEnv();
  console.error("[shield-prompt-hook] all passed");
}

main();
