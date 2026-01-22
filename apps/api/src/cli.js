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
 * Show help/usage information
 */
function showHelp() {
  console.log(`
LedgerRun CLI - Policy-driven ETF allocation engine

USAGE:
  ledgerrun <command> [options]

COMMANDS:
  plan              Generate allocation plan (dry-run, no execution)
  execute           Execute allocation (requires --execute flag)

OPTIONS:
  --policy <path>   Path to policy JSON file (default: policies/core.json)
  --execute         Execute orders (only with 'execute' command, requires explicit flag)
  --dry-run         Dry-run mode - no orders executed (default for 'execute')
  --help, -h        Show this help message

EXAMPLES:
  # Generate a plan (dry-run)
  npm run plan

  # Generate a plan with custom policy
  npm run plan -- --policy policies/aggressive.json

  # Execute with dry-run (safe, no actual orders)
  npm run execute -- --policy policies/core.json --dry-run

  # Execute orders (REQUIRES --execute flag)
  npm run execute -- --policy policies/core.json --execute

SAFETY:
  - Only paper trading is supported (ALPACA_PAPER must be true or unset)
  - 'execute' command requires explicit --execute flag to place orders
  - Default behavior is always dry-run (safe)

ENVIRONMENT:
  ALPACA_PAPER      Must be 'true' or unset (default: true)
  DEBUG             Set to any value to show full error stack traces

For more information, see: README.md
`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

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

function formatErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unexpected error occurred";
  }
}

function reportError(error) {
  const message = formatErrorMessage(error);
  console.error(`\n❌ Error: ${message}`);

  if (process.env.DEBUG && error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  process.exit(1);
}

/**
 * Main CLI entry point
 */
async function main() {
  const { command, options } = parseArgs();

  if (!command || !["plan", "execute"].includes(command)) {
    const error = new Error("Invalid or missing command");
    console.error(`\n❌ Error: ${error.message}\n`);
    showHelp();
    if (process.env.DEBUG && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  console.log("🚀 LedgerRun CLI\n");

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
    reportError(new Error("Only paper trading is supported. Set ALPACA_PAPER=true"));
  }

  const broker = new MockBroker({ isPaper: isPaperMode });

  try {
    const _result = await runOnce({
      policyPath: options.policyPath,
      broker,
      dryRun: options.dryRun,
      execute: options.execute
    });

    console.log("\n✅ Run complete");
    process.exit(0);
  } catch (error) {
    reportError(error);
  }
}

main();
