#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { connectBackend } from "./backend.js";
import { getPrimaryBackend, loadConfig, resolveConfigPath } from "./config.js";
import { createLogger } from "./logger.js";
import { startProxy } from "./proxy.js";

async function main(): Promise<void> {
  const logDir =
    process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate", "logs");
  const clientName = process.env.COSTGATE_CLIENT ?? "unknown";

  const config = loadConfig();
  const { name: backendName, backend } = getPrimaryBackend(config);
  const logger = createLogger({ logDir, client: clientName });

  console.error(
    `[costgate-probe] v0.1.0 backend=${backendName} logDir=${logDir} config=${resolveConfigPath()}`
  );

  logger.sessionStart();

  const backendClient = await connectBackend(backendName, backend);
  const server = await startProxy({
    backendName,
    client: backendClient,
    logger,
  });

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.sessionEnd();
    await server.close().catch(() => undefined);
    await backendClient.close().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[costgate-probe] fatal:", error);
  process.exit(1);
});
