import test from "node:test";
import assert from "node:assert/strict";
import { validatePolicy, validateSnapshot } from "../../packages/core/src/validate.js";

// Policy Validation Tests

test("validatePolicy - rejects invalid version", () => {
  const policy = {
    version: 2,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /version must be 1/);
});

test("validatePolicy - rejects non-object", () => {
  assert.throws(() => validatePolicy(null), /Policy must be an object/);
  assert.throws(() => validatePolicy("invalid"), /Policy must be an object/);
});

test("validatePolicy - rejects empty targets", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /non-empty array/);
});

test("validatePolicy - rejects duplicate symbols", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: 0.5 },
      { symbol: "VTI", targetWeight: 0.5 }
    ],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Duplicate target symbol: VTI/);
});

test("validatePolicy - rejects weights that don't sum to 1", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: 0.6 },
      { symbol: "VXUS", targetWeight: 0.5 } // Sum = 1.1
    ],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /must sum to 1/);
});

test("validatePolicy - rejects negative targetWeight", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: -0.5 }
    ],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid targetWeight/);
});

test("validatePolicy - rejects targetWeight > 1", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: 1.5 }
    ],
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid targetWeight/);
});

test("validatePolicy - rejects invalid cashBufferPct", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    cashBufferPct: 1.5, // > 1
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid cashBufferPct/);
});

test("validatePolicy - rejects negative minInvestAmountUsd", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    minInvestAmountUsd: -10,
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid minInvestAmountUsd/);
});

test("validatePolicy - rejects non-integer maxOrders", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    maxOrders: 2.5,
    drift: { kind: "none" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid maxOrders/);
});

test("validatePolicy - rejects invalid drift.kind", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    drift: { kind: "invalid" }
  };

  assert.throws(() => validatePolicy(policy), /Invalid drift.kind/);
});

test("validatePolicy - rejects band drift without maxAbsPct", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [{ symbol: "VTI", targetWeight: 1.0 }],
    drift: { kind: "band" } // Missing maxAbsPct
  };

  assert.throws(() => validatePolicy(policy), /Invalid drift.maxAbsPct/);
});

test("validatePolicy - accepts valid policy", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: 0.7 },
      { symbol: "VXUS", targetWeight: 0.3 }
    ],
    cashBufferPct: 0.1,
    minInvestAmountUsd: 10,
    maxInvestAmountUsd: 1000,
    minOrderUsd: 5,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.05 },
    allowMissingPrices: false
  };

  assert.doesNotThrow(() => validatePolicy(policy));
});

// Snapshot Validation Tests

test("validateSnapshot - rejects non-object", () => {
  assert.throws(() => validateSnapshot(null), /Snapshot must be an object/);
});

test("validateSnapshot - rejects missing asOfIso", () => {
  const snapshot = {
    cashUsd: 100,
    positions: [],
    pricesUsd: {}
  };

  assert.throws(() => validateSnapshot(snapshot), /asOfIso must be an ISO string/);
});

test("validateSnapshot - rejects negative cashUsd", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: -10,
    positions: [],
    pricesUsd: {}
  };

  assert.throws(() => validateSnapshot(snapshot), /cashUsd must be >= 0/);
});

test("validateSnapshot - rejects non-array positions", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: "invalid",
    pricesUsd: {}
  };

  assert.throws(() => validateSnapshot(snapshot), /positions must be an array/);
});

test("validateSnapshot - rejects missing pricesUsd", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: []
  };

  assert.throws(() => validateSnapshot(snapshot), /pricesUsd must be an object/);
});

test("validateSnapshot - rejects position with negative quantity", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: -5, marketValueUsd: 100 }
    ],
    pricesUsd: { VTI: 20 }
  };

  assert.throws(() => validateSnapshot(snapshot), /Invalid quantity/);
});

test("validateSnapshot - rejects position with negative marketValueUsd", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [
      { symbol: "VTI", quantity: 5, marketValueUsd: -100 }
    ],
    pricesUsd: { VTI: 20 }
  };

  assert.throws(() => validateSnapshot(snapshot), /Invalid marketValueUsd/);
});

test("validateSnapshot - rejects invalid price entries", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [],
    pricesUsd: {
      VTI: "not-a-number"
    }
  };

  assert.throws(() => validateSnapshot(snapshot), /Invalid price for VTI/);
});

test("validateSnapshot - accepts valid snapshot", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 500,
    positions: [
      { symbol: "VTI", quantity: 2, marketValueUsd: 500 },
      { symbol: "VXUS", quantity: 3, marketValueUsd: 180 }
    ],
    pricesUsd: {
      VTI: 250,
      VXUS: 60
    }
  };

  assert.doesNotThrow(() => validateSnapshot(snapshot));
});
