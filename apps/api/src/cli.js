#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runOnce } from "../../../packages/orchestrator/src/run.js";

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf-8")
);
const VERSION = packageJson.version;

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
 * Show version information
 */
function showVersion() {
  console.log(`ledgerrun v${VERSION}`);
}

/**
 * Show help/usage information
 */
function showHelp() {
  console.log(`
LedgerRun CLI v${VERSION} - Policy-driven ETF allocation engine

USAGE:
  ledgerrun <command> [options]

COMMANDS:
  plan              Generate allocation plan (dry-run, no execution)
  execute           Execute allocation (requires --execute flag)

OPTIONS:
  --policy <path>   Path to policy JSON file (default: policies/core.json)
  --execute         Execute orders (only with 'execute' command, requires explicit flag)
  --dry-run         Dry-run mode - no orders executed (default for 'execute')
  --json            Output result as JSON (for scripting/CI)
  --quiet, -q       Minimal output (suppress banner and details)
  --help, -h        Show this help message
  --version, -v     Show version number

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

  // Check for version flag
  if (args.includes("--version") || args.includes("-v")) {
    showVersion();
    process.exit(0);
  }

  const command = args[0]; // 'plan' or 'execute'

  const options = {
    policyPath: "policies/core.json", // default
    dryRun: true,
    execute: false,
    json: false,
    quiet: false
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
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--quiet" || arg === "-q") {
      options.quiet = true;
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

function reportError(error, jsonMode = false) {
  const message = formatErrorMessage(error);

  if (jsonMode) {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(`\n❌ Error: ${message}`);
    if (process.env.DEBUG && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
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
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: error.message }));
    } else {
      console.error(`\n❌ Error: ${error.message}\n`);
      showHelp();
      if (process.env.DEBUG && error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }

  if (!options.json && !options.quiet) {
    console.log(`🚀 LedgerRun CLI v${VERSION}\n`);
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
    reportError(new Error("Only paper trading is supported. Set ALPACA_PAPER=true"), options.json);
  }

  const broker = new MockBroker({ isPaper: isPaperMode });

  try {
    const result = await runOnce({
      policyPath: options.policyPath,
      broker,
      dryRun: options.dryRun,
      execute: options.execute,
      silent: options.json || options.quiet
    });

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        command,
        dryRun: options.dryRun,
        ...result
      }));
    } else if (!options.quiet) {
      console.log("\n✅ Run complete");
    }
    process.exit(0);
  } catch (error) {
    reportError(error, options.json);
  }
}

main();
