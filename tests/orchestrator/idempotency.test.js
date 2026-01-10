import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { runWithIdempotency } from "../../packages/orchestrator/src/run.js";

const TEST_RUNS_DIR = "/tmp/ledgerrun-test-idempotency-" + Date.now();

/**
 * Mock broker for testing
 */
class MockBroker {
  constructor({ isPaper = true, snapshot = null } = {}) {
    this._isPaper = isPaper;
    this._snapshot = snapshot;
    this._executedOrders = [];
  }

  isPaper() {
    return this._isPaper;
  }

  async getSnapshot() {
    if (this._snapshot) {
      return this._snapshot;
    }

    return {
      asOfIso: new Date().toISOString(),
      cashUsd: 500.0,
      positions: [
        { symbol: "VTI", quantity: 1, marketValueUsd: 250.0 },
        { symbol: "VXUS", quantity: 1, marketValueUsd: 60.0 },
      ],
      pricesUsd: {
        VTI: 250.0,
        VXUS: 60.0,
      },
    };
  }

  async executeOrders(legs) {
    this._executedOrders.push(...legs);
    return {
      ordersPlaced: legs.length,
      orderIds: legs.map((_, i) => `test-order-${Date.now()}-${i}`),
    };
  }

  getExecutedOrders() {
    return this._executedOrders;
  }
}

test("runWithIdempotency executes on first run", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const tmpPolicy = `${TEST_RUNS_DIR}/policy-first-run.json`;
  const policy = {
    version: 1,
    name: "Test Policy First Run",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: true });
    const result = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.ok(result.plan, "Should return a plan");
    assert.ok(result.metadata, "Should return metadata");
    assert.ok(result.idempotencyKey, "Should return idempotency key");
    assert.equal(result.skipped, undefined, "Should not be skipped on first run");

    if (result.plan.status === "PLANNED") {
      assert.ok(broker.getExecutedOrders().length > 0, "Should execute orders on first run");
    }
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("runWithIdempotency skips execution on duplicate run", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const tmpPolicy = `${TEST_RUNS_DIR}/policy-duplicate.json`;
  const policy = {
    version: 1,
    name: "Test Policy Duplicate",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker1 = new MockBroker({ isPaper: true });

    // First run - should execute
    const result1 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker1,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.equal(result1.skipped, undefined, "First run should not be skipped");

    const broker2 = new MockBroker({ isPaper: true });

    // Second run with same policy and date - should skip
    const result2 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker2,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.equal(result2.skipped, true, "Second run should be skipped");
    assert.equal(result2.reason, "idempotency", "Skip reason should be idempotency");
    assert.ok(result2.existingRun, "Should return existing run details");
    assert.equal(broker2.getExecutedOrders().length, 0, "Should not execute orders on duplicate run");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("runWithIdempotency allows multiple runs with skipIdempotency flag", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const tmpPolicy = `${TEST_RUNS_DIR}/policy-skip.json`;
  const policy = {
    version: 1,
    name: "Test Policy Skip",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker1 = new MockBroker({ isPaper: true });

    // First run
    const result1 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker1,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.equal(result1.skipped, undefined, "First run should not be skipped");

    const broker2 = new MockBroker({ isPaper: true });

    // Second run with skipIdempotency - should execute
    const result2 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker2,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
      skipIdempotency: true,
    });

    assert.equal(result2.skipped, undefined, "Second run with skipIdempotency should not be skipped");
    if (result2.plan.status === "PLANNED") {
      assert.ok(broker2.getExecutedOrders().length > 0, "Should execute orders with skipIdempotency");
    }
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("runWithIdempotency dry run does not check idempotency", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const tmpPolicy = `${TEST_RUNS_DIR}/policy-dryrun.json`;
  const policy = {
    version: 1,
    name: "Test Policy Dry Run",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker1 = new MockBroker({ isPaper: true });

    // First dry run
    const result1 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker1,
      dryRun: true,
      execute: false,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.equal(result1.skipped, undefined, "Dry run should not be skipped");
    assert.equal(broker1.getExecutedOrders().length, 0, "Dry run should not execute");

    const broker2 = new MockBroker({ isPaper: true });

    // Second dry run - should also not skip (dry runs don't check idempotency)
    const result2 = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker: broker2,
      dryRun: true,
      execute: false,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "daily",
    });

    assert.equal(result2.skipped, undefined, "Second dry run should not be skipped");
    assert.equal(broker2.getExecutedOrders().length, 0, "Second dry run should not execute");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("runWithIdempotency handles hourly granularity", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const tmpPolicy = `${TEST_RUNS_DIR}/policy-hourly.json`;
  const policy = {
    version: 1,
    name: "Test Policy Hourly",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: true });

    const result = await runWithIdempotency({
      policyPath: tmpPolicy,
      broker,
      dryRun: false,
      execute: true,
      silent: true,
      runsDir: TEST_RUNS_DIR,
      granularity: "hourly",
    });

    assert.ok(result.metadata, "Should return metadata");
    assert.equal(result.metadata.granularity, "hourly", "Should use hourly granularity");
    assert.ok(result.idempotencyKey.match(/\d{4}-\d{2}-\d{2}-\d{2}-/), "Idempotency key should include hour");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});
