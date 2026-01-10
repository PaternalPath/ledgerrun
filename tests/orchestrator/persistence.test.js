import test from "node:test";
import assert from "node:assert/strict";
import { rm, mkdir } from "node:fs/promises";
import {
  generateIdempotencyKey,
  getDateKey,
  hashPlan,
  saveRunMetadata,
  loadRunMetadata,
  runExists,
  listRuns,
} from "../../packages/orchestrator/src/persistence.js";

const TEST_RUNS_DIR = "/tmp/ledgerrun-test-runs-" + Date.now();

test("generateIdempotencyKey creates consistent keys", () => {
  const policy = {
    version: 1,
    name: "Test Policy",
    targets: [{ symbol: "VTI", targetWeight: 0.7 }],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
  };

  const dateKey = "2026-01-10";
  const key1 = generateIdempotencyKey(policy, dateKey);
  const key2 = generateIdempotencyKey(policy, dateKey);

  assert.equal(key1, key2, "Same policy and date should generate same key");
  assert.ok(key1.startsWith(dateKey), "Key should start with date key");
});

test("generateIdempotencyKey creates different keys for different policies", () => {
  const policy1 = {
    version: 1,
    name: "Test Policy 1",
    targets: [{ symbol: "VTI", targetWeight: 0.7 }],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
  };

  const policy2 = {
    version: 1,
    name: "Test Policy 2",
    targets: [{ symbol: "VXUS", targetWeight: 1.0 }],
    cashBufferPct: 0,
    minInvestAmountUsd: 1,
    maxInvestAmountUsd: 10000,
    minOrderUsd: 1,
    maxOrders: 10,
    drift: { kind: "band", maxAbsPct: 0.03 },
  };

  const dateKey = "2026-01-10";
  const key1 = generateIdempotencyKey(policy1, dateKey);
  const key2 = generateIdempotencyKey(policy2, dateKey);

  assert.notEqual(key1, key2, "Different policies should generate different keys");
});

test("getDateKey generates daily keys correctly", () => {
  const date = new Date("2026-01-10T14:30:00Z");
  const key = getDateKey(date, "daily");

  assert.equal(key, "2026-01-10", "Should generate YYYY-MM-DD format");
});

test("getDateKey generates hourly keys correctly", () => {
  const date = new Date("2026-01-10T14:30:00Z");
  const key = getDateKey(date, "hourly");

  assert.equal(key, "2026-01-10-14", "Should generate YYYY-MM-DD-HH format");
});

test("hashPlan generates consistent hashes", () => {
  const plan = {
    status: "PLANNED",
    legs: [
      {
        symbol: "VTI",
        notionalUsd: 100,
        targetWeight: 0.7,
        currentWeight: 0.5,
      },
    ],
    plannedSpendUsd: 100,
  };

  const hash1 = hashPlan(plan);
  const hash2 = hashPlan(plan);

  assert.equal(hash1, hash2, "Same plan should generate same hash");
  assert.equal(typeof hash1, "string", "Hash should be a string");
  assert.ok(hash1.length > 0, "Hash should not be empty");
});

test("saveRunMetadata and loadRunMetadata work correctly", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const metadata = {
    idempotencyKey: "2026-01-10-abc123",
    timestamp: new Date().toISOString(),
    dateKey: "2026-01-10",
    granularity: "daily",
    policyPath: "policies/test.json",
    policyName: "Test Policy",
    status: "PLANNED",
    planHash: "hash123",
    dryRun: false,
    executed: true,
    plan: {
      status: "PLANNED",
      totalValueUsd: 1000,
      cashUsd: 500,
      investableCashUsd: 500,
      plannedSpendUsd: 500,
      legs: [],
      notes: [],
    },
  };

  try {
    const filepath = await saveRunMetadata(metadata, TEST_RUNS_DIR);
    assert.ok(filepath.includes(metadata.idempotencyKey), "Filepath should include idempotency key");

    const loaded = await loadRunMetadata(metadata.idempotencyKey, TEST_RUNS_DIR);
    assert.deepEqual(loaded, metadata, "Loaded metadata should match saved metadata");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("loadRunMetadata returns null for non-existent run", async () => {
  const loaded = await loadRunMetadata("non-existent-key", TEST_RUNS_DIR);
  assert.equal(loaded, null, "Should return null for non-existent run");
});

test("runExists checks for existing runs correctly", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const metadata = {
    idempotencyKey: "2026-01-10-exists",
    timestamp: new Date().toISOString(),
    dateKey: "2026-01-10",
    granularity: "daily",
    policyPath: "policies/test.json",
    policyName: "Test Policy",
    status: "PLANNED",
    planHash: "hash123",
    dryRun: false,
    executed: true,
    plan: {
      status: "PLANNED",
      totalValueUsd: 1000,
      cashUsd: 500,
      investableCashUsd: 500,
      plannedSpendUsd: 500,
      legs: [],
      notes: [],
    },
  };

  try {
    await saveRunMetadata(metadata, TEST_RUNS_DIR);

    const exists = await runExists(metadata.idempotencyKey, TEST_RUNS_DIR);
    assert.equal(exists, true, "Should return true for existing run");

    const notExists = await runExists("non-existent-key", TEST_RUNS_DIR);
    assert.equal(notExists, false, "Should return false for non-existent run");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("listRuns returns all runs sorted by timestamp", async () => {
  await mkdir(TEST_RUNS_DIR, { recursive: true });

  const metadata1 = {
    idempotencyKey: "2026-01-10-run1",
    timestamp: "2026-01-10T10:00:00Z",
    dateKey: "2026-01-10",
    granularity: "daily",
    policyPath: "policies/test.json",
    policyName: "Test Policy",
    status: "PLANNED",
    planHash: "hash1",
    dryRun: false,
    executed: true,
    plan: {
      status: "PLANNED",
      totalValueUsd: 1000,
      cashUsd: 500,
      investableCashUsd: 500,
      plannedSpendUsd: 500,
      legs: [],
      notes: [],
    },
  };

  const metadata2 = {
    idempotencyKey: "2026-01-11-run2",
    timestamp: "2026-01-11T10:00:00Z",
    dateKey: "2026-01-11",
    granularity: "daily",
    policyPath: "policies/test.json",
    policyName: "Test Policy",
    status: "PLANNED",
    planHash: "hash2",
    dryRun: false,
    executed: true,
    plan: {
      status: "PLANNED",
      totalValueUsd: 1000,
      cashUsd: 500,
      investableCashUsd: 500,
      plannedSpendUsd: 500,
      legs: [],
      notes: [],
    },
  };

  try {
    await saveRunMetadata(metadata1, TEST_RUNS_DIR);
    await saveRunMetadata(metadata2, TEST_RUNS_DIR);

    const runs = await listRuns(TEST_RUNS_DIR);

    assert.equal(runs.length, 2, "Should return 2 runs");
    assert.equal(runs[0].idempotencyKey, metadata2.idempotencyKey, "Should return newest run first");
    assert.equal(runs[1].idempotencyKey, metadata1.idempotencyKey, "Should return oldest run last");
  } finally {
    await rm(TEST_RUNS_DIR, { recursive: true, force: true });
  }
});

test("listRuns returns empty array for non-existent directory", async () => {
  const runs = await listRuns("/tmp/non-existent-runs-dir-" + Date.now());
  assert.deepEqual(runs, [], "Should return empty array for non-existent directory");
});
