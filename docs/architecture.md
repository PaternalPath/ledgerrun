# LedgerRun Architecture

## Overview

LedgerRun is a policy-driven ETF allocation engine structured as a monorepo with three layers:

```
Policy → Snapshot → Allocation → Plan → Execute
```

## Module Structure

### 1. Core (`packages/core`)

**Purpose:** Pure allocation logic with zero dependencies.

**Exports:**
- `allocate(policy, snapshot, options)` - Computes allocation plan
- `validatePolicy(policy)` - Validates policy schema
- `validateSnapshot(snapshot)` - Validates snapshot data

**Key Files:**
- `allocate.js` - Allocation algorithm (pro-rata and underweight modes)
- `validate.js` - Input validation with clear error messages
- `index.js` - Public API exports

**Design Principles:**
- Pure functions (no I/O, no side effects)
- Deterministic (same inputs → same outputs)
- Testable in isolation

### 2. Orchestrator (`packages/orchestrator`)

**Purpose:** Execution coordination and broker integration.

**Exports:**
- `runOnce({ policyPath, broker, dryRun, execute, silent })` - Main run loop

**Responsibilities:**
- Load policy from file
- Fetch snapshot from broker
- Call core allocation logic
- Execute orders if requested
- Log results

**Safety Enforcements:**
- Paper-only check (broker.isPaper())
- Dry-run default behavior
- Explicit execute flag required

### 3. CLI (`apps/api`)

**Purpose:** Command-line interface for end users.

**Commands:**
- `plan` - Dry-run planning (no execution)
- `execute` - Execution mode (requires `--execute` flag)

**Flags:**
- `--policy <path>` - Policy file path
- `--execute` - Enable execution (safety gating)
- `--dry-run` - Force dry-run mode
- `--help` - Show usage

## Data Flow

### Normal Execution Path

```
1. User runs CLI command
   ↓
2. CLI validates environment (ALPACA_PAPER must be true)
   ↓
3. CLI creates broker instance (currently MockBroker)
   ↓
4. Orchestrator.runOnce() loads policy file
   ↓
5. Orchestrator calls broker.getSnapshot()
   ↓
6. Orchestrator calls core.allocate(policy, snapshot)
   ↓
7. Core validates inputs
   ↓
8. Core computes allocation (see decision tree below)
   ↓
9. Core returns plan { status, legs, notes }
   ↓
10. Orchestrator logs plan details
    ↓
11. IF execute=true AND status=PLANNED → broker.executeOrders(legs)
    ↓
12. CLI exits with code 0 (success) or 1 (error)
```

## Allocation Decision Tree

```
START
  ↓
Validate policy & snapshot
  ↓
Compute total value = equity + cash
  ↓
Apply cash buffer (reserve cashBufferPct)
  ↓
Cap investable cash at maxInvestAmountUsd
  ↓
Is investable cash >= minInvestAmountUsd?
  NO → NOOP (exit)
  YES ↓
  ↓
Compute current weights for each target
  ↓
Is drift.kind = "band"?
  NO → Use pro-rata allocation
  YES ↓
    ↓
  Is maxAbsDeviation > drift.maxAbsPct?
    NO → Use pro-rata allocation
    YES → Use underweight allocation
  ↓
Compute raw buy amounts per symbol
  ↓
Round down to minOrderUsd
  ↓
Filter out legs < minOrderUsd
  ↓
Cap to maxOrders (drop smallest)
  ↓
Is final plannedSpendUsd >= minInvestAmountUsd?
  NO → NOOP
  YES → PLANNED (return legs)
```

## Allocation Modes

### Pro-Rata Mode

**When:** Within drift band OR drift.kind = "none"

**Logic:** Allocate cash proportionally to target weights.

```
For each target:
  buy[symbol] = investableCash * targetWeight
```

**Example:** 70/30 portfolio with $100 cash → VTI: $70, VXUS: $30

### Underweight Mode

**When:** Outside drift band (maxAbsDeviation > drift.maxAbsPct)

**Logic:** Allocate cash only to underweight symbols, proportional to their deficit.

```
For each symbol:
  deficit = max(0, targetWeight - currentWeight)
  buy[symbol] = investableCash * (deficit / sumOfDeficits)
```

**Example:** VTI is 20% (target 70%), VXUS is 80% (target 30%)
- VTI deficit = 50%, VXUS deficit = 0%
- All cash goes to VTI

## Configuration Points

### Policy (`policies/*.json`)

- Defines target allocations
- Sets safety limits (min/max invest, min order size)
- Configures drift behavior
- Allows/disallows missing prices

### Environment Variables

- `ALPACA_PAPER` - Must be "true" or unset (enforced at CLI level)
- `DEBUG` - Enables full stack traces on error

### Broker Interface

```javascript
{
  isPaper() → boolean,
  getSnapshot() → Promise<Snapshot>,
  executeOrders(legs) → Promise<ExecutionResult>
}
```

## Testing Strategy

- **Unit tests** (`tests/core/`) - Core logic in isolation
- **Integration tests** (`tests/orchestrator/`) - Orchestrator with mock broker
- **CLI tests** (`tests/integration/`) - Full CLI execution in subprocess
- **No network calls** - All tests use mocks/fixtures

## Future Extension Points

1. **Real broker integration:** Replace MockBroker with Alpaca API client
2. **Multiple brokers:** Adapter pattern for broker interface
3. **Audit logging:** Structured logs to file/database
4. **Dry-run persistence:** Save plans to file for review
5. **Scheduled execution:** Cron job or systemd timer integration

## Non-Goals (by Design)

- No web server (CLI only)
- No database (stateless execution)
- No backtesting (execution-only)
- No tax optimization
- No portfolio analysis/reporting
- No user authentication (single-user tool)
