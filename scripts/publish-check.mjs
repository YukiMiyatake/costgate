#!/usr/bin/env node
/**
 * Pre-publish sanity check for npm packages.
 *
 *   npm run publish:check
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function readPkg(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function main() {
  const schema = readPkg("packages/schema/package.json");
  const probe = readPkg("packages/probe/package.json");
  const cli = readPkg("packages/cli/package.json");
  const errors = [];

  if (schema.version !== probe.dependencies["@costgate/schema"]) {
    errors.push(
      `probe depends on @costgate/schema@${probe.dependencies["@costgate/schema"]} but schema is ${schema.version}`
    );
  }

  if (schema.version !== cli.version) {
    errors.push(`@costgate/cli version ${cli.version} != schema ${schema.version}`);
  }

  if (!probe.name.startsWith("@costgate/")) {
    errors.push("probe package name unexpected");
  }

  if (cli.name !== "@costgate/cli") {
    errors.push("cli package name unexpected");
  }

  if (errors.length) {
    console.error("[publish:check] failed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[publish:check] ok — schema/probe/cli @ ${schema.version}`);
}

main();
