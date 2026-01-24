# Test Coverage Analysis

This document provides a detailed analysis of the current test coverage and identifies areas for improvement.

## Current State

| Module | Source Lines | Tests | Coverage Status |
|--------|-------------|-------|-----------------|
| `packages/core/src/allocate.js` | 282 | 12 | Good, gaps exist |
| `packages/core/src/validate.js` | 100 | 22 | Excellent |
| `packages/orchestrator/src/run.js` | 84 | 4 | Moderate, gaps exist |
| `apps/api/src/cli.js` | 217 | 8 | Moderate, gaps exist |

**Total: 46 tests across 4 test files**

---

## Identified Coverage Gaps

### 1. Core Allocation Logic (`allocate.js`)

#### 1.1 Untested: `drift.kind = "none"` Mode
**Priority: HIGH**

All current tests use `drift.kind = "band"`. The `"none"` drift mode is never tested, but it's a valid configuration option.

```javascript
// Suggested test
test("allocate with drift.kind = 'none' always uses pro-rata allocation", () => {
  const policy = basePolicy({
    drift: { kind: "none" }
  });
  const snap = baseSnapshot({ cashUsd: 100 });

  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");
  // Verify pro-rata allocation regardless of portfolio drift
});
```

#### 1.2 Untested: Helper Functions with Edge Cases
**Priority: MEDIUM**

Internal helper functions are only tested implicitly through the main `allocate()` function:

- `roundDown(value, step)` - What happens when `step <= 0`?
- `stableSortLegs()` - Tie-breaking when `notionalUsd` values are equal
- `buildValueBySymbol()` - Multiple positions for the same symbol (aggregation)

```javascript
// Suggested tests for edge cases
test("multiple positions for same symbol are aggregated correctly", () => {
  const snap = baseSnapshot({
    positions: [
      { symbol: "VTI", quantity: 1, marketValueUsd: 100 },
      { symbol: "VTI", quantity: 2, marketValueUsd: 200 },  // Same symbol
      { symbol: "VXUS", quantity: 1, marketValueUsd: 60 }
    ]
  });
  // Verify VTI is treated as $300 total
});
```

#### 1.3 Untested: Custom `roundToUsd` Option
**Priority: LOW**

The `options.roundToUsd` parameter defaults to `0.01` but can be customized. No tests verify custom rounding increments.

```javascript
test("custom roundToUsd option rounds to specified increment", () => {
  const plan = allocate(policy, snap, { roundToUsd: 1.0 });
  // Verify all notionalUsd values are whole dollars
});
```

#### 1.4 Untested: Underweight Fallback to Pro-Rata
**Priority: MEDIUM**

When `allocateToUnderweights()` returns `null` (no underweights detected), the code falls back to pro-rata. This specific path isn't directly tested.

```javascript
test("falls back to pro-rata when no underweights detected outside drift band", () => {
  // Create scenario where all positions are at or above target weight
  // but still outside drift band (edge case)
});
```

#### 1.5 Untested: Empty Positions Array
**Priority: HIGH**

A completely new account with no positions (only cash) isn't explicitly tested.

```javascript
test("allocate with empty positions array (new account)", () => {
  const snap = baseSnapshot({
    cashUsd: 1000,
    positions: []
  });
  const plan = allocate(policy, snap);
  assert.equal(plan.status, "PLANNED");
  // Should allocate according to target weights
});
```

#### 1.6 Untested: Zero Cash Scenario
**Priority: HIGH**

What happens when `cashUsd = 0`?

```javascript
test("NOOP when cashUsd is zero", () => {
  const snap = baseSnapshot({ cashUsd: 0 });
  const plan = allocate(policy, snap);
  assert.equal(plan.status, "NOOP");
});
```

#### 1.7 Untested: Planned Spend Below minInvestAmountUsd After Constraints
**Priority: MEDIUM**

The code path at line 254-267 handles the case where planned spend falls below `minInvestAmountUsd` after applying constraints (rounding, minOrderUsd, maxOrders). This edge case isn't directly tested.

---

### 2. Validation Module (`validate.js`)

#### 2.1 Untested: Zero `targetWeight`
**Priority: HIGH**

The validation requires `targetWeight > 0`, but a test for `targetWeight = 0` is missing.

```javascript
test("validatePolicy - rejects zero targetWeight", () => {
  const policy = {
    version: 1,
    name: "Test",
    targets: [
      { symbol: "VTI", targetWeight: 0 }
    ],
    drift: { kind: "none" }
  };
  assert.throws(() => validatePolicy(policy), /Invalid targetWeight/);
});
```

#### 2.2 Untested: Position Missing Symbol Property
**Priority: MEDIUM**

```javascript
test("validateSnapshot - rejects position without symbol", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [
      { quantity: 5, marketValueUsd: 100 }  // Missing symbol
    ],
    pricesUsd: { VTI: 20 }
  };
  assert.throws(() => validateSnapshot(snapshot), /must have a symbol/);
});
```

#### 2.3 Untested: NaN and Infinity Values
**Priority: MEDIUM**

Edge cases with `NaN`, `Infinity`, and `-Infinity` for numeric fields.

```javascript
test("validatePolicy - rejects NaN values", () => {
  const policy = {
    version: 1,
    targets: [{ symbol: "VTI", targetWeight: NaN }],
    drift: { kind: "none" }
  };
  assert.throws(() => validatePolicy(policy), /Invalid targetWeight/);
});
```

#### 2.4 Untested: Price of Zero
**Priority: HIGH**

Prices must be > 0, but this boundary isn't tested.

```javascript
test("validateSnapshot - rejects zero price", () => {
  const snapshot = {
    asOfIso: new Date().toISOString(),
    cashUsd: 100,
    positions: [],
    pricesUsd: { VTI: 0 }  // Zero price
  };
  assert.throws(() => validateSnapshot(snapshot), /Invalid price/);
});
```

---

### 3. Orchestrator Module (`run.js`)

#### 3.1 Untested: Policy File Read Errors
**Priority: HIGH**

No test verifies behavior when the policy file cannot be read (permissions, not found via orchestrator).

```javascript
test("orchestrator throws on unreadable policy file", async () => {
  const broker = new MockBroker({ isPaper: true });
  await assert.rejects(
    () => runOnce({
      policyPath: "/nonexistent/path/policy.json",
      broker,
      dryRun: true,
      silent: true
    }),
    /ENOENT/
  );
});
```

#### 3.2 Untested: Invalid JSON in Policy File
**Priority: HIGH**

```javascript
test("orchestrator throws on invalid JSON policy", async () => {
  const tmpPolicy = "/tmp/invalid-json-" + Date.now() + ".json";
  await writeFile(tmpPolicy, "{ invalid json }");

  try {
    await assert.rejects(
      () => runOnce({ policyPath: tmpPolicy, broker, dryRun: true, silent: true }),
      /JSON/
    );
  } finally {
    await rm(tmpPolicy, { force: true });
  }
});
```

#### 3.3 Untested: Broker `getSnapshot()` Failure
**Priority: HIGH**

What happens when the broker fails to fetch a snapshot?

```javascript
test("orchestrator handles broker getSnapshot() failure", async () => {
  const failingBroker = {
    isPaper: () => true,
    getSnapshot: async () => { throw new Error("Network error"); },
    executeOrders: async () => {}
  };

  await assert.rejects(
    () => runOnce({ policyPath, broker: failingBroker, dryRun: true, silent: true }),
    /Network error/
  );
});
```

#### 3.4 Untested: Broker `executeOrders()` Failure
**Priority: HIGH**

```javascript
test("orchestrator handles broker executeOrders() failure", async () => {
  const failingBroker = {
    isPaper: () => true,
    getSnapshot: async () => validSnapshot,
    executeOrders: async () => { throw new Error("Order rejected"); }
  };

  await assert.rejects(
    () => runOnce({ ..., execute: true, dryRun: false }),
    /Order rejected/
  );
});
```

#### 3.5 Untested: Console Logging Output (silent=false)
**Priority: LOW**

All orchestrator tests use `silent: true`. Consider testing log output format.

---

### 4. CLI Module (`cli.js`)

#### 4.1 Untested: `--help` and `-h` Flags
**Priority: MEDIUM**

```javascript
test("CLI --help shows usage and exits 0", async () => {
  const result = await runCLI(["--help"]);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("USAGE"));
  assert.ok(result.stdout.includes("COMMANDS"));
});

test("CLI -h shorthand works", async () => {
  const result = await runCLI(["-h"]);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("USAGE"));
});
```

#### 4.2 Untested: `--no-dry-run` Flag
**Priority: MEDIUM**

The `--no-dry-run` flag exists but isn't tested.

#### 4.3 Untested: `formatErrorMessage()` Edge Cases
**Priority: LOW**

The `formatErrorMessage` function handles multiple error types:
- `Error` instances
- Plain strings
- Objects that throw on `JSON.stringify`

```javascript
// These code paths aren't tested:
formatErrorMessage("plain string error");
formatErrorMessage({ circular: null });  // with circular reference
```

#### 4.4 Untested: MockBroker Class in Isolation
**Priority: LOW**

The `MockBroker` class in `cli.js` could have its own unit tests.

#### 4.5 Untested: Execute Command With `--execute` Flag
**Priority: HIGH**

No test verifies actual order execution output (with mock).

```javascript
test("CLI execute command with --execute flag shows execution output", async () => {
  const result = await runCLI(["execute", "--policy", "policies/core.json", "--execute"]);
  assert.equal(result.code, 0);
  assert.ok(result.stdout.includes("Submitting orders"));
  assert.ok(result.stdout.includes("Execution complete"));
});
```

---

## Recommended Test Improvements by Priority

### High Priority (Should Add)

| Test | Module | Why |
|------|--------|-----|
| Empty positions (new account) | allocate | Common real-world scenario |
| Zero cash scenario | allocate | Edge case that could cause issues |
| drift.kind = "none" mode | allocate | Untested valid configuration |
| Zero price validation | validate | Boundary condition |
| Zero targetWeight validation | validate | Boundary condition |
| Policy file read errors | orchestrator | Error handling coverage |
| Invalid JSON policy | orchestrator | Error handling coverage |
| Broker failure handling | orchestrator | Error resilience |
| Execute with --execute flag | CLI | Critical path untested |

### Medium Priority (Should Consider)

| Test | Module | Why |
|------|--------|-----|
| Multiple positions same symbol | allocate | Aggregation logic |
| Underweight fallback to pro-rata | allocate | Specific code path |
| Position missing symbol | validate | Input validation |
| NaN/Infinity values | validate | Edge cases |
| --help and -h flags | CLI | User-facing feature |
| --no-dry-run flag | CLI | Existing feature |

### Low Priority (Nice to Have)

| Test | Module | Why |
|------|--------|-----|
| Custom roundToUsd option | allocate | Rarely used option |
| Console output format | orchestrator | Output formatting |
| formatErrorMessage edge cases | CLI | Error display |
| MockBroker unit tests | CLI | Internal mock |

---

## Testing Best Practices Recommendations

### 1. Add Property-Based Testing
Consider using a property-based testing library to generate edge cases automatically:

```javascript
// Example with fast-check (would need to add dependency)
test.prop([fc.float({ min: 0, max: 1000000 })])("allocation never exceeds investable cash", (cashUsd) => {
  const snap = baseSnapshot({ cashUsd });
  const plan = allocate(policy, snap);
  return plan.plannedSpendUsd <= plan.investableCashUsd + 0.01;
});
```

### 2. Add Integration Tests for Full Flows
Create end-to-end tests that verify the complete flow from CLI to execution:

```javascript
test("full flow: CLI -> orchestrator -> allocate -> execute", async () => {
  // Test the entire pipeline with realistic data
});
```

### 3. Add Snapshot/Golden Tests
For complex allocation results, consider snapshot testing:

```javascript
test("allocation result matches golden snapshot", () => {
  const plan = allocate(fixedPolicy, fixedSnapshot);
  assert.deepEqual(plan, expectedGoldenResult);
});
```

### 4. Add Performance Tests
For the allocation algorithm, add basic performance benchmarks:

```javascript
test("allocation completes in < 100ms for 100 targets", () => {
  const start = performance.now();
  allocate(largePolicy, largeSnapshot);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 100);
});
```

---

## Summary

The codebase has a solid testing foundation with 46 tests, but there are notable gaps:

1. **Core allocation**: Missing tests for `drift.kind = "none"`, empty positions, zero cash, and several edge cases
2. **Validation**: Missing boundary tests for zero values and special numeric cases
3. **Orchestrator**: Missing error handling tests for file I/O and broker failures
4. **CLI**: Missing tests for help flags and the actual execute path

Addressing the high-priority items would significantly improve confidence in the system's reliability, especially for edge cases and error conditions.
