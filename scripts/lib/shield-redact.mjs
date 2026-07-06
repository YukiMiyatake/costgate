/**
 * Shield redact engine — JS port of packages/gate/internal/shield/redact.go (ModeSecrets + aggressive).
 */
import {
  PLACEHOLDER_PATTERN,
  PLACEHOLDER_PREFIX,
  ShieldVault,
  unredactString,
} from "./shield-vault.mjs";

export const Mode = {
  Off: 0,
  Secrets: 1,
  Aggressive: 2,
  Full: 3,
};

const PATTERNS = {
  ghToken: /\b(ghp_[A-Za-z0-9_]{20,})\b/g,
  ghFineToken: /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
  awsKey: /\b(AKIA[0-9A-Z]{16})\b/g,
  bearer: /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)\b/gi,
  jwt: /\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
  email: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  path: /(?:^|[\s"'=(])(\/(?:home|Users|tmp|var|etc|opt)[/\w.\-]+|~[/\\][\w.\-/\\]+)/g,
  envValue: /^([A-Z][A-Z0-9_]{1,64})=(.+)$/gm,
  connString: /\b(?:postgres|mysql|mongodb|redis)(?:\+[a-z]+)?:\/\/[^\s"'<>]+/gi,
};

const SENSITIVE_KEYS = [
  "token",
  "secret",
  "password",
  "passwd",
  "api_key",
  "apikey",
  "authorization",
  "auth",
  "credential",
  "private_key",
  "access_key",
];

/** Whether Gate/Hook Shield redact is active (COSTGATE_SHIELD=1). */
export function shieldEnabled() {
  const v = process.env.COSTGATE_SHIELD;
  return v === "1" || v === "true" || v === "yes";
}

/** Whether beforeSubmitPrompt secret blocking is active (COSTGATE_SHIELD or COSTGATE_SHIELD_PROMPT). */
export function shieldPromptEnabled() {
  if (shieldEnabled()) return true;
  const v = process.env.COSTGATE_SHIELD_PROMPT;
  return v === "1" || v === "true" || v === "yes";
}

/** When true, prompt hook errors allow submit instead of blocking (default: fail-closed). */
export function shieldPromptFailOpen() {
  const v = process.env.COSTGATE_SHIELD_PROMPT_FAIL_OPEN;
  return v === "1" || v === "true" || v === "yes";
}

/** When true, prompt blocking also detects email/phone/path/env (Mode.Aggressive). */
export function shieldPromptAggressive() {
  const v = process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE;
  return v === "1" || v === "true" || v === "yes";
}

/** Infer mode for prompt secret detection (hook + Dashboard sanitize). */
export function promptInferMode() {
  return shieldPromptAggressive() ? Mode.Aggressive : Mode.Secrets;
}

function maskSecret(value) {
  if (!value || value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function collectPatternMatches(text, re, kind, submatch, findings, seen) {
  const regex = new RegExp(re.source, re.flags);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const secret = submatch > 0 ? match[submatch] : match[0];
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    findings.push({ kind, masked: maskSecret(secret) });
  }
}

function collectEnvSecrets(text, findings, seen) {
  const regex = new RegExp(PATTERNS.envValue.source, PATTERNS.envValue.flags);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const val = match[2]?.trim();
    if (!val || val.startsWith(PLACEHOLDER_PREFIX) || seen.has(val)) continue;
    seen.add(val);
    findings.push({ kind: "ENV", masked: maskSecret(val) });
  }
}

function collectSensitiveJsonFields(value, findings, seen) {
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveJsonFields(item, findings, seen);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string" && val && isSensitiveKey(key) && !seen.has(val)) {
      seen.add(val);
      findings.push({ kind: classifyKey(key), masked: maskSecret(val) });
    } else {
      collectSensitiveJsonFields(val, findings, seen);
    }
  }
}

/**
 * Detect secret-like substrings in text using the same rules as Mode.Secrets redact.
 * @returns {{ kind: string, masked: string }[]}
 */
export function inferSecrets(text, options = {}) {
  if (!text) return [];
  const mode = options.mode ?? Mode.Secrets;
  if (mode === Mode.Off) return [];

  const findings = [];
  const seen = new Set();

  if (looksLikeJSON(text)) {
    try {
      collectSensitiveJsonFields(JSON.parse(text), findings, seen);
    } catch {
      // fall through to string scan
    }
  }

  collectPatternMatches(text, PATTERNS.ghToken, "GITHUB_PAT", 1, findings, seen);
  collectPatternMatches(text, PATTERNS.ghFineToken, "GITHUB_PAT", 1, findings, seen);
  collectPatternMatches(text, PATTERNS.awsKey, "AWS_KEY", 1, findings, seen);
  collectPatternMatches(text, PATTERNS.bearer, "BEARER", 1, findings, seen);
  collectPatternMatches(text, PATTERNS.jwt, "JWT", 0, findings, seen);
  collectPatternMatches(text, PATTERNS.connString, "CONN_STRING", 0, findings, seen);

  if (mode >= Mode.Aggressive) {
    collectPatternMatches(text, PATTERNS.email, "EMAIL", 0, findings, seen);
    collectPatternMatches(text, PATTERNS.phone, "PHONE", 0, findings, seen);
    collectPatternMatches(text, PATTERNS.path, "PATH", 1, findings, seen);
    collectEnvSecrets(text, findings, seen);
  }

  return findings;
}

function looksLikeJSON(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isSensitiveKey(key) {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

function classifyKey(key) {
  const lower = key.toLowerCase();
  if (lower.includes("github")) return "GITHUB_PAT";
  if (lower.includes("aws")) return "AWS_KEY";
  if (lower.includes("password")) return "PASSWORD";
  return "SECRET";
}

function replaceAllWithVault(text, re, kind, vault, submatch) {
  return text.replace(re, (match, ...groups) => {
    const secret = submatch > 0 ? groups[submatch - 1] : match;
    if (!secret) return match;
    const placeholder = vault.store(kind, secret);
    return match.replace(secret, placeholder);
  });
}

function redactEnvLines(text, vault) {
  return text.replace(PATTERNS.envValue, (line, key, val) => {
    const trimmed = val.trim();
    if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) return line;
    return `${key}=${vault.store("ENV", trimmed)}`;
  });
}

export function redactString(text, mode, vault) {
  if (!text || mode === Mode.Off) return text;

  if (mode === Mode.Full) {
    if (text.trim().length <= 4) return text;
    if (PLACEHOLDER_PATTERN.test(text)) {
      PLACEHOLDER_PATTERN.lastIndex = 0;
      return text;
    }
    return vault.store("REDACTED", text);
  }

  let out = text;
  out = replaceAllWithVault(out, PATTERNS.ghToken, "GITHUB_PAT", vault, 1);
  out = replaceAllWithVault(out, PATTERNS.ghFineToken, "GITHUB_PAT", vault, 1);
  out = replaceAllWithVault(out, PATTERNS.awsKey, "AWS_KEY", vault, 1);
  out = replaceAllWithVault(out, PATTERNS.bearer, "BEARER", vault, 1);
  out = replaceAllWithVault(out, PATTERNS.jwt, "JWT", vault, 1);
  out = replaceAllWithVault(out, PATTERNS.connString, "CONN_STRING", vault, 0);

  if (mode >= Mode.Aggressive) {
    out = replaceAllWithVault(out, PATTERNS.email, "EMAIL", vault, 0);
    out = replaceAllWithVault(out, PATTERNS.phone, "PHONE", vault, 0);
    out = replaceAllWithVault(out, PATTERNS.path, "PATH", vault, 1);
    out = redactEnvLines(out, vault);
  }

  return out;
}

export function redactValue(value, mode, vault) {
  if (mode === Mode.Off) return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, mode, vault));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, val] of Object.entries(value)) {
      if (mode >= Mode.Secrets && isSensitiveKey(k) && typeof val === "string" && val) {
        out[k] = vault.store(classifyKey(k), val);
      } else {
        out[k] = redactValue(val, mode, vault);
      }
    }
    return out;
  }
  if (typeof value === "string") {
    return redactString(value, mode, vault);
  }
  return value;
}

export function redactText(text, mode, vault) {
  if (!text) return text;
  if (looksLikeJSON(text)) {
    try {
      const parsed = JSON.parse(text);
      const redacted = redactValue(parsed, mode, vault);
      return JSON.stringify(redacted);
    } catch {
      // fall through to string redact
    }
  }
  return redactString(text, mode, vault);
}

export { ShieldVault, unredactString };
