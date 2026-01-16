# LedgerRun Runbook

## Quick Reference

```bash
# 1. Plan (safe, always dry-run)
npm run plan -- --policy policies/core.json

# 2. Execute (paper-only, requires --execute flag)
npm run execute -- --policy policies/core.json --execute

# 3. Get help
node apps/api/src/cli.js --help
```

---

## Prerequisites

### Environment

- Node.js 20.x or 22.x (LTS)
- npm 10+
- Unix-like environment (Linux, macOS, WSL)

### Installation

```bash
git clone https://github.com/PaternalPath/ledgerrun.git
cd ledgerrun
npm ci
```

### Verify Setup

```bash
npm test      # All tests must pass
npm run lint  # Linting must pass
```

---

## Usage Workflow

### Step 1: Review Your Policy

Policy files live in `policies/*.json`.

**Example:** `policies/core.json`

```json
{
  "version": 1,
  "name": "Core DCA",
  "targets": [
    { "symbol": "VTI", "targetWeight": 0.7 },
    { "symbol": "VXUS", "targetWeight": 0.3 }
  ],
  "cashBufferPct": 0.0,
  "minInvestAmountUsd": 1,
  "maxInvestAmountUsd": 10000,
  "minOrderUsd": 1,
  "maxOrders": 10,
  "drift": { "kind": "band", "maxAbsPct": 0.03 },
  "allowMissingPrices": false
}
```

**Key Fields:**
- `targets` - Asset allocations (weights must sum to 1.0)
- `maxInvestAmountUsd` - Safety cap per run
- `minInvestAmountUsd` - Minimum cash to trigger investment
- `drift.maxAbsPct` - Rebalancing threshold (e.g., 0.03 = 3%)

### Step 2: Run a Plan (Dry-Run)

```bash
npm run plan -- --policy policies/core.json
```

**What This Does:**
- Loads policy from file
- Fetches account snapshot from broker (mock)
- Computes allocation plan
- Shows planned orders
- **Does NOT execute** (always dry-run)

**Example Output:**

```
🚀 LedgerRun CLI

📋 Loaded policy: Core DCA
   Targets: VTI (70.0%), VXUS (30.0%)

📊 Fetching account snapshot from broker...
   Cash: $1000.00
   Positions: 2 holdings
     - VTI: 2 shares @ $250.00 = $500.00
     - VXUS: 3 shares @ $60.00 = $180.00

🧮 Computing allocation plan...

📈 Plan Status: PLANNED
   Total Value: $1680.00
   Cash: $1000.00
   Investable Cash: $1000.00
   Planned Spend: $1000.00

💰 Planned Orders (2):
   - BUY VTI: $676.00
     Current weight: 29.76% → Target: 70.00%
     Post-buy estimate: 70.00%
     Reasons: UNDERWEIGHT, DCA, CASHFLOW_REBALANCE
   - BUY VXUS: $324.00
     Current weight: 10.71% → Target: 30.00%
     Post-buy estimate: 30.00%
     Reasons: UNDERWEIGHT, DCA, CASHFLOW_REBALANCE

🔍 DRY RUN MODE - No orders executed
✅ Run complete
```

### Step 3: Review Plan Output

**Check:**
1. **Plan Status** - Should be `PLANNED` (not `NOOP`)
2. **Planned Spend** - Is it reasonable?
3. **Orders** - Do symbols and amounts make sense?
4. **Weights** - Are post-buy weights close to targets?
5. **Notes** - Read all notes for context

**Common Statuses:**
- `PLANNED` - Orders ready to execute
- `NOOP` - No action needed (cash too low, within band, etc.)

### Step 4: Execute (Paper Mode Only)

**⚠️ CRITICAL: Only paper trading is supported in v0.1.0**

```bash
# Dry-run first (safe, recommended)
npm run execute -- --policy policies/core.json --dry-run

# Execute orders (requires --execute flag)
npm run execute -- --policy policies/core.json --execute
```

**What `--execute` Does:**
- Calls `broker.executeOrders(legs)` with planned orders
- In v0.1.0, this uses MockBroker (simulated execution)
- Real Alpaca integration not yet implemented

**Safety Checks:**
- Orchestrator verifies `broker.isPaper() === true`
- CLI verifies `ALPACA_PAPER !== "false"`
- Multiple layers prevent accidental live trading

---

## Common Scenarios

### Scenario: No Orders Generated

**Symptom:** Plan status is `NOOP`

**Possible Causes:**
1. Cash below `minInvestAmountUsd`
   - **Fix:** Lower `minInvestAmountUsd` or add cash
2. Within drift band and no new cash
   - **Fix:** Add cash or wait until outside band
3. All orders below `minOrderUsd` after rounding
   - **Fix:** Lower `minOrderUsd` or increase cash

### Scenario: Missing Price Error

**Symptom:** Error message "Missing/invalid price for symbol"

**Cause:** Target symbol has no price in snapshot (broker doesn't support it)

**Fix:**
- Option 1: Remove symbol from policy targets
- Option 2: Set `"allowMissingPrices": true` (non-strict mode)

### Scenario: Drift Band Behavior

**Within Band (Pro-Rata Mode):**
- All targets get allocation proportional to target weights
- Note: "Within drift band; allocating pro-rata"

**Outside Band (Underweight Mode):**
- Only underweight symbols get allocation
- Note: "Outside drift band; prioritizing underweights"

**Example:**
- Target: VTI 70%, VXUS 30%
- Current: VTI 65%, VXUS 35% (5% max deviation)
- If `maxAbsPct = 0.03` (3%) → Outside band → Underweight mode
- VTI gets all new cash (it's underweight)

### Scenario: Policy Changes

**Changing Weights:**

```json
{
  "targets": [
    { "symbol": "VTI", "targetWeight": 0.6 },  // Was 0.7
    { "symbol": "VXUS", "targetWeight": 0.4 }  // Was 0.3
  ]
}
```

**Impact:**
- Next run will treat VTI as overweight (was 70%, now target 60%)
- VXUS will be underweight (was 30%, now target 40%)
- If outside drift band, VXUS gets priority

**Best Practice:**
- Test weight changes in paper mode first
- Run `plan` to preview impact
- Understand drift band implications

---

## Safety Checklist

Before running `execute` with `--execute` flag:

- [ ] Reviewed policy file (weights sum to 1.0)
- [ ] Ran `plan` first and reviewed output
- [ ] Verified `ALPACA_PAPER` is NOT set to "false"
- [ ] Understood which mode (pro-rata vs underweights)
- [ ] Checked `maxInvestAmountUsd` is reasonable
- [ ] Confirmed orders match expectations
- [ ] Understood this is paper trading (mock)

---

## Troubleshooting

### Error: "Only paper trading is supported"

**Cause:** `ALPACA_PAPER` is explicitly set to "false"

**Fix:**
```bash
unset ALPACA_PAPER
# OR
export ALPACA_PAPER=true
```

### Error: "Missing/invalid price for target symbol"

**Cause:** Broker snapshot doesn't include price for symbol

**Fix:**
- Verify symbol is correct (typo?)
- Check broker supports symbol
- Set `"allowMissingPrices": true` to skip symbol

### Error: "Policy must be an object"

**Cause:** Policy file is invalid JSON or not found

**Fix:**
```bash
# Validate JSON syntax
cat policies/core.json | jq .

# Check file exists
ls -l policies/core.json
```

### Error: "Target weights must sum to 1"

**Cause:** Weights don't sum to 1.0 (within tolerance)

**Fix:**
```json
{
  "targets": [
    { "symbol": "VTI", "targetWeight": 0.7 },
    { "symbol": "VXUS", "targetWeight": 0.3 }  // Sum = 1.0 ✓
  ]
}
```

### Debugging: Enable Stack Traces

```bash
DEBUG=1 npm run plan -- --policy policies/core.json
```

---

## Logging Recommendations

### Redirect to Log File

```bash
# Create logs directory
mkdir -p logs

# Run with timestamp
npm run plan -- --policy policies/core.json | tee "logs/plan-$(date +%Y%m%d-%H%M%S).log"
```

### Cron Job Example

```bash
# Daily at 2pm (paper mode only)
0 14 * * * cd /path/to/ledgerrun && npm run execute -- --policy policies/core.json --execute >> logs/cron.log 2>&1
```

**⚠️ Note:** Only use cron after extensive manual testing.

---

## Performance Notes

- **Single-threaded:** Node.js single process
- **No database:** Stateless execution
- **Fast:** Typical run < 1 second (mock broker)
- **No retries:** One-shot execution

---

## Upgrading Policy Schema

Current version: `1`

If policy schema changes in future releases:

1. Read CHANGELOG.md for migration guide
2. Update `version` field in policy file
3. Test with `plan` before `execute`

---

## Getting Help

- **Documentation:** README.md, docs/architecture.md, docs/safety-model.md
- **CLI Help:** `node apps/api/src/cli.js --help`
- **Tests:** See `tests/` for usage examples
- **Issues:** https://github.com/PaternalPath/ledgerrun/issues

---

## Advanced: Custom Policy Development

### Creating a New Policy

```bash
cp policies/core.json policies/custom.json
# Edit policies/custom.json
npm run plan -- --policy policies/custom.json
```

### Policy Best Practices

1. **Start conservative:**
   - Low `maxInvestAmountUsd` (e.g., $100)
   - High `minInvestAmountUsd` threshold
   - Wide `drift.maxAbsPct` (e.g., 0.05 = 5%)

2. **Version control policies:**
   ```bash
   git add policies/custom.json
   git commit -m "feat: add custom policy"
   ```

3. **Test thoroughly:**
   - Run multiple `plan` commands
   - Simulate different account states
   - Understand both allocation modes

4. **Document intent:**
   ```json
   {
     "name": "Aggressive Growth - 90/10 US/Intl",
     ...
   }
   ```

---

## Production Readiness (Future)

**v0.1.0 is NOT production-ready for real money.**

When real Alpaca integration is added:

- [ ] Validate API keys securely (env vars, not committed)
- [ ] Test extensively in Alpaca paper mode
- [ ] Implement order confirmation prompts
- [ ] Add retry logic for network failures
- [ ] Implement position reconciliation
- [ ] Add structured logging (JSON format)
- [ ] Set up monitoring/alerting
- [ ] Document incident response procedures

**Until then: Paper mode only.**
