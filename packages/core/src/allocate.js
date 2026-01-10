import { validatePolicy, validateSnapshot } from "./validate.js";

function roundDown(value, step) {
  const s = step <= 0 ? 0.01 : step;
  return Math.floor(value / s) * s;
}

function stableSortLegs(legs) {
  return legs.sort((a, b) => {
    if (b.notionalUsd !== a.notionalUsd) return b.notionalUsd - a.notionalUsd;
    return a.symbol.localeCompare(b.symbol);
  });
}

function computeEquity(positions) {
  return positions.reduce((acc, p) => acc + p.marketValueUsd, 0);
}

function buildValueBySymbol(positions) {
  const map = new Map();
  for (const p of positions) map.set(p.symbol, (map.get(p.symbol) || 0) + p.marketValueUsd);
  return map;
}

function getDefaulted(policy) {
  return {
    cashBufferPct: policy.cashBufferPct ?? 0,
    minInvestAmountUsd: policy.minInvestAmountUsd ?? 1,
    maxInvestAmountUsd: policy.maxInvestAmountUsd ?? Number.POSITIVE_INFINITY,
    minOrderUsd: policy.minOrderUsd ?? 1,
    maxOrders: policy.maxOrders ?? policy.targets.length,
    allowMissingPrices: policy.allowMissingPrices ?? false
  };
}

function computeInvestableCash({ cashUsd, totalValueUsd }, defs, notes) {
  const desiredBuffer = defs.cashBufferPct * totalValueUsd;
  const afterBuffer = Math.max(0, cashUsd - desiredBuffer);

  if (defs.cashBufferPct > 0) notes.push(`Applied cash buffer: reserving ~$${desiredBuffer.toFixed(2)}.`);

  const capped = Math.min(afterBuffer, defs.maxInvestAmountUsd);
  if (defs.maxInvestAmountUsd !== Number.POSITIVE_INFINITY) {
    notes.push(`Applied max invest cap: $${defs.maxInvestAmountUsd.toFixed(2)}.`);
  }

  if (capped < defs.minInvestAmountUsd) {
    return { investableCashUsd: 0, noopReason: `Investable cash ($${capped.toFixed(2)}) < minInvestAmountUsd.` };
  }

  return { investableCashUsd: capped, noopReason: null };
}

function computeWeights(targets, valueBySymbol, totalValueUsd) {
  const weights = new Map();
  for (const t of targets) {
    const currentValue = valueBySymbol.get(t.symbol) || 0;
    const currentWeight = totalValueUsd > 0 ? currentValue / totalValueUsd : 0;
    weights.set(t.symbol, { currentValue, currentWeight, targetWeight: t.targetWeight });
  }
  return weights;
}

function maxAbsDeviation(weights) {
  let max = 0;
  for (const { currentWeight, targetWeight } of weights.values()) {
    const d = Math.abs(currentWeight - targetWeight);
    if (d > max) max = d;
  }
  return max;
}

function allocateProRata(targets, investableCashUsd) {
  const buy = new Map();
  for (const t of targets) buy.set(t.symbol, investableCashUsd * t.targetWeight);
  return buy;
}

function allocateToUnderweights(weights, investableCashUsd) {
  let sumUnder = 0;
  const under = new Map();

  for (const [symbol, w] of weights.entries()) {
    const delta = w.targetWeight - w.currentWeight;
    const score = Math.max(0, delta);
    under.set(symbol, score);
    sumUnder += score;
  }

  if (sumUnder <= 0) return null;

  const buy = new Map();
  for (const [symbol, score] of under.entries()) {
    if (score <= 0) continue;
    buy.set(symbol, investableCashUsd * (score / sumUnder));
  }
  return buy;
}

function finalizeLegs({ policy, defs, weights, rawBuys, totalValueUsd, investableCashUsd, roundToUsd }) {
  const notes = [];
  const legs = [];

  for (const t of policy.targets) {
    const symbol = t.symbol;
    const w = weights.get(symbol);
    if (!w) continue;

    const notionalRaw = rawBuys.get(symbol) || 0;
    const notionalRounded = roundDown(notionalRaw, roundToUsd);

    if (notionalRounded < defs.minOrderUsd) continue;

    const postValue = w.currentValue + notionalRounded;
    const postWeight = totalValueUsd > 0 ? postValue / totalValueUsd : 0;

    legs.push({
      symbol,
      notionalUsd: Number(notionalRounded.toFixed(2)),
      reasonCodes: [],
      targetWeight: w.targetWeight,
      currentWeight: w.currentWeight,
      postBuyEstimatedWeight: postWeight
    });
  }

  stableSortLegs(legs);

  if (legs.length === 0) {
    notes.push(`All computed legs fell below minOrderUsd ($${defs.minOrderUsd.toFixed(2)}).`);
    return { legs: [], plannedSpendUsd: 0, notes };
  }

  if (legs.length > defs.maxOrders) {
    const dropped = legs.length - defs.maxOrders;
    legs.splice(defs.maxOrders);
    notes.push(`Applied maxOrders (${defs.maxOrders}); dropped ${dropped} leg(s).`);
  }

  const plannedSpendUsd = legs.reduce((acc, l) => acc + l.notionalUsd, 0);

  for (const leg of legs) {
    const w = weights.get(leg.symbol);
    if (!w) continue;
    if (w.currentWeight < w.targetWeight) leg.reasonCodes.push("UNDERWEIGHT");
    leg.reasonCodes.push("DCA", "CASHFLOW_REBALANCE");
  }

  if (plannedSpendUsd + 0.01 < investableCashUsd) {
    notes.push(
      `Planned spend ($${plannedSpendUsd.toFixed(2)}) < investable cash ($${investableCashUsd.toFixed(2)}) due to rounding/minOrder/maxOrders.`
    );
  }

  return { legs, plannedSpendUsd, notes };
}

export function allocate(policy, snapshot, options = {}) {
  validatePolicy(policy);
  validateSnapshot(snapshot);

  const roundToUsd = options.roundToUsd ?? 0.01;
  const noopIfWithinBand = options.noopIfWithinBand ?? false;

  const defs = getDefaulted(policy);
  const notes = [];

  for (const t of policy.targets) {
    const px = snapshot.pricesUsd?.[t.symbol];
    if (px === undefined || px === null || typeof px !== "number" || px <= 0) {
      if (defs.allowMissingPrices) {
        notes.push(`Missing/invalid price for ${t.symbol}; skipping symbol.`);
      } else {
        throw new Error(`Missing/invalid price for target symbol: ${t.symbol}`);
      }
    }
  }

  const equityUsd = computeEquity(snapshot.positions);
  const totalValueUsd = equityUsd + snapshot.cashUsd;

  const valueBySymbol = buildValueBySymbol(snapshot.positions);
  const weights = computeWeights(policy.targets, valueBySymbol, totalValueUsd);

  const investableRes = computeInvestableCash(
    { cashUsd: snapshot.cashUsd, totalValueUsd },
    defs,
    notes
  );

  if (investableRes.noopReason) {
    return {
      status: "NOOP",
      policyName: policy.name,
      asOfIso: snapshot.asOfIso,
      totalEquityUsd: Number(equityUsd.toFixed(2)),
      totalValueUsd: Number(totalValueUsd.toFixed(2)),
      cashUsd: Number(snapshot.cashUsd.toFixed(2)),
      investableCashUsd: 0,
      plannedSpendUsd: 0,
      legs: [],
      notes: [...notes, investableRes.noopReason]
    };
  }

  const investableCashUsd = investableRes.investableCashUsd;

  let mode = "pro_rata";
  if (policy.drift.kind === "band") {
    const maxDev = maxAbsDeviation(weights);
    if (maxDev > policy.drift.maxAbsPct) {
      mode = "underweights";
      notes.push(`Outside drift band (${(policy.drift.maxAbsPct * 100).toFixed(2)}%); prioritizing underweights.`);
    } else {
      notes.push(`Within drift band (${(policy.drift.maxAbsPct * 100).toFixed(2)}%); allocating pro-rata.`);
      if (noopIfWithinBand) {
        return {
          status: "NOOP",
          policyName: policy.name,
          asOfIso: snapshot.asOfIso,
          totalEquityUsd: Number(equityUsd.toFixed(2)),
          totalValueUsd: Number(totalValueUsd.toFixed(2)),
          cashUsd: Number(snapshot.cashUsd.toFixed(2)),
          investableCashUsd: Number(investableCashUsd.toFixed(2)),
          plannedSpendUsd: 0,
          legs: [],
          notes: [...notes, "NOOP because within drift band and noopIfWithinBand=true."]
        };
      }
    }
  }

  let rawBuys;
  if (mode === "underweights") {
    rawBuys = allocateToUnderweights(weights, investableCashUsd);
    if (!rawBuys) {
      notes.push("No underweights detected; falling back to pro-rata allocation.");
      rawBuys = allocateProRata(policy.targets, investableCashUsd);
    }
  } else {
    rawBuys = allocateProRata(policy.targets, investableCashUsd);
  }

  const finalized = finalizeLegs({
    policy,
    defs,
    weights,
    rawBuys,
    totalValueUsd,
    investableCashUsd,
    roundToUsd
  });

  if (finalized.plannedSpendUsd < defs.minInvestAmountUsd) {
    return {
      status: "NOOP",
      policyName: policy.name,
      asOfIso: snapshot.asOfIso,
      totalEquityUsd: Number(equityUsd.toFixed(2)),
      totalValueUsd: Number(totalValueUsd.toFixed(2)),
      cashUsd: Number(snapshot.cashUsd.toFixed(2)),
      investableCashUsd: Number(investableCashUsd.toFixed(2)),
      plannedSpendUsd: 0,
      legs: [],
      notes: [...notes, ...finalized.notes, "Planned spend fell below minInvestAmountUsd after constraints."]
    };
  }

  return {
    status: "PLANNED",
    policyName: policy.name,
    asOfIso: snapshot.asOfIso,
    totalEquityUsd: Number(equityUsd.toFixed(2)),
    totalValueUsd: Number(totalValueUsd.toFixed(2)),
    cashUsd: Number(snapshot.cashUsd.toFixed(2)),
    investableCashUsd: Number(investableCashUsd.toFixed(2)),
    plannedSpendUsd: Number(finalized.plannedSpendUsd.toFixed(2)),
    legs: finalized.legs,
    notes: [...notes, ...finalized.notes]
  };
}
