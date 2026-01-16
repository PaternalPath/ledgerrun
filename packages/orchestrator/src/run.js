import { readFile } from "node:fs/promises";
import { allocate } from "../../core/src/allocate.js";

/**
 * Run once: load policy, fetch snapshot, compute allocation plan, and optionally execute.
 *
 * @param {Object} options
 * @param {string} options.policyPath - Path to policy JSON file
 * @param {Object} options.broker - Broker interface with methods: getSnapshot(), executeOrders(legs), isPaper()
 * @param {boolean} options.dryRun - If true, only print plan without executing (default: true)
 * @param {boolean} options.execute - If true and dryRun is false, execute orders (default: false)
 * @param {boolean} options.silent - If true, suppress console output (default: false)
 * @returns {Promise<Object>} The allocation plan result
 */
export async function runOnce({ policyPath, broker, dryRun = true, execute = false, silent = false }) {
  const log = silent ? () => {} : console.log;
  // Enforce paper-only trading
  if (!broker.isPaper()) {
    throw new Error("SAFETY: Only paper trading is supported. Broker must be in paper mode.");
  }

  // Load policy
  const policyData = await readFile(policyPath, "utf-8");
  const policy = JSON.parse(policyData);

  log(`📋 Loaded policy: ${policy.name || "Unnamed"}`);
  log(`   Targets: ${policy.targets.map(t => `${t.symbol} (${(t.targetWeight * 100).toFixed(1)}%)`).join(", ")}`);

  // Fetch current snapshot from broker
  log("\n📊 Fetching account snapshot from broker...");
  const snapshot = await broker.getSnapshot();

  log(`   Cash: $${snapshot.cashUsd.toFixed(2)}`);
  log(`   Positions: ${snapshot.positions.length} holdings`);
  for (const pos of snapshot.positions) {
    log(`     - ${pos.symbol}: ${pos.quantity} shares @ $${snapshot.pricesUsd[pos.symbol]?.toFixed(2) || "N/A"} = $${pos.marketValueUsd.toFixed(2)}`);
  }

  // Compute allocation plan
  log("\n🧮 Computing allocation plan...");
  const plan = allocate(policy, snapshot);

  // Print plan summary
  log(`\n📈 Plan Status: ${plan.status}`);
  log(`   Total Value: $${plan.totalValueUsd.toFixed(2)}`);
  log(`   Cash: $${plan.cashUsd.toFixed(2)}`);
  log(`   Investable Cash: $${plan.investableCashUsd.toFixed(2)}`);
  log(`   Planned Spend: $${plan.plannedSpendUsd.toFixed(2)}`);

  if (plan.legs.length > 0) {
    log(`\n💰 Planned Orders (${plan.legs.length}):`);
    for (const leg of plan.legs) {
      log(`   - BUY ${leg.symbol}: $${leg.notionalUsd.toFixed(2)}`);
      log(`     Current weight: ${(leg.currentWeight * 100).toFixed(2)}% → Target: ${(leg.targetWeight * 100).toFixed(2)}%`);
      log(`     Post-buy estimate: ${(leg.postBuyEstimatedWeight * 100).toFixed(2)}%`);
      log(`     Reasons: ${leg.reasonCodes.join(", ")}`);
    }
  }

  if (plan.notes.length > 0) {
    log("\n📝 Notes:");
    for (const note of plan.notes) {
      log(`   - ${note}`);
    }
  }

  // Execute orders if requested
  if (!dryRun && execute && plan.status === "PLANNED" && plan.legs.length > 0) {
    log("\n⚡ Executing orders...");
    const executionResult = await broker.executeOrders(plan.legs);
    log(`   ✅ Execution complete: ${executionResult.ordersPlaced} orders placed`);
    return { plan, execution: executionResult };
  }

  if (dryRun) {
    log("\n🔍 DRY RUN MODE - No orders executed");
  } else if (!execute) {
    log("\n⚠️  Execute flag not set - No orders executed");
  } else if (plan.status !== "PLANNED") {
    log(`\n⏭️  Status is ${plan.status} - No orders to execute`);
  }

  return { plan };
}
