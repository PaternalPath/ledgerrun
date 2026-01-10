/**
 * Guardrails module for safety checks and limits
 * Prevents unsafe trading behavior
 */

import { listRuns } from "./persistence.js";

/**
 * Check if an order exceeds position size limits
 * @param {Object} leg - Order leg
 * @param {Object} snapshot - Current portfolio snapshot
 * @param {number} maxPositionPct - Max position size as % of total value (0-1)
 * @returns {Object} { safe: boolean, reason?: string }
 */
export function checkPositionSizeLimit(leg, snapshot, maxPositionPct = 0.5) {
  const totalValue = snapshot.cashUsd + snapshot.positions.reduce(
    (sum, pos) => sum + pos.marketValueUsd,
    0
  );

  // Calculate post-buy position value
  const currentPosition = snapshot.positions.find(p => p.symbol === leg.symbol);
  const currentValue = currentPosition ? currentPosition.marketValueUsd : 0;
  const postBuyValue = currentValue + leg.notionalUsd;
  const postBuyPct = postBuyValue / totalValue;

  if (postBuyPct > maxPositionPct) {
    return {
      safe: false,
      reason: `Position ${leg.symbol} would be ${(postBuyPct * 100).toFixed(1)}% of portfolio (max: ${(maxPositionPct * 100).toFixed(1)}%)`,
      currentPct: currentValue / totalValue,
      postBuyPct,
      maxPct: maxPositionPct,
    };
  }

  return { safe: true };
}

/**
 * Check if total spend exceeds daily limit
 * @param {number} plannedSpend - Planned spend for this run
 * @param {string} runsDir - Directory containing run metadata
 * @param {number} dailySpendLimit - Max daily spend in USD
 * @returns {Promise<Object>} { safe: boolean, reason?: string }
 */
export async function checkDailySpendLimit(plannedSpend, runsDir = "./runs", dailySpendLimit = 10000) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    const runs = await listRuns(runsDir);

    // Sum spending from all executed runs today
    const todaysSpending = runs
      .filter(run => {
        const runDate = run.timestamp.split("T")[0];
        return runDate === today && run.executed && run.plan;
      })
      .reduce((sum, run) => sum + (run.plan.plannedSpendUsd || 0), 0);

    const totalSpending = todaysSpending + plannedSpend;

    if (totalSpending > dailySpendLimit) {
      return {
        safe: false,
        reason: `Daily spend limit exceeded: $${totalSpending.toFixed(2)} (limit: $${dailySpendLimit.toFixed(2)})`,
        todaysSpending,
        plannedSpend,
        totalSpending,
        dailySpendLimit,
      };
    }

    return {
      safe: true,
      todaysSpending,
      plannedSpend,
      totalSpending,
      remainingLimit: dailySpendLimit - totalSpending,
    };
  } catch (error) {
    // If we can't check spending history, fail safe and allow the transaction
    return {
      safe: true,
      warning: "Could not check daily spending history",
    };
  }
}

/**
 * Check if an order is unusually large (warning only, not blocking)
 * @param {Object} leg - Order leg
 * @param {Object} snapshot - Current portfolio snapshot
 * @param {number} largeOrderThreshold - Threshold as % of total value (0-1)
 * @returns {Object} { isLarge: boolean, reason?: string }
 */
export function checkLargeOrder(leg, snapshot, largeOrderThreshold = 0.1) {
  const totalValue = snapshot.cashUsd + snapshot.positions.reduce(
    (sum, pos) => sum + pos.marketValueUsd,
    0
  );

  const orderPct = leg.notionalUsd / totalValue;

  if (orderPct > largeOrderThreshold) {
    return {
      isLarge: true,
      reason: `Large order detected: ${leg.symbol} $${leg.notionalUsd.toFixed(2)} (${(orderPct * 100).toFixed(1)}% of portfolio)`,
      orderPct,
      threshold: largeOrderThreshold,
    };
  }

  return { isLarge: false };
}

/**
 * Validate policy safety settings
 * @param {Object} policy - Policy object
 * @returns {Object} { valid: boolean, warnings: string[] }
 */
export function validatePolicySafety(policy) {
  const warnings = [];

  // Check maxInvestAmountUsd is reasonable
  if (policy.maxInvestAmountUsd > 100000) {
    warnings.push(`maxInvestAmountUsd is very high: $${policy.maxInvestAmountUsd.toFixed(0)}`);
  }

  // Check target weights sum to 1.0
  const totalWeight = policy.targets.reduce((sum, t) => sum + t.targetWeight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    warnings.push(`Target weights sum to ${totalWeight.toFixed(3)}, should be 1.0`);
  }

  // Check for concentrated positions
  const maxWeight = Math.max(...policy.targets.map(t => t.targetWeight));
  if (maxWeight > 0.8) {
    warnings.push(`Concentrated position detected: ${(maxWeight * 100).toFixed(1)}% in single symbol`);
  }

  // Check minOrderUsd is not too high
  if (policy.minOrderUsd > 1000) {
    warnings.push(`minOrderUsd is very high: $${policy.minOrderUsd.toFixed(0)} (may skip small rebalances)`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Run all pre-execution safety checks
 * @param {Object} plan - Allocation plan
 * @param {Object} snapshot - Portfolio snapshot
 * @param {Object} policy - Policy object
 * @param {Object} options - Options { runsDir, maxPositionPct, dailySpendLimit, largeOrderThreshold }
 * @returns {Promise<Object>} { safe: boolean, blocking: string[], warnings: string[] }
 */
export async function runSafetyChecks(plan, snapshot, policy, options = {}) {
  const {
    runsDir = "./runs",
    maxPositionPct = 0.5,
    dailySpendLimit = 10000,
    largeOrderThreshold = 0.1,
  } = options;

  const blocking = [];
  const warnings = [];

  // Policy validation (warnings only)
  const policyCheck = validatePolicySafety(policy);
  warnings.push(...policyCheck.warnings);

  // Only check if there are orders to execute
  if (plan.status !== "PLANNED" || plan.legs.length === 0) {
    return { safe: true, blocking, warnings };
  }

  // Check daily spend limit (blocking)
  const spendCheck = await checkDailySpendLimit(plan.plannedSpendUsd, runsDir, dailySpendLimit);
  if (!spendCheck.safe) {
    blocking.push(spendCheck.reason);
  } else if (spendCheck.warning) {
    warnings.push(spendCheck.warning);
  }

  // Check each order
  for (const leg of plan.legs) {
    // Position size limit (blocking)
    const positionCheck = checkPositionSizeLimit(leg, snapshot, maxPositionPct);
    if (!positionCheck.safe) {
      blocking.push(positionCheck.reason);
    }

    // Large order warning (non-blocking)
    const largeOrderCheck = checkLargeOrder(leg, snapshot, largeOrderThreshold);
    if (largeOrderCheck.isLarge) {
      warnings.push(largeOrderCheck.reason);
    }
  }

  return {
    safe: blocking.length === 0,
    blocking,
    warnings,
  };
}
