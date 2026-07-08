#!/usr/bin/env node
/**
 * CostGate feat-branch workflow: start branch, commit, push, open PR to main.
 * GitHub Actions handles CI, review comment, and auto-merge (see pr-automation.yml).
 *
 * Usage:
 *   npm run feat:start -- my-feature        # feat/my-feature
 *   npm run feat:ship -- --message "..."    # commit → push → PR（ここまで）
 *   npm run feat:ship -- -m "..." --name fix/bug
 *   npm run feat:ship -- -m "..." --draft    # 手動レビュー用ドラフト PR
 *   npm run feat:ship -- -m "..." --wait     # マージ待ち + local main 同期（任意）
 *   npm run feat:sync                       # 開いている PR のマージ待ち + main 同期
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROTECTED = new Set(["main", "master"]);
const DEFAULT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WAIT_INTERVAL_MS = 15 * 1000;

function run(cmd, { silent = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
    stdio: silent ? "pipe" : "inherit",
  });
  if (r.status !== 0 && !allowFail) {
    process.exit(r.status ?? 1);
  }
  return r.stdout?.trim() ?? "";
}

function runGet(cmd) {
  return run(cmd, { silent: true });
}

function sleep(ms) {
  run(`sleep ${Math.max(1, Math.ceil(ms / 1000))}`, { silent: true });
}

function currentBranch() {
  return runGet("git branch --show-current");
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "work";
}

function timestampSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? "ship",
    message: "",
    name: "",
    prefix: "feat",
    title: "",
    body: "",
    skipPr: false,
    draft: false,
    waitMerge: false,
  };
  const rest = argv[0] === "start" || argv[0] === "sync" ? argv.slice(1) : argv.slice(1);
  if (out.cmd === "start") {
    out.name = rest[0] ?? "";
    out.prefix = rest[1] ?? "feat";
    return out;
  }
  if (out.cmd === "sync") {
    out.waitMerge = !rest.includes("--no-wait");
    return out;
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-m" || a === "--message") out.message = rest[++i] ?? "";
    else if (a === "--name" || a === "--branch") out.name = rest[++i] ?? "";
    else if (a === "--prefix") out.prefix = rest[++i] ?? "feat";
    else if (a === "--title") out.title = rest[++i] ?? "";
    else if (a === "--body") out.body = rest[++i] ?? "";
    else if (a === "--no-pr") out.skipPr = true;
    else if (a === "--draft") out.draft = true;
    else if (a === "--wait") out.waitMerge = true;
  }
  return out;
}

function fullBranchName(prefix, name) {
  if (!name) return "";
  if (name.includes("/")) return name;
  return `${prefix}/${name}`;
}

function ensureBranch(opts) {
  let branch = currentBranch();
  if (!PROTECTED.has(branch)) {
    return branch;
  }

  const slug = opts.name
    ? fullBranchName(opts.prefix, opts.name)
    : opts.message
      ? fullBranchName(opts.prefix, slugify(opts.message.split("\n")[0]))
      : fullBranchName(opts.prefix, `work-${timestampSlug()}`);

  console.error(`[feat] create branch: ${slug} (from ${branch})`);
  run(`git checkout -b ${slug}`);
  return slug;
}

function hasStaged() {
  return runGet("git diff --cached --name-only").length > 0;
}

function tryGet(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function prNumberForBranch(branch) {
  const raw = tryGet(
    `gh pr list --head ${branch} --base main --json number -q '.[0].number'`
  );
  return raw ? Number(raw) : 0;
}

function prViewJson(prNum, query) {
  return tryGet(`gh pr view ${prNum} --json ${query}`);
}

function openPr(branch, opts) {
  const existingNum = prNumberForBranch(branch);
  if (existingNum) {
    const url = tryGet(`gh pr view ${existingNum} --json url -q .url`);
    console.error(`[feat] PR already open: ${url || existingNum}`);
    return existingNum;
  }

  const title = opts.title || opts.message.split("\n")[0] || branch;
  const body =
    opts.body ||
    `## Summary\n\n${opts.message}\n\n## Test plan\n\n- [ ] CI 通過を確認`;
  const dir = mkdtempSync(join(tmpdir(), "costgate-pr-"));
  const bodyFile = join(dir, "body.md");
  writeFileSync(bodyFile, body, "utf8");
  const draftFlag = opts.draft ? "--draft" : "";
  try {
    run(
      `gh pr create ${draftFlag} --base main --head ${branch} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(bodyFile)}`.replace(
        /\s+/g,
        " "
      )
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return prNumberForBranch(branch);
}

function ciFailed(prNum) {
  const raw = prViewJson(prNum, "statusCheckRollup");
  if (!raw) return false;
  try {
    const checks = JSON.parse(raw).statusCheckRollup ?? [];
    return checks.some((c) => c.conclusion === "FAILURE");
  } catch {
    return false;
  }
}

function waitForPrMerge(prNum, { timeoutMs = DEFAULT_WAIT_TIMEOUT_MS } = {}) {
  const start = Date.now();
  console.error(`[feat] waiting for PR #${prNum} to merge (GitHub Actions CI + auto-merge)...`);

  while (Date.now() - start < timeoutMs) {
    const state = tryGet(`gh pr view ${prNum} --json state -q .state`);
    if (state === "MERGED") {
      const url = tryGet(`gh pr view ${prNum} --json url -q .url`);
      console.error(`[feat] merged: ${url || `#${prNum}`}`);
      return;
    }
    if (state === "CLOSED") {
      console.error(`[feat] PR #${prNum} closed without merge`);
      process.exit(1);
    }
    if (ciFailed(prNum)) {
      console.error(`[feat] CI failed on PR #${prNum}. Fix and push again.`);
      process.exit(1);
    }
    sleep(DEFAULT_WAIT_INTERVAL_MS);
  }

  console.error(`[feat] timeout (${timeoutMs / 60000} min) waiting for PR #${prNum}`);
  console.error("[feat] Check GitHub Actions. Resume with: npm run feat:sync");
  process.exit(1);
}

function syncLocalMain(featureBranch) {
  console.error("[feat] syncing local main...");
  run("git fetch origin main");
  run("git checkout main");
  run("git pull origin main");
  if (featureBranch && !PROTECTED.has(featureBranch)) {
    run(`git branch -d ${featureBranch}`, { allowFail: true });
  }
  const head = runGet("git log -1 --oneline");
  console.error(`[feat] local main: ${head}`);
}

function finishPipeline(branch, opts, prNum) {
  if (!opts.waitMerge || !prNum) return;
  waitForPrMerge(prNum);
  syncLocalMain(branch);
}

function cmdStart(opts) {
  if (!opts.name) {
    console.error("Usage: npm run feat:start -- <name> [prefix]");
    process.exit(1);
  }
  const branch = fullBranchName(opts.prefix, opts.name);
  run("git fetch origin main");
  run("git checkout main");
  run("git pull origin main");
  run(`git checkout -b ${branch}`);
  console.log(branch);
}

function cmdShip(opts) {
  if (!opts.message) {
    console.error('Usage: npm run feat:ship -- --message "コミットメッセージ" [--name slug]');
    process.exit(1);
  }
  if (!hasStaged()) {
    console.error("[feat] no staged changes. git add してから実行してください。");
    process.exit(1);
  }

  const branch = ensureBranch(opts);
  const msgEscaped = opts.message.replace(/'/g, "'\\''");
  run(`git commit -m '${msgEscaped}'`);
  run(`git push -u origin ${branch}`);

  let prNum = 0;
  if (!opts.skipPr) {
    prNum = openPr(branch, opts);
    const url = prNum ? tryGet(`gh pr view ${prNum} --json url -q .url`) : "";
    if (url) console.error(`[feat] PR opened: ${url}`);
    if (!opts.draft) {
      console.error("[feat] GitHub Actions が CI / レビューコメント / auto-merge を処理します。");
      console.error("[feat] マージ後に main を同期する場合: npm run feat:sync");
    }
  }

  finishPipeline(branch, opts, prNum);
  console.log(`[feat] done: ${currentBranch()}`);
}

function cmdSync(opts) {
  const branch = currentBranch();
  if (PROTECTED.has(branch)) {
    run("git fetch origin main");
    run("git pull origin main");
    console.log(`[feat] main: ${runGet("git log -1 --oneline")}`);
    return;
  }

  const prNum = prNumberForBranch(branch);
  if (!prNum) {
    console.error(`[feat] no open PR for branch ${branch}`);
    process.exit(1);
  }

  if (opts.waitMerge) {
    waitForPrMerge(prNum);
  }
  syncLocalMain(branch);
  console.log(`[feat] done: ${currentBranch()}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.cmd === "start") {
    cmdStart(opts);
  } else if (opts.cmd === "ship") {
    cmdShip(opts);
  } else if (opts.cmd === "sync") {
    cmdSync(opts);
  } else {
    console.error("Unknown command. Use: start | ship | sync");
    process.exit(1);
  }
}

main();
