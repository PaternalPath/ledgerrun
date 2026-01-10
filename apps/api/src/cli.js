#!/usr/bin/env node

import { runOnce, runWithIdempotency } from "../../../packages/orchestrator/src/run.js";
import { listRuns } from "../../../packages/orchestrator/src/persistence.js";

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
  const command = args[0]; // 'plan', 'execute', 'run', or 'history'

  const options = {
    policyPath: "policies/core.json", // default
    dryRun: true,
    execute: false,
    granularity: "daily", // default for idempotency
    runsDir: "./runs", // default runs directory
    skipIdempotency: false,
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
    } else if (arg === "--granularity" && i + 1 < args.length) {
      options.granularity = args[i + 1];
      i++;
    } else if (arg === "--runs-dir" && i + 1 < args.length) {
      options.runsDir = args[i + 1];
      i++;
    } else if (arg === "--skip-idempotency") {
      options.skipIdempotency = true;
    } else if (arg === "--limit" && i + 1 < args.length) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
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

  // Handle 'history' command separately (no broker needed)
  if (command === "history") {
    try {
      const runs = await listRuns(options.runsDir);

      if (runs.length === 0) {
        console.log("No runs found.");
        process.exit(0);
      }

      const limit = options.limit || runs.length;
      const displayRuns = runs.slice(0, limit);

      console.log(`📜 Run History (showing ${displayRuns.length} of ${runs.length} runs):\n`);

      for (const run of displayRuns) {
        console.log(`🔑 ${run.idempotencyKey}`);
        console.log(`   Timestamp: ${run.timestamp}`);
        console.log(`   Policy: ${run.policyName}`);
        console.log(`   Status: ${run.status}`);
        console.log(`   Executed: ${run.executed ? "Yes" : "No"}`);
        if (run.plan && run.plan.legs) {
          console.log(`   Orders: ${run.plan.legs.length}`);
          console.log(`   Planned Spend: $${run.plan.plannedSpendUsd.toFixed(2)}`);
        }
        if (run.execution) {
          console.log(`   Orders Placed: ${run.execution.ordersPlaced}`);
        }
        console.log("");
      }

      process.exit(0);
    } catch (error) {
      console.error("❌ Error:", error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  // Validate command
  if (!command || !["plan", "execute", "run"].includes(command)) {
    console.error("Usage:");
    console.error("  npm run plan -- --policy <path>                    # Dry run (default)");
    console.error("  npm run execute -- --policy <path> --execute       # Execute orders (requires --execute flag)");
    console.error("  npm run execute -- --policy <path> --dry-run       # Dry run only");
    console.error("  node apps/api/src/cli.js run --policy <path> --execute  # Scheduler-friendly with idempotency");
    console.error("  node apps/api/src/cli.js history [--limit N]       # Show run history");
    console.error("");
    console.error("Run command options:");
    console.error("  --granularity <daily|hourly>    # Idempotency granularity (default: daily)");
    console.error("  --runs-dir <path>               # Directory for run metadata (default: ./runs)");
    console.error("  --skip-idempotency              # Skip idempotency check");
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
    let result;

    // Use runWithIdempotency for 'run' command, runOnce for others
    if (command === "run") {
      result = await runWithIdempotency({
        policyPath: options.policyPath,
        broker,
        dryRun: options.dryRun,
        execute: options.execute,
        granularity: options.granularity,
        runsDir: options.runsDir,
        skipIdempotency: options.skipIdempotency,
      });

      if (result.skipped) {
        console.log("\n⏭️  Run skipped due to idempotency");
        process.exit(0);
      }
    } else {
      result = await runOnce({
        policyPath: options.policyPath,
        broker,
        dryRun: options.dryRun,
        execute: options.execute,
      });
    }

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
