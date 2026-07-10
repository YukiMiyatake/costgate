#!/usr/bin/env node
/**
 * Fetch helpers for dashboard HTTP tests (write routes require token).
 */
import { dashboardWriteHeaders, ensureTestDashboardToken } from "./dashboard-auth.mjs";

ensureTestDashboardToken();

export function writeAuthHeaders(method = "GET", extra = {}) {
  const isWrite = method !== "GET" && method !== "HEAD";
  return {
    ...(extra["Content-Type"] || extra["content-type"] ? {} : { "Content-Type": "application/json" }),
    ...(isWrite ? dashboardWriteHeaders() : {}),
    ...extra,
  };
}

export async function dashboardFetch(url, options = {}) {
  const method = options.method ?? "GET";
  return fetch(url, {
    ...options,
    headers: writeAuthHeaders(method, options.headers ?? {}),
  });
}
