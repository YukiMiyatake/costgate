#!/usr/bin/env node
/**
 * Shared dashboard write-auth for tests.
 */
import { randomBytes } from "node:crypto";

export const TEST_DASHBOARD_WRITE_TOKEN =
  process.env.COSTGATE_DASHBOARD_TOKEN ?? "costgate-test-write-token";

export function ensureTestDashboardToken() {
  if (!process.env.COSTGATE_DASHBOARD_TOKEN) {
    process.env.COSTGATE_DASHBOARD_TOKEN = TEST_DASHBOARD_WRITE_TOKEN;
  }
  return process.env.COSTGATE_DASHBOARD_TOKEN;
}

export function dashboardWriteHeaders(token = ensureTestDashboardToken()) {
  return { "X-Costgate-Dashboard-Token": token };
}

export function generateDashboardWriteToken() {
  return randomBytes(24).toString("hex");
}
