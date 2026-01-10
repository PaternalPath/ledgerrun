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
import { createLogger } from "./logger.js";
import { runSafetyChecks } from "./guardrails.js";
import { RunMetrics } from "./metrics.js";

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
 * @param {Object} options.guardrails - Guardrails configuration { maxPositionPct, dailySpendLimit, largeOrderThreshold }
 * @param {string} options.logLevel - Log level: "DEBUG", "INFO", "WARN", "ERROR" (default: "INFO")
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
  guardrails = {},
  logLevel = "INFO",
}) {
  const log = silent ? () => {} : console.log;
  const logger = createLogger({ level: logLevel, silent });
  const metrics = new RunMetrics();

  try {
    // Load policy for idempotency key generation
    logger.info("Loading policy", { policyPath });
    metrics.event("policy_load_start");

    const policyData = await readFile(policyPath, "utf-8");
    const policy = JSON.parse(policyData);

    metrics.event("policy_load_complete", { policyName: policy.name });
    logger.info("Policy loaded successfully", { policyName: policy.name, targets: policy.targets.length });

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
    logger.info("Starting allocation run", { dryRun, execute });
    metrics.event("allocation_start");

    const timestamp = new Date().toISOString();
    const result = await runOnce({
      policyPath,
      broker,
      dryRun,
      execute,
      silent,
    });

    metrics.event("allocation_complete", { status: result.plan.status, legs: result.plan.legs.length });
    logger.info("Allocation complete", { status: result.plan.status, plannedSpend: result.plan.plannedSpendUsd });

    // Run safety checks (warnings only for now)
    if (!dryRun && result.plan.status === "PLANNED") {
      logger.info("Running safety checks");
      metrics.event("safety_checks_start");

      // Get snapshot for safety checks
      const snapshot = await broker.getSnapshot();

      const safetyResult = await runSafetyChecks(result.plan, snapshot, policy, {
        runsDir,
        ...guardrails,
      });

      metrics.event("safety_checks_complete", {
        safe: safetyResult.safe,
        blockingCount: safetyResult.blocking.length,
        warningsCount: safetyResult.warnings.length
      });

      // Log warnings
      if (safetyResult.warnings.length > 0) {
        for (const warning of safetyResult.warnings) {
          logger.warn("Safety warning", { warning });
          log(`\n⚠️  Safety Warning: ${warning}`);
        }
      }

      // Log blocking issues (informational for now, will block in future version)
      if (safetyResult.blocking.length > 0) {
        for (const issue of safetyResult.blocking) {
          logger.warn("Safety check failed (informational)", { issue });
          log(`\n🚨 Safety Check Failed: ${issue}`);
        }
      }

      if (safetyResult.safe) {
        logger.info("All safety checks passed");
      } else {
        logger.warn("Some safety checks failed", {
          blockingIssues: safetyResult.blocking.length,
          warnings: safetyResult.warnings.length
        });
      }
    }

    // Calculate plan hash
    const planHash = hashPlan(result.plan);

    // Prepare metadata
    const metricsSummary = metrics.getSummary();

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
      metrics: metricsSummary,
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
      metrics.event("orders_executed", { ordersPlaced: result.execution.ordersPlaced });
    }

    // Save metadata (only for execute mode or if explicitly requested)
    if (!dryRun) {
      logger.info("Saving run metadata");
      const filepath = await saveRunMetadata(metadata, runsDir);
      log(`\n💾 Run metadata saved: ${filepath}`);
      logger.info("Run metadata saved", { filepath });
    }

    logger.info("Run completed successfully", { durationMs: metricsSummary.durationMs });

    return {
      ...result,
      metadata,
      idempotencyKey,
    };
  } catch (error) {
    metrics.event("error", { error: error.message });
    logger.error("Run failed", { error: error.message, stack: error.stack });
    throw error;
  }
}
