import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";

/**
 * Helper to run CLI command in subprocess
 */
function runCLI(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["apps/api/src/cli.js", ...args], {
      cwd: "/home/user/ledgerrun",
      env: { ...process.env, ...env }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (error) => {
      reject(error);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error("CLI command timeout"));
    }, 10000);
  });
}

test("CLI plan command exits 0 and shows expected output", async () => {
  const result = await runCLI(["plan", "--policy", "policies/core.json"]);

  assert.equal(result.code, 0, "Should exit with code 0");
  assert.ok(result.stdout.includes("LedgerRun CLI"), "Should show CLI header");
  assert.ok(result.stdout.includes("Loaded policy"), "Should show policy loaded");
  assert.ok(result.stdout.includes("Plan Status"), "Should show plan status");
  assert.ok(result.stdout.includes("DRY RUN MODE"), "Should show dry run marker");
  assert.ok(result.stdout.includes("Run complete"), "Should show completion");
});

test("CLI execute command with --dry-run exits 0", async () => {
  const result = await runCLI(["execute", "--policy", "policies/core.json", "--dry-run"]);

  assert.equal(result.code, 0, "Should exit with code 0");
  assert.ok(result.stdout.includes("DRY RUN MODE"), "Should show dry run marker");
});

test("CLI execute command without --execute flag defaults to dry-run", async () => {
  const result = await runCLI(["execute", "--policy", "policies/core.json"]);

  assert.equal(result.code, 0, "Should exit with code 0");
  assert.ok(result.stdout.includes("DRY RUN MODE"), "Should show dry run marker");
  assert.ok(!result.stdout.includes("Executing orders"), "Should not execute orders");
});

test("CLI shows error for invalid policy file", async () => {
  const result = await runCLI(["plan", "--policy", "nonexistent.json"]);

  assert.notEqual(result.code, 0, "Should exit with non-zero code");
  assert.ok(result.stdout.includes("Error") || result.stderr.includes("Error"), "Should show error message");
});

test("CLI shows error when ALPACA_PAPER is explicitly false", async () => {
  const result = await runCLI(["plan", "--policy", "policies/core.json"], { ALPACA_PAPER: "false" });

  assert.notEqual(result.code, 0, "Should exit with non-zero code");
  const output = result.stdout + result.stderr;
  assert.ok(
    output.toLowerCase().includes("paper") ||
    output.toLowerCase().includes("alpaca_paper"),
    "Should mention paper trading requirement"
  );
});

test("CLI plan with custom policy file works", async () => {
  const tmpPolicy = "/tmp/cli-test-policy-" + Date.now() + ".json";

  const policy = {
    version: 1,
    name: "CLI Test Policy",
    targets: [
      { symbol: "VTI", targetWeight: 0.6 }, // Use symbol that mock broker has
      { symbol: "VXUS", targetWeight: 0.4 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 5000,
    minOrderUsd: 1,
    maxOrders: 5,
    drift: { kind: "none" },
    allowMissingPrices: false
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const result = await runCLI(["plan", "--policy", tmpPolicy]);

    assert.equal(result.code, 0, "Should exit with code 0");
    assert.ok(result.stdout.includes("CLI Test Policy"), "Should load custom policy");
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});

test("CLI shows usage for invalid command", async () => {
  const result = await runCLI(["invalid-command"]);

  assert.notEqual(result.code, 0, "Should exit with non-zero code");
  assert.ok(
    result.stdout.includes("Usage") || result.stderr.includes("Usage"),
    "Should show usage information"
  );
});
