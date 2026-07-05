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
