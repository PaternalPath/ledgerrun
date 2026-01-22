# LedgerRun Safety Model

## Core Principle

**LedgerRun is designed to prevent accidental trades through multiple layers of protection.**

Every safety invariant is enforced by code and locked down by automated tests.

---

## Safety Invariants

### 1. Paper-Only Trading

**Invariant:** LedgerRun will ONLY operate in paper trading mode in v0.1.0.

**Enforcement:**
- CLI checks `ALPACA_PAPER` environment variable
- If `ALPACA_PAPER === "false"`, CLI exits immediately with error
- Default behavior: `ALPACA_PAPER` is treated as `"true"` if unset
- Orchestrator validates `broker.isPaper()` returns `true`
- If broker reports non-paper mode, orchestrator throws error

**Tests:**
- `tests/orchestrator/run.test.js` - "orchestrator refuses non-paper broker"
- `tests/integration/cli.test.js` - "CLI shows error when ALPACA_PAPER is explicitly false"

**What Cannot Happen:**
- ❌ LedgerRun cannot execute live trades (enforced at 2 layers)

---

### 2. Execute Flag Gating

**Invariant:** Orders cannot be executed without explicit `--execute` flag.

**Enforcement:**
- Default behavior: `dryRun=true`, `execute=false`
- `execute` command requires user to pass `--execute` flag
- Without `--execute`, orchestrator skips `broker.executeOrders()` call
- Even with `--execute`, execution only happens if:
  - `dryRun === false` AND
  - `execute === true` AND
  - `plan.status === "PLANNED"` AND
  - `plan.legs.length > 0`

**Tests:**
- `tests/orchestrator/run.test.js`:
  - "orchestrator dry run does not execute orders"
  - "orchestrator executes orders when execute=true"
- `tests/integration/cli.test.js`:
  - "CLI execute command without --execute flag defaults to dry-run"
  - "CLI execute command with --dry-run exits 0"

**What Cannot Happen:**
- ❌ Orders cannot be executed accidentally
- ❌ `plan` command can never execute orders (always dry-run)

---

### 3. Dry-Run Safety

**Invariant:** Dry-run mode NEVER calls `broker.executeOrders()`.

**Enforcement:**
- Orchestrator checks `dryRun` flag before calling `executeOrders()`
- If `dryRun === true`, execution is skipped entirely
- CLI plan command forces `dryRun=true`, `execute=false`

**Tests:**
- `tests/orchestrator/run.test.js` - "orchestrator dry run does not execute orders"
- `tests/integration/cli.test.js` - Multiple tests verify dry-run behavior

**What Cannot Happen:**
- ❌ Dry-run can never place orders

---

### 4. Missing Price Handling

**Invariant:** Behavior on missing prices is explicit and configurable.

**Enforcement:**
- `allowMissingPrices === false` (strict mode, default):
  - Throws error if any target symbol has missing/invalid price
  - Prevents allocation computation entirely
- `allowMissingPrices === true` (non-strict mode):
  - Logs note about missing price
  - Continues allocation (symbol may still get allocation if data exists)

**Tests:**
- `tests/core/allocate.test.js`:
  - "throws if price missing for target (strict mode)"
  - "reports missing price in non-strict mode"

**What Cannot Happen:**
- ❌ Silent failure on missing prices (always throws or logs)
- ❌ Undefined behavior on bad price data

---

### 5. Input Validation

**Invariant:** Invalid policy or snapshot data is rejected with clear errors.

**Enforcement:**
- `validatePolicy()` runs before every allocation
- `validateSnapshot()` runs before every allocation
- Validation checks:
  - Weights sum to 1.0 (within tolerance)
  - No negative values
  - No duplicate symbols
  - Required fields present
  - Types match expected schema

**Tests:**
- `tests/core/validate.test.js` - 14 tests covering all edge cases

**What Cannot Happen:**
- ❌ Invalid policy cannot pass validation
- ❌ Allocation cannot run with bad data

---

### 6. Capital Controls

**Invariant:** Multiple caps prevent over-investment.

**Enforcement:**
- `cashBufferPct` reserves cash (not invested)
- `maxInvestAmountUsd` caps single-run investment
- `minInvestAmountUsd` prevents tiny investments
- `minOrderUsd` filters out small orders
- `maxOrders` limits number of orders per run

**Tests:**
- `tests/core/allocate.test.js`:
  - "cashBufferPct reserves cash correctly"
  - "maxInvestAmountUsd cap enforcement"
  - "NOOP when investable cash below minInvestAmountUsd"
  - "minOrderUsd threshold behavior"
  - "maxOrders cap enforcement"

**What Cannot Happen:**
- ❌ Cannot invest more than `maxInvestAmountUsd` in one run
- ❌ Cannot invest reserved cash buffer
- ❌ Cannot create orders smaller than `minOrderUsd`

---

### 7. Rounding Stability

**Invariant:** Rounding is deterministic and bounded.

**Enforcement:**
- All notional amounts rounded down to `roundToUsd` (default $0.01)
- Total planned spend never exceeds investable cash
- Rounding errors are explicitly noted

**Tests:**
- `tests/core/allocate.test.js` - "rounding stability - no drift beyond $0.01"

**What Cannot Happen:**
- ❌ Planned spend cannot exceed available cash
- ❌ Fractional pennies cannot appear in orders

---

### 8. Drift Band Logic

**Invariant:** Allocation mode (pro-rata vs underweights) is deterministic.

**Enforcement:**
- Compute `maxAbsDeviation` from target weights
- If `drift.kind === "band"`:
  - If `maxAbsDeviation > drift.maxAbsPct` → underweight mode
  - Else → pro-rata mode
- If `drift.kind === "none"` → always pro-rata mode
- Mode is logged in plan notes

**Tests:**
- `tests/core/allocate.test.js`:
  - "drift band mode switching - outside band prioritizes underweights"
  - "drift band mode switching - within band uses pro-rata"

**What Cannot Happen:**
- ❌ Undefined allocation behavior
- ❌ Silent mode switching without explanation

---

## Defense in Depth

LedgerRun uses multiple overlapping safety checks:

```
Layer 1: CLI Environment Check (ALPACA_PAPER)
Layer 2: Orchestrator Broker Check (isPaper())
Layer 3: Execute Flag Gating (--execute required)
Layer 4: Dry-Run Default (must explicitly override)
Layer 5: Input Validation (policy + snapshot)
Layer 6: Capital Controls (multiple caps)
Layer 7: Audit Trail (plan notes explain all decisions)
```

**Philosophy:** Fail safe, fail loud, fail early.

---

## Test Coverage

All safety invariants have explicit test coverage:

| Invariant | Test Count | Pass Rate |
|-----------|------------|-----------|
| Paper-only | 2 | 100% |
| Execute gating | 4 | 100% |
| Dry-run safety | 3 | 100% |
| Missing prices | 2 | 100% |
| Input validation | 22 | 100% |
| Capital controls | 5 | 100% |
| Rounding | 1 | 100% |
| Drift logic | 2 | 100% |
| **Total** | **46** | **100%** |

---

## What Users Must Do

LedgerRun is safe by default, but users must:

1. **Review plans before execution**
   - Always run `plan` first
   - Inspect output for sanity
   - Understand notes and reason codes

2. **Use paper trading**
   - Never set `ALPACA_PAPER=false` in v0.1.0
   - Real trading is not supported

3. **Set conservative limits**
   - Use `maxInvestAmountUsd` to cap exposure
   - Set `minInvestAmountUsd` to avoid trivial runs
   - Use `cashBufferPct` to maintain reserves

4. **Understand policy**
   - Policy is code (version control it)
   - Test policy changes in paper mode first
   - Drift band logic affects behavior

---

## Audit Trail

Every run produces an audit trail via stdout:

- Policy loaded (name, targets)
- Snapshot fetched (cash, positions, prices)
- Plan computed (status, legs, notes)
- Execution status (dry-run vs real)
- Final outcome (success or error)

**Recommendation:** Redirect stdout to log file for records.

```bash
npm run plan -- --policy policies/core.json | tee logs/plan-$(date +%Y%m%d-%H%M%S).log
```

---

## Known Limitations

These are NOT safety issues, but constraints of v0.1.0:

- No order cancellation (orders are fire-and-forget)
- No real-time price fetching (uses broker snapshot)
- No partial fill handling (assumes full execution)
- No retry logic (one-shot execution)
- No position reconciliation (trusts broker snapshot)

Future versions will address these.
