import test from "node:test";
import assert from "node:assert/strict";
import { allocate } from "../../packages/core/src/allocate.js";

function basePolicy(overrides = {}) {
  return {
    version: 1,
    name: "Core DCA",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 },
    ],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10_000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
    allowMissingPrices: false,
    ...overrides,
  };
}

function baseSnapshot(overrides = {}) {
  return {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 250 },
      { symbol: "VXUS", quantity: 1, marketValueUsd: 60 },
    ],
    pricesUsd: { VTI: 250, VXUS: 60 },
    ...overrides,
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
