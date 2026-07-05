#!/usr/bin/env node
/** Minimal stand-in for costgate-gate in launch wrapper tests. */
const delayMs = Number(process.env.COSTGATE_MOCK_GATE_DELAY_MS ?? 0);
if (delayMs > 0) {
  setTimeout(() => process.exit(0), delayMs);
} else {
  process.exit(0);
}
