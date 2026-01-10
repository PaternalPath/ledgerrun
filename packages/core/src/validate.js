const EPS = 0.0005;

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function sumTargetWeights(targets) {
  return targets.reduce((acc, t) => acc + t.targetWeight, 0);
}

function toSymbolSet(targets) {
  const set = new Set();
  for (const t of targets) {
    if (set.has(t.symbol)) throw new Error(`Duplicate target symbol: ${t.symbol}`);
    set.add(t.symbol);
  }
  return set;
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") throw new Error("Policy must be an object.");
  if (policy.version !== 1) throw new Error("Policy version must be 1.");
  if (!Array.isArray(policy.targets) || policy.targets.length === 0) {
    throw new Error("Policy.targets must be a non-empty array.");
  }

  toSymbolSet(policy.targets);

  for (const t of policy.targets) {
    if (!t.symbol || typeof t.symbol !== "string") throw new Error("Each target must have a symbol.");
    if (!isFiniteNumber(t.targetWeight) || t.targetWeight <= 0 || t.targetWeight > 1) {
      throw new Error(`Invalid targetWeight for ${t.symbol}: ${t.targetWeight}`);
    }
  }

  const sum = sumTargetWeights(policy.targets);
  if (Math.abs(sum - 1) > EPS) {
    throw new Error(`Target weights must sum to 1. Got ${sum}`);
  }

  const numericFields = [
    ["cashBufferPct", policy.cashBufferPct, 0, 1],
    ["minInvestAmountUsd", policy.minInvestAmountUsd, 0, Number.POSITIVE_INFINITY],
    ["maxInvestAmountUsd", policy.maxInvestAmountUsd, 0, Number.POSITIVE_INFINITY],
    ["minOrderUsd", policy.minOrderUsd, 0, Number.POSITIVE_INFINITY],
  ];

  for (const [name, value, min, max] of numericFields) {
    if (value === undefined) continue;
    if (!isFiniteNumber(value) || value < min || value > max) {
      throw new Error(`Invalid ${name}: ${value}`);
    }
  }

  if (policy.maxOrders !== undefined) {
    if (!Number.isInteger(policy.maxOrders) || policy.maxOrders < 1) {
      throw new Error(`Invalid maxOrders: ${policy.maxOrders}`);
    }
  }

  if (!policy.drift || typeof policy.drift !== "object") {
    throw new Error("Policy.drift is required.");
  }
  if (policy.drift.kind !== "none" && policy.drift.kind !== "band") {
    throw new Error(`Invalid drift.kind: ${policy.drift.kind}`);
  }
  if (policy.drift.kind === "band") {
    if (!isFiniteNumber(policy.drift.maxAbsPct) || policy.drift.maxAbsPct < 0 || policy.drift.maxAbsPct > 1) {
      throw new Error(`Invalid drift.maxAbsPct: ${policy.drift.maxAbsPct}`);
    }
  }
}

export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot must be an object.");
  if (typeof snapshot.asOfIso !== "string") throw new Error("Snapshot.asOfIso must be an ISO string.");
  if (!isFiniteNumber(snapshot.cashUsd) || snapshot.cashUsd < 0) throw new Error("Snapshot.cashUsd must be >= 0.");
  if (!Array.isArray(snapshot.positions)) throw new Error("Snapshot.positions must be an array.");
  if (!snapshot.pricesUsd || typeof snapshot.pricesUsd !== "object") {
    throw new Error("Snapshot.pricesUsd must be an object map of symbol->price.");
  }

  for (const p of snapshot.positions) {
    if (!p.symbol || typeof p.symbol !== "string") throw new Error("Each position must have a symbol.");
    if (!isFiniteNumber(p.quantity) || p.quantity < 0) throw new Error(`Invalid quantity for ${p.symbol}.`);
    if (!isFiniteNumber(p.marketValueUsd) || p.marketValueUsd < 0) {
      throw new Error(`Invalid marketValueUsd for ${p.symbol}.`);
    }
  }
}
