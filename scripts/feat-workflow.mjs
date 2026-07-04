#!/usr/bin/env node
/**
 * CostGate feat-branch workflow: start branch, commit, push, open PR to main.
 *
 * Usage:
 *   npm run feat:start -- my-feature        # feat/my-feature
 *   npm run feat:ship -- --message "..."    # auto branch, ready PR, auto-merge queue
 *   npm run feat:ship -- -m "..." --name fix/bug
 *   npm run feat:ship -- -m "..." --draft    # 手動レビュー用ドラフト PR
 *   npm run feat:ship -- -m "..." --no-auto   # auto-merge しない
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROTECTED = new Set(["main", "develop", "master"]);

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
    auto: true,
  };
  const rest = argv[0] === "start" ? argv.slice(1) : argv.slice(1);
  if (out.cmd === "start") {
    out.name = rest[0] ?? "";
    out.prefix = rest[1] ?? "feat";
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
    else if (a === "--draft") {
      out.draft = true;
      out.auto = false;
    } else if (a === "--no-auto") out.auto = false;
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
    `gh pr list --head ${branch} --base main --state open --json number -q '.[0].number'`
  );
  return raw ? Number(raw) : 0;
}

function queueAutoMerge(prNum) {
  if (!prNum) return;
  run(`gh pr merge ${prNum} --auto --squash`, { allowFail: true });
  console.error(`[feat] auto-merge queued: PR #${prNum}`);
}

function openPr(branch, opts) {
  const existingNum = prNumberForBranch(branch);
  if (existingNum) {
    const url = tryGet(`gh pr view ${existingNum} --json url -q .url`);
    console.error(`[feat] PR already open: ${url || existingNum}`);
    if (opts.auto && !opts.draft) queueAutoMerge(existingNum);
    return;
  }

  const title = opts.title || opts.message.split("\n")[0] || branch;
  const body =
    opts.body ||
    `## Summary\n\n${opts.message}\n\n## Test plan\n\n- [ ] 確認`;
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

  if (opts.auto && !opts.draft) {
    queueAutoMerge(prNumberForBranch(branch));
  }
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
    console.error("Usage: npm run feat:ship -- --message \"コミットメッセージ\" [--name slug]");
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

  if (!opts.skipPr) {
    openPr(branch, opts);
  }

  console.log(`[feat] done: ${branch}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.cmd === "start") {
    cmdStart(opts);
  } else if (opts.cmd === "ship") {
    cmdShip(opts);
  } else {
    console.error("Unknown command. Use: start | ship");
    process.exit(1);
  }
}

main();
