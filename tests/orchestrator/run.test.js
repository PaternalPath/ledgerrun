import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { runOnce } from "../../packages/orchestrator/src/run.js";

/**
 * Mock broker for testing - no network calls
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

    // Default mock snapshot
    return {
      asOfIso: new Date().toISOString(),
      cashUsd: 500.0,
      positions: [
        { symbol: "VTI", quantity: 1, marketValueUsd: 250.0 },
        { symbol: "VXUS", quantity: 1, marketValueUsd: 60.0 }
      ],
      pricesUsd: {
        VTI: 250.0,
        VXUS: 60.0
      }
    };
  }

  async executeOrders(legs) {
    this._executedOrders.push(...legs);
    return {
      ordersPlaced: legs.length,
      orderIds: legs.map((_, i) => `test-order-${Date.now()}-${i}`)
    };
  }

  getExecutedOrders() {
    return this._executedOrders;
  }
}

test("orchestrator dry run does not execute orders", async () => {
  const tmpPolicy = "/tmp/test-policy-" + Date.now() + ".json";

  const policy = {
    version: 1,
    name: "Test Policy",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: true });
    const result = await runOnce({
      policyPath: tmpPolicy,
      broker,
      dryRun: true,
      execute: false,
      silent: true
    });

    assert.ok(result.plan, "Should return a plan");
    assert.equal(broker.getExecutedOrders().length, 0, "Should not execute orders in dry run");
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});

test("orchestrator executes orders when execute=true", async () => {
  const tmpPolicy = "/tmp/test-policy-exec-" + Date.now() + ".json";

  const policy = {
    version: 1,
    name: "Test Policy",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: true });
    const result = await runOnce({
      policyPath: tmpPolicy,
      broker,
      dryRun: false,
      execute: true,
      silent: true
    });

    assert.ok(result.plan, "Should return a plan");
    if (result.plan.status === "PLANNED") {
      assert.ok(broker.getExecutedOrders().length > 0, "Should execute orders when execute=true");
      assert.ok(result.execution, "Should return execution result");
    }
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});

test("orchestrator refuses non-paper broker", async () => {
  const tmpPolicy = "/tmp/test-policy-nopaper-" + Date.now() + ".json";

  const policy = {
    version: 1,
    name: "Test Policy",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: false });

    await assert.rejects(
      async () => {
        await runOnce({
          policyPath: tmpPolicy,
          broker,
          dryRun: true,
          execute: false,
          silent: true
        });
      },
      /paper/i,
      "Should reject non-paper broker"
    );
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});

test("orchestrator handles NOOP status", async () => {
  const tmpPolicy = "/tmp/test-policy-noop-" + Date.now() + ".json";

  const policy = {
    version: 1,
    name: "Test Policy NOOP",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1000, // High threshold to trigger NOOP
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false
  };

  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 50.0, // Low cash to trigger NOOP
    positions: [],
    pricesUsd: { VTI: 250.0, VXUS: 60.0 }
  };

  await writeFile(tmpPolicy, JSON.stringify(policy, null, 2));

  try {
    const broker = new MockBroker({ isPaper: true, snapshot });
    const result = await runOnce({
      policyPath: tmpPolicy,
      broker,
      dryRun: false,
      execute: true,
      silent: true
    });

    assert.equal(result.plan.status, "NOOP", "Should return NOOP status");
    assert.equal(broker.getExecutedOrders().length, 0, "Should not execute orders for NOOP");
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});
