#!/usr/bin/env node

import { runOnce } from "../../../packages/orchestrator/src/run.js";

/**
 * Mock broker for testing and development
 * In production, this would be replaced with actual Alpaca API integration
 */
class MockBroker {
  constructor({ isPaper = true } = {}) {
    this._isPaper = isPaper;
  }

  isPaper() {
    return this._isPaper;
  }

  async getSnapshot() {
    // Mock snapshot data - simulates Alpaca paper account
    const now = new Date().toISOString();
    return {
      asOfIso: now,
      cashUsd: 1000.0,
      positions: [
        { symbol: "VTI", quantity: 2, marketValueUsd: 500.0 },
        { symbol: "VXUS", quantity: 3, marketValueUsd: 180.0 }
      ],
      pricesUsd: {
        VTI: 250.0,
        VXUS: 60.0
      }
    };
  }

  async executeOrders(legs) {
    // Mock order execution
    console.log("\n   📤 Submitting orders to broker (MOCK):");
    for (const leg of legs) {
      console.log(`      - Market buy ${leg.symbol} for $${leg.notionalUsd.toFixed(2)}`);
    }
    return {
      ordersPlaced: legs.length,
      orderIds: legs.map((_, i) => `mock-order-${Date.now()}-${i}`)
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0]; // 'plan' or 'execute'

  const options = {
    policyPath: "policies/core.json", // default
    dryRun: true,
    execute: false
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--policy" && i + 1 < args.length) {
      options.policyPath = args[i + 1];
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
      options.execute = false;
    } else if (arg === "--execute") {
      options.dryRun = false;
      options.execute = true;
    } else if (arg === "--no-dry-run") {
      options.dryRun = false;
    }
  }

  return { command, options };
}

/**
 * Main CLI entry point
 */
async function main() {
  const { command, options } = parseArgs();

  console.log("🚀 LedgerRun CLI\n");

  if (!command || !["plan", "execute"].includes(command)) {
    console.error("Usage:");
    console.error("  npm run plan -- --policy <path>           # Dry run (default)");
    console.error("  npm run execute -- --policy <path> --execute  # Execute orders (requires --execute flag)");
    console.error("  npm run execute -- --policy <path> --dry-run  # Dry run only");
    process.exit(1);
  }

  // Determine execution mode based on command and flags
  if (command === "plan") {
    options.dryRun = true;
    options.execute = false;
  } else if (command === "execute") {
    // For 'execute' command, require explicit --execute flag
    if (!options.execute) {
      options.dryRun = true;
      options.execute = false;
    }
  }

  // Create broker instance (mock for now)
  // In production, check env vars for Alpaca API keys and ensure paper mode
  const isPaperMode = process.env.ALPACA_PAPER === "true" || process.env.ALPACA_PAPER === undefined;

  if (!isPaperMode) {
    console.error("❌ ERROR: Only paper trading is supported. Set ALPACA_PAPER=true");
    process.exit(1);
  }

  const broker = new MockBroker({ isPaper: isPaperMode });

  try {
    const result = await runOnce({
      policyPath: options.policyPath,
      broker,
      dryRun: options.dryRun,
      execute: options.execute
    });

    console.log("\n✅ Run complete");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
