import { readFile } from "node:fs/promises";
import { allocate } from "../../core/src/allocate.js";
import {
  generateIdempotencyKey,
  getDateKey,
  hashPlan,
  saveRunMetadata,
  loadRunMetadata,
  runExists,
} from "./persistence.js";

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
    log(`\n📝 Notes:`);
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

/**
 * Run with idempotency: ensures the same run doesn't execute twice
 *
 * @param {Object} options
 * @param {string} options.policyPath - Path to policy JSON file
 * @param {Object} options.broker - Broker interface
 * @param {boolean} options.dryRun - If true, only print plan without executing (default: true)
 * @param {boolean} options.execute - If true and dryRun is false, execute orders (default: false)
 * @param {boolean} options.silent - If true, suppress console output (default: false)
 * @param {string} options.granularity - Idempotency granularity: "daily" or "hourly" (default: "daily")
 * @param {string} options.runsDir - Directory to store run metadata (default: "./runs")
 * @param {boolean} options.skipIdempotency - Skip idempotency check (default: false)
 * @returns {Promise<Object>} The allocation plan result with metadata
 */
export async function runWithIdempotency({
  policyPath,
  broker,
  dryRun = true,
  execute = false,
  silent = false,
  granularity = "daily",
  runsDir = "./runs",
  skipIdempotency = false,
}) {
  const log = silent ? () => {} : console.log;

  // Load policy for idempotency key generation
  const policyData = await readFile(policyPath, "utf-8");
  const policy = JSON.parse(policyData);

  // Generate idempotency key
  const dateKey = getDateKey(new Date(), granularity);
  const idempotencyKey = generateIdempotencyKey(policy, dateKey);

  log(`🔑 Idempotency Key: ${idempotencyKey}`);
  log(`   Granularity: ${granularity}`);
  log(`   Date Key: ${dateKey}`);

  // Check if run already exists (only for execute mode)
  if (!skipIdempotency && !dryRun && execute) {
    const exists = await runExists(idempotencyKey, runsDir);

    if (exists) {
      log("\n⚠️  IDEMPOTENCY CHECK FAILED");
      log("   A run with this idempotency key already exists.");
      log("   This prevents duplicate execution for the same policy and time period.");

      const existingRun = await loadRunMetadata(idempotencyKey, runsDir);
      log(`\n📋 Existing Run Details:`);
      log(`   Timestamp: ${existingRun.timestamp}`);
      log(`   Status: ${existingRun.status}`);
      log(`   Plan Hash: ${existingRun.planHash}`);
      if (existingRun.execution) {
        log(`   Orders Placed: ${existingRun.execution.ordersPlaced}`);
      }

      return {
        skipped: true,
        reason: "idempotency",
        idempotencyKey,
        existingRun,
      };
    }

    log("   ✅ No existing run found - proceeding");
  }

  // Run the allocation
  const timestamp = new Date().toISOString();
  const result = await runOnce({
    policyPath,
    broker,
    dryRun,
    execute,
    silent,
  });

  // Calculate plan hash
  const planHash = hashPlan(result.plan);

  // Prepare metadata
  const metadata = {
    idempotencyKey,
    timestamp,
    dateKey,
    granularity,
    policyPath,
    policyName: policy.name,
    status: result.plan.status,
    planHash,
    dryRun,
    executed: !dryRun && execute,
    plan: {
      status: result.plan.status,
      totalValueUsd: result.plan.totalValueUsd,
      cashUsd: result.plan.cashUsd,
      investableCashUsd: result.plan.investableCashUsd,
      plannedSpendUsd: result.plan.plannedSpendUsd,
      legs: result.plan.legs.map(leg => ({
        symbol: leg.symbol,
        notionalUsd: leg.notionalUsd,
        currentWeight: leg.currentWeight,
        targetWeight: leg.targetWeight,
        postBuyEstimatedWeight: leg.postBuyEstimatedWeight,
        reasonCodes: leg.reasonCodes,
      })),
      notes: result.plan.notes,
    },
  };

  // Add execution details if executed
  if (result.execution) {
    metadata.execution = {
      ordersPlaced: result.execution.ordersPlaced,
      orderIds: result.execution.orderIds,
    };
  }

  // Save metadata (only for execute mode or if explicitly requested)
  if (!dryRun) {
    const filepath = await saveRunMetadata(metadata, runsDir);
    log(`\n💾 Run metadata saved: ${filepath}`);
  }

  return {
    ...result,
    metadata,
    idempotencyKey,
  };
}
