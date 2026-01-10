#!/usr/bin/env node
/**
 * CLI entrypoint for Alpaca broker operations
 * Usage: ledgerrun-alpaca snapshot [symbols...]
 */

import { AlpacaClient } from "./client.js";
import { fetchSnapshot } from "./snapshot.js";

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  if (!command || command === "help" || command === "--help") {
    console.log(`
LedgerRun Alpaca CLI

Usage:
  ledgerrun-alpaca snapshot [symbols...]    Fetch current account snapshot
  ledgerrun-alpaca help                     Show this help

Environment Variables:
  ALPACA_API_KEY       Alpaca API Key (required)
  ALPACA_API_SECRET    Alpaca API Secret (required)

Examples:
  ledgerrun-alpaca snapshot
  ledgerrun-alpaca snapshot VTI VXUS BND
`);
    process.exit(0);
  }

  if (command === "snapshot") {
    try {
      const client = new AlpacaClient({ paper: true });
      const symbols = args.length > 0 ? args : [];

      const snapshot = await fetchSnapshot(client, symbols);
      console.log(JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.error("Error fetching snapshot:", err.message);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "ledgerrun-alpaca help" for usage information');
    process.exit(1);
  }
}

main();
