import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * Default runs directory
 */
const DEFAULT_RUNS_DIR = "./runs";

/**
 * Generate a hash from an object
 * @param {Object} obj - Object to hash
 * @returns {string} SHA-256 hash
 */
function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

/**
 * Generate an idempotency key for a run
 * @param {Object} policy - Policy object
 * @param {string} dateKey - Date key (e.g., "2026-01-10" for daily, "2026-01-10-14" for hourly)
 * @returns {string} Idempotency key
 */
export function generateIdempotencyKey(policy, dateKey) {
  const policyHash = hashObject({
    version: policy.version,
    name: policy.name,
    targets: policy.targets,
    cashBufferPct: policy.cashBufferPct,
    minInvestAmountUsd: policy.minInvestAmountUsd,
    maxInvestAmountUsd: policy.maxInvestAmountUsd,
    minOrderUsd: policy.minOrderUsd,
    maxOrders: policy.maxOrders,
    drift: policy.drift,
  });
  return `${dateKey}-${policyHash}`;
}

/**
 * Get date key for idempotency based on granularity
 * @param {Date} date - Date object
 * @param {string} granularity - "daily" or "hourly"
 * @returns {string} Date key
 */
export function getDateKey(date = new Date(), granularity = "daily") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (granularity === "hourly") {
    const hour = String(date.getHours()).padStart(2, "0");
    return `${year}-${month}-${day}-${hour}`;
  }

  return `${year}-${month}-${day}`;
}

/**
 * Generate a hash for the allocation plan
 * @param {Object} plan - Allocation plan
 * @returns {string} Plan hash
 */
export function hashPlan(plan) {
  return hashObject({
    status: plan.status,
    legs: plan.legs.map(leg => ({
      symbol: leg.symbol,
      notionalUsd: leg.notionalUsd,
      targetWeight: leg.targetWeight,
    })),
    plannedSpendUsd: plan.plannedSpendUsd,
  });
}

/**
 * Save run metadata to disk
 * @param {Object} metadata - Run metadata
 * @param {string} runsDir - Directory to store runs (default: "./runs")
 */
export async function saveRunMetadata(metadata, runsDir = DEFAULT_RUNS_DIR) {
  await mkdir(runsDir, { recursive: true });

  const filename = `${metadata.idempotencyKey}.json`;
  const filepath = join(runsDir, filename);

  await writeFile(filepath, JSON.stringify(metadata, null, 2));

  return filepath;
}

/**
 * Load run metadata from disk
 * @param {string} idempotencyKey - Idempotency key
 * @param {string} runsDir - Directory where runs are stored (default: "./runs")
 * @returns {Promise<Object|null>} Run metadata or null if not found
 */
export async function loadRunMetadata(idempotencyKey, runsDir = DEFAULT_RUNS_DIR) {
  try {
    const filename = `${idempotencyKey}.json`;
    const filepath = join(runsDir, filename);
    const data = await readFile(filepath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a run with the given idempotency key already exists
 * @param {string} idempotencyKey - Idempotency key
 * @param {string} runsDir - Directory where runs are stored (default: "./runs")
 * @returns {Promise<boolean>} True if run exists
 */
export async function runExists(idempotencyKey, runsDir = DEFAULT_RUNS_DIR) {
  const metadata = await loadRunMetadata(idempotencyKey, runsDir);
  return metadata !== null;
}

/**
 * List all runs
 * @param {string} runsDir - Directory where runs are stored (default: "./runs")
 * @returns {Promise<Array<Object>>} Array of run metadata
 */
export async function listRuns(runsDir = DEFAULT_RUNS_DIR) {
  try {
    const files = await readdir(runsDir);
    const jsonFiles = files.filter(f => f.endsWith(".json"));

    const runs = await Promise.all(
      jsonFiles.map(async (file) => {
        const filepath = join(runsDir, file);
        const data = await readFile(filepath, "utf-8");
        return JSON.parse(data);
      })
    );

    return runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
