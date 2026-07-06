/**
 * costgate init — install Gate binary, mcp.json, hooks, backends template.
 */
import { installGateBinary } from "./install-gate.mjs";
import {
  applyProductionMcp,
  DEFAULT_BACKENDS_PATH,
  DEFAULT_MCP_PATH,
  ensureBackendsTemplate,
  loadMcpJson,
  saveMcpJson,
} from "./mcp-config.mjs";
import { cliRuntimeRoot, readCliPackageVersion } from "./cli-runtime.mjs";
import { installRegistryHooks } from "./registry.mjs";

export async function runInit(opts = {}) {
  const runtimeRoot = cliRuntimeRoot();
  const version = readCliPackageVersion();
  const steps = [];

  const gate = await installGateBinary({
    version: version,
    tag: opts.tag,
    force: opts.forceGate ?? false,
  });
  steps.push(
    gate.skipped
      ? `Gate binary: ${gate.path} (already installed)`
      : `Gate binary: ${gate.path} (${gate.tag ?? version})`
  );

  const backends = ensureBackendsTemplate(runtimeRoot, opts.backendsPath ?? DEFAULT_BACKENDS_PATH);
  steps.push(
    backends.created
      ? `backends.json: created ${backends.path}`
      : `backends.json: ${backends.path} (exists)`
  );

  const mcpPath = opts.mcpPath ?? DEFAULT_MCP_PATH;
  const mcp = applyProductionMcp(loadMcpJson(mcpPath), version);
  saveMcpJson(mcp, mcpPath);
  steps.push(`mcp.json: production mode → ${mcpPath}`);

  if (opts.hooks !== false) {
    const hooks = installRegistryHooks(opts.hooksPath);
    steps.push(`hooks.json: ${hooks.hooksPath} (+${hooks.installed.length || "already present"})`);
  }

  return {
    version,
    runtimeRoot,
    gatePath: gate.path,
    backendsPath: backends.path,
    mcpPath,
    steps,
  };
}
