import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { validatePolicy } from "../../packages/core/src/validate.js";

const POLICIES_DIR = join(process.cwd(), "policies");

test("all policy templates are valid JSON", async () => {
  const files = await readdir(POLICIES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  assert.ok(jsonFiles.length > 0, "Should have at least one policy file");

  for (const file of jsonFiles) {
    const content = await readFile(join(POLICIES_DIR, file), "utf-8");
    let policy;

    try {
      policy = JSON.parse(content);
    } catch (e) {
      assert.fail(`${file} is not valid JSON: ${e.message}`);
    }

    assert.ok(policy, `${file} should parse to an object`);
  }
});

test("all policy templates pass validation", async () => {
  const files = await readdir(POLICIES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  for (const file of jsonFiles) {
    const content = await readFile(join(POLICIES_DIR, file), "utf-8");
    const policy = JSON.parse(content);

    try {
      validatePolicy(policy);
    } catch (e) {
      assert.fail(`${file} failed validation: ${e.message}`);
    }
  }
});

test("all policy templates have required metadata", async () => {
  const files = await readdir(POLICIES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  for (const file of jsonFiles) {
    const content = await readFile(join(POLICIES_DIR, file), "utf-8");
    const policy = JSON.parse(content);

    assert.ok(policy.name, `${file} should have a name`);
    assert.equal(policy.version, 1, `${file} should have version 1`);
    assert.ok(Array.isArray(policy.targets), `${file} should have targets array`);
    assert.ok(policy.targets.length > 0, `${file} should have at least one target`);
  }
});

test("all policy templates have weights summing to 1", async () => {
  const files = await readdir(POLICIES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  for (const file of jsonFiles) {
    const content = await readFile(join(POLICIES_DIR, file), "utf-8");
    const policy = JSON.parse(content);

    const totalWeight = policy.targets.reduce((sum, t) => sum + t.targetWeight, 0);
    assert.ok(
      Math.abs(totalWeight - 1.0) < 0.0001,
      `${file} weights should sum to 1.0 (got ${totalWeight})`
    );
  }
});

test("policy templates cover different risk profiles", async () => {
  const files = await readdir(POLICIES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  // Should have at least core + 3 templates
  assert.ok(jsonFiles.length >= 4, `Should have at least 4 policy files (got ${jsonFiles.length})`);

  const expectedPolicies = ["core.json", "aggressive.json", "balanced.json", "conservative.json"];
  for (const expected of expectedPolicies) {
    assert.ok(jsonFiles.includes(expected), `Should have ${expected} policy`);
  }
});
