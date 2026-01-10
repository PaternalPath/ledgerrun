import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir, writeFile } from "node:fs/promises";
import {
  checkPositionSizeLimit,
  checkDailySpendLimit,
  checkLargeOrder,
  validatePolicySafety,
  runSafetyChecks,
} from "../../packages/orchestrator/src/guardrails.js";

const TEST_RUNS_DIR = "/tmp/ledgerrun-test-guardrails-" + Date.now();

test("checkPositionSizeLimit allows safe positions", () => {
  const leg = {
    symbol: "VTI",
    notionalUsd: 100,
  };

  const snapshot = {
    cashUsd: 1000,
    positions: [
      { symbol: "VTI", marketValueUsd: 200 },
    ],
    pricesUsd: { VTI: 250 },
  };

  const result = checkPositionSizeLimit(leg, snapshot, 0.5);

  assert.equal(result.safe, true, "Should allow position under limit");
});

test("checkPositionSizeLimit blocks oversized positions", () => {
  const leg = {
    symbol: "VTI",
    notionalUsd: 800, // Would make position 1000 / 1200 = 83%
  };

  const snapshot = {
    cashUsd: 1000,
    positions: [
      { symbol: "VTI", marketValueUsd: 200 },
    ],
    pricesUsd: { VTI: 250 },
  };

  const result = checkPositionSizeLimit(leg, snapshot, 0.5); // 50% max

  assert.equal(result.safe, false, "Should block position over limit");
  assert.ok(result.reason, "Should provide reason");
  assert.ok(result.reason.includes("50"), "Should mention limit");
});

test("checkDailySpendLimit allows spending under limit", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  try {
    const result = await checkDailySpendLimit(100, TEST_RUNS_DIR, 10000);

    assert.equal(result.safe, true, "Should allow spending under limit");
    assert.ok(result.remainingLimit > 0, "Should have remaining limit");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("checkDailySpendLimit blocks spending over limit", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  try {
    // Create a run from today with high spending
    const today = new Date().toISOString();
    const metadata = {
      idempotencyKey: "test-key",
      timestamp: today,
      executed: true,
      plan: {
        plannedSpendUsd: 9000,
      },
    };

    await writeFile(
      `${TEST_RUNS_DIR}/test-key.json`,
      JSON.stringify(metadata)
    );

    // Try to spend another 2000 (total 11000, over 10000 limit)
    const result = await checkDailySpendLimit(2000, TEST_RUNS_DIR, 10000);

    assert.equal(result.safe, false, "Should block spending over limit");
    assert.ok(result.reason, "Should provide reason");
    assert.ok(result.reason.includes("11000"), "Should mention total spending");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("checkLargeOrder detects large orders", () => {
  const leg = {
    symbol: "VTI",
    notionalUsd: 500, // 50% of 1000 portfolio
  };

  const snapshot = {
    cashUsd: 500,
    positions: [
      { symbol: "VXUS", marketValueUsd: 500 },
    ],
    pricesUsd: { VTI: 250, VXUS: 60 },
  };

  const result = checkLargeOrder(leg, snapshot, 0.1); // 10% threshold

  assert.equal(result.isLarge, true, "Should detect large order");
  assert.ok(result.reason, "Should provide reason");
});

test("checkLargeOrder allows normal orders", () => {
  const leg = {
    symbol: "VTI",
    notionalUsd: 50, // 5% of 1000 portfolio
  };

  const snapshot = {
    cashUsd: 500,
    positions: [
      { symbol: "VXUS", marketValueUsd: 500 },
    ],
    pricesUsd: { VTI: 250, VXUS: 60 },
  };

  const result = checkLargeOrder(leg, snapshot, 0.1); // 10% threshold

  assert.equal(result.isLarge, false, "Should allow normal order");
});

test("validatePolicySafety detects issues", () => {
  const policy = {
    targets: [
      { symbol: "VTI", targetWeight: 0.6 },
      { symbol: "VXUS", targetWeight: 0.5 }, // Sum > 1.0
    ],
    maxInvestAmountUsd: 150000, // Very high
    minOrderUsd: 2000, // High
  };

  const result = validatePolicySafety(policy);

  assert.equal(result.valid, false, "Should detect policy issues");
  assert.ok(result.warnings.length > 0, "Should have warnings");
});

test("validatePolicySafety validates safe policies", () => {
  const policy = {
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
  };

  const result = validatePolicySafety(policy);

  assert.equal(result.valid, true, "Should validate safe policy");
  assert.equal(result.warnings.length, 0, "Should have no warnings");
});

test("runSafetyChecks integrates all checks", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  try {
    const plan = {
      status: "PLANNED",
      plannedSpendUsd: 500,
      legs: [
        {
          symbol: "VTI",
          notionalUsd: 300,
        },
      ],
    };

    const snapshot = {
      cashUsd: 1000,
      positions: [],
      pricesUsd: { VTI: 250 },
    };

    const policy = {
      targets: [{ symbol: "VTI", targetWeight: 1.0 }],
      maxInvestAmountUsd: 10000,
      minOrderUsd: 1,
    };

    const result = await runSafetyChecks(plan, snapshot, policy, {
      runsDir: TEST_RUNS_DIR,
      maxPositionPct: 0.5,
      dailySpendLimit: 10000,
      largeOrderThreshold: 0.1,
    });

    assert.equal(result.safe, true, "Should pass all checks");
    assert.ok(Array.isArray(result.blocking), "Should have blocking array");
    assert.ok(Array.isArray(result.warnings), "Should have warnings array");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("runSafetyChecks detects blocking issues", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  try {
    const plan = {
      status: "PLANNED",
      plannedSpendUsd: 1200,
      legs: [
        {
          symbol: "VTI",
          notionalUsd: 1200, // Would be 120% of portfolio
        },
      ],
    };

    const snapshot = {
      cashUsd: 1000,
      positions: [],
      pricesUsd: { VTI: 250 },
    };

    const policy = {
      targets: [{ symbol: "VTI", targetWeight: 1.0 }],
      maxInvestAmountUsd: 10000,
      minOrderUsd: 1,
    };

    const result = await runSafetyChecks(plan, snapshot, policy, {
      runsDir: TEST_RUNS_DIR,
      maxPositionPct: 0.5, // 50% max
      dailySpendLimit: 10000,
      largeOrderThreshold: 0.1,
    });

    assert.equal(result.safe, false, "Should fail safety checks");
    assert.ok(result.blocking.length > 0, "Should have blocking issues");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});
