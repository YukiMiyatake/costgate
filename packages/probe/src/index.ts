#!/usr/bin/env node
import { createLogger } from "./logger.js";
import { createProxy } from "./proxy.js";

const logDir = process.env.COSTGATE_PROBE_LOG_DIR ?? `${process.env.HOME}/.costgate/logs`;
const client = process.env.COSTGATE_CLIENT ?? "unknown";

const logger = createLogger({ logDir, client });
const proxy = createProxy({ backends: {} });

console.error(`[costgate-probe] v0.1.0 — logDir=${logDir} client=${client}`);
console.error("[costgate-probe] Proxy implementation coming soon.");

void logger;
void proxy;
