import test from "node:test";
import assert from "node:assert/strict";
import { allocate } from "../../packages/core/src/allocate.js";

function basePolicy(overrides = {}) {
  return {
    version: 1,
    name: "Core DCA",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10_000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
    ...overrides
  };
}

function baseSnapshot(overrides = {}) {
  return {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 250 },
      { symbol: "VXUS", quantity: 1, marketValueUsd: 60 }
    ],
    pricesUsd: { VTI: 250, VXUS: 60 },
    ...overrides
  };
}

test("pro-rata allocation when within drift band", () => {
  const policy = basePolicy({ drift: { kind: "band", maxAbsPct: 0.5 } });
  const snap = baseSnapshot({ cashUsd: 100 });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");
  assert.equal(plan.legs.length, 2);

  const vti = plan.legs.find((l) => l.symbol === "VTI");
  const vxus = plan.legs.find((l) => l.symbol === "VXUS");

  assert.equal(vti.notionalUsd, 70);
  assert.equal(vxus.notionalUsd, 30);
});

test("NOOP when investable cash below minInvestAmountUsd", () => {
  const policy = basePolicy({ minInvestAmountUsd: 50 });
  const snap = baseSnapshot({ cashUsd: 10 });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "NOOP");
});

test("throws if price missing for target (strict mode)", () => {
  const policy = basePolicy({ allowMissingPrices: false });
  const snap = baseSnapshot({ pricesUsd: { VTI: 250 } });

  assert.throws(() => allocate(policy, snap), /Missing\/invalid price/);
});

test("reports missing price in non-strict mode", () => {
  const policy = basePolicy({ allowMissingPrices: true });
  const snap = baseSnapshot({
    cashUsd: 100,
    pricesUsd: { VTI: 250 } // VXUS price missing
  });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");
  // Should note the missing price
  assert.ok(plan.notes.some((n) => n.includes("Missing/invalid price for VXUS")));
  // Both symbols still get allocation (current behavior)
  assert.ok(plan.legs.length >= 1);
});

test("rounding stability - no drift beyond $0.01", () => {
  const policy = basePolicy({ drift: { kind: "band", maxAbsPct: 0.5 } });
  const snap = baseSnapshot({ cashUsd: 123.456 });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");

  // Verify all notional amounts are rounded to cents
  for (const leg of plan.legs) {
    const cents = Math.round(leg.notionalUsd * 100);
    assert.equal(leg.notionalUsd, cents / 100, `${leg.symbol} should be rounded to cents`);
  }

  // Verify total planned spend doesn't exceed investable cash by more than rounding error
  const totalPlanned = plan.legs.reduce((sum, leg) => sum + leg.notionalUsd, 0);
  assert.ok(totalPlanned <= plan.investableCashUsd + 0.01, "Planned spend should not exceed investable cash");
});

test("minOrderUsd threshold behavior", () => {
  const policy = basePolicy({
    minOrderUsd: 50,
    drift: { kind: "band", maxAbsPct: 0.5 }
  });
  const snap = baseSnapshot({ cashUsd: 80 }); // $56 for VTI (70%), $24 for VXUS (30%)

  const plan = allocate(policy, snap);

  // VTI should be $56 (above threshold), VXUS should be $24 (below threshold, skipped)
  const vti = plan.legs.find((l) => l.symbol === "VTI");
  const vxus = plan.legs.find((l) => l.symbol === "VXUS");

  assert.ok(vti, "VTI order should be created");
  assert.equal(vti.notionalUsd, 56);
  assert.ok(!vxus, "VXUS order should be skipped (below minOrderUsd)");
});

test("drift band mode switching - outside band prioritizes underweights", () => {
  const policy = basePolicy({
    drift: { kind: "band", maxAbsPct: 0.03 }
  });

  // Create snapshot with VTI heavily underweight (20% vs 70% target)
  const snap = baseSnapshot({
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 200 }, // 20% current
      { symbol: "VXUS", quantity: 10, marketValueUsd: 800 } // 80% current
    ],
    pricesUsd: { VTI: 200, VXUS: 80 }
  });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");

  // Should be in underweight mode
  assert.ok(plan.notes.some((n) => n.includes("Outside drift band")));
  assert.ok(plan.notes.some((n) => n.includes("prioritizing underweights")));

  // VTI is underweight, VXUS is overweight
  // Should allocate more to VTI
  const vti = plan.legs.find((l) => l.symbol === "VTI");
  const vxus = plan.legs.find((l) => l.symbol === "VXUS");

  assert.ok(vti, "VTI should get allocation (underweight)");
  assert.equal(vti.notionalUsd, 100); // Gets all the cash
  assert.ok(!vxus, "VXUS should not get allocation (overweight)");
});

test("drift band mode switching - within band uses pro-rata", () => {
  const policy = basePolicy({
    drift: { kind: "band", maxAbsPct: 0.5 } // Large band
  });

  const snap = baseSnapshot({
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 250 },
      { symbol: "VXUS", quantity: 1, marketValueUsd: 60 }
    ]
  });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");

  // Should be in pro-rata mode
  assert.ok(plan.notes.some((n) => n.includes("Within drift band")));
  assert.ok(plan.notes.some((n) => n.includes("allocating pro-rata")));

  // Should allocate 70%/30% of cash
  const vti = plan.legs.find((l) => l.symbol === "VTI");
  const vxus = plan.legs.find((l) => l.symbol === "VXUS");

  assert.equal(vti.notionalUsd, 70);
  assert.equal(vxus.notionalUsd, 30);
});

test("maxOrders cap enforcement", () => {
  const policy = {
    version: 1,
    name: "Multi-target",
    targets: [
      { symbol: "VTI", targetWeight: 0.4 },
      { symbol: "VXUS", targetWeight: 0.3 },
      { symbol: "BND", targetWeight: 0.2 },
      { symbol: "BNDX", targetWeight: 0.1 }
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 2, // Cap at 2 orders
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false
  };

  const snap = {
    asOfIso: new Date().toISOString(),
    cashUsd: 1000,
    positions: [],
    pricesUsd: { VTI: 250, VXUS: 60, BND: 80, BNDX: 50 }
  };

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");
  assert.ok(plan.legs.length <= 2, "Should enforce maxOrders cap");
  assert.ok(plan.notes.some((n) => n.includes("Applied maxOrders")));
});

test("cashBufferPct reserves cash correctly", () => {
  const policy = basePolicy({
    cashBufferPct: 0.2, // Reserve 20% of total value as cash
    drift: { kind: "band", maxAbsPct: 0.5 }
  });

  const snap = baseSnapshot({
    cashUsd: 500,
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 250 },
      { symbol: "VXUS", quantity: 1, marketValueUsd: 60 }
    ]
  });

  const plan = allocate(policy, snap);
  // Total value = 500 + 250 + 60 = 810
  // Buffer = 0.2 * 810 = 162
  // Investable = 500 - 162 = 338

  assert.equal(plan.investableCashUsd, 338);
  assert.ok(plan.notes.some((n) => n.includes("Applied cash buffer")));
});

test("maxInvestAmountUsd cap enforcement", () => {
  const policy = basePolicy({
    maxInvestAmountUsd: 50,
    drift: { kind: "band", maxAbsPct: 0.5 }
  });

  const snap = baseSnapshot({ cashUsd: 1000 });

  const plan = allocate(policy, snap);
  assert.equal(plan.investableCashUsd, 50);
  // Planned spend may be slightly less due to rounding
  assert.ok(plan.plannedSpendUsd <= 50 && plan.plannedSpendUsd >= 49.99);
  assert.ok(plan.notes.some((n) => n.includes("Applied max invest cap")));
});

test("noopIfWithinBand option triggers NOOP when within band", () => {
  const policy = basePolicy({
    drift: { kind: "band", maxAbsPct: 0.5 }
  });

  const snap = baseSnapshot({ cashUsd: 100 });

  const plan = allocate(policy, snap, { noopIfWithinBand: true });
  assert.equal(plan.status, "NOOP");
  assert.ok(plan.notes.some((n) => n.includes("within drift band")));
});
