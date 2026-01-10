# LedgerRun

LedgerRun is a policy-driven execution engine for ETF DCA.

You define the rules.
LedgerRun executes them automatically — safely, transparently, and repeatably.

---

## What LedgerRun Is

LedgerRun is **not** an investment advisor.
It does not recommend assets or strategies.

LedgerRun is software that:
- Enforces a user-defined ETF allocation policy
- Automatically executes trades via a brokerage API
- Maintains a full audit trail explaining every action

Think of it as an autopilot for discipline, not decision-making.

---

## Core Principles

- **Execution-first**: automation beats intention
- **Policy-as-code**: rules are explicit, versioned, and enforced
- **Glass box**: every trade is explainable
- **Safety by default**: caps, kill switches, paper-first workflows

---

## V1 Scope (Power User)

- ETF-only DCA
- Alpaca brokerage integration (paper + live)
- Fractional / notional orders
- Scheduled execution
- Drift-aware allocation
- Immutable audit logs

### Explicit Non-Goals (V1)

- No investment advice
- No tax-loss harvesting
- No backtesting
- No social features
- No multi-broker support
- No leverage or margin
- No options or crypto

---

## Status

🚧 Early development
Initial focus: paper-trading execution loop

---

## Quick Start

### Installation

```bash
git clone https://github.com/PaternalPath/ledgerrun.git
cd ledgerrun
```

### Running Tests

```bash
npm test
```

### Using the CLI

LedgerRun provides multiple commands for running allocation strategies:

#### 1. Plan (Dry Run)

Generate an allocation plan without executing any trades:

```bash
npm run plan -- --policy policies/core.json
```

This will:
- Load the policy from the specified JSON file
- Fetch current account snapshot from the broker (mock by default)
- Calculate optimal allocation based on policy rules
- Display the planned orders without executing them

#### 2. Execute

Execute trades based on the allocation plan:

```bash
# Dry run (default - safe, no trades executed)
npm run execute -- --policy policies/core.json --dry-run

# Execute trades (requires explicit --execute flag)
npm run execute -- --policy policies/core.json --execute
```

**⚠️ SAFETY**: The `--execute` flag is required to actually place orders. This prevents accidental trade execution.

#### 3. Run (Scheduler-Friendly with Idempotency)

Execute trades with idempotency protection to prevent duplicate runs:

```bash
# Run with daily idempotency (default - once per day max)
npm run run -- --policy policies/core.json --execute

# Run with hourly idempotency (once per hour max)
npm run run -- --policy policies/core.json --execute --granularity hourly

# Skip idempotency check (force execution)
npm run run -- --policy policies/core.json --execute --skip-idempotency

# Dry run (no idempotency check)
npm run run -- --policy policies/core.json --dry-run
```

**Idempotency Features:**
- Generates unique key based on policy + date/hour
- Prevents duplicate execution for same policy and time period
- Persists run metadata to `./runs/` directory
- Safe for use in cron jobs and schedulers
- Dry runs do not check idempotency (always execute)

**Example cron setup** (run daily at 9:30 AM):
```cron
30 9 * * * cd /path/to/ledgerrun && npm run run -- --policy policies/core.json --execute
```

#### 4. History

View past run history:

```bash
# Show all runs
npm run history

# Show last 10 runs
npm run history -- --limit 10

# Custom runs directory
npm run history -- --runs-dir ./custom-runs
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALPACA_PAPER` | `true` | Must be `true`. Only paper trading is supported in current version. |
| `DEBUG` | (unset) | Set to any value to enable detailed error stack traces. |

**Note**: Real Alpaca API integration is not yet implemented. The CLI currently uses a mock broker for development and testing.

### Policy File Format

Policies are defined in JSON files. Example (`policies/core.json`):

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

**Policy Fields**:
- `version`: Policy format version (must be 1)
- `name`: Human-readable policy name
- `targets`: Array of target allocations (weights must sum to 1.0)
- `cashBufferPct`: Percentage of total value to keep as cash buffer
- `minInvestAmountUsd`: Minimum cash required to trigger investment
- `maxInvestAmountUsd`: Maximum amount to invest in a single run
- `minOrderUsd`: Minimum order size (smaller orders are skipped)
- `maxOrders`: Maximum number of orders per run
- `drift`: Rebalancing trigger (`"none"` or `"band"` with `maxAbsPct` threshold)
- `allowMissingPrices`: If true, skip symbols with missing prices instead of failing

### Run Metadata

When using the `run` command (not `plan` or dry-run `execute`), LedgerRun persists run metadata to the `./runs/` directory. Each run creates a JSON file named by its idempotency key.

**Example metadata file** (`runs/2026-01-10-75afbed085ad877d.json`):

```json
{
  "idempotencyKey": "2026-01-10-75afbed085ad877d",
  "timestamp": "2026-01-10T14:16:33.013Z",
  "dateKey": "2026-01-10",
  "granularity": "daily",
  "policyPath": "policies/core.json",
  "policyName": "Core DCA",
  "status": "PLANNED",
  "planHash": "99d0f4aa9a92611e",
  "dryRun": false,
  "executed": true,
  "plan": {
    "status": "PLANNED",
    "totalValueUsd": 1680.00,
    "cashUsd": 1000.00,
    "investableCashUsd": 1000.00,
    "plannedSpendUsd": 1000.00,
    "legs": [
      {
        "symbol": "VTI",
        "notionalUsd": 676.00,
        "currentWeight": 0.2976,
        "targetWeight": 0.7,
        "postBuyEstimatedWeight": 0.7000,
        "reasonCodes": ["UNDERWEIGHT", "DCA", "CASHFLOW_REBALANCE"]
      }
    ],
    "notes": ["Applied max invest cap: $10000.00.", "..."]
  },
  "execution": {
    "ordersPlaced": 2,
    "orderIds": ["mock-order-123", "mock-order-124"]
  }
}
```

**Metadata Fields:**
- `idempotencyKey`: Unique key for this run (policy hash + date/hour)
- `timestamp`: ISO 8601 timestamp when run started
- `dateKey`: Date key used for idempotency (e.g., "2026-01-10" or "2026-01-10-14")
- `granularity`: Idempotency granularity ("daily" or "hourly")
- `planHash`: Hash of the allocation plan (for detecting plan changes)
- `executed`: Whether orders were actually executed
- `execution`: Details about executed orders (only present if executed=true)
- `metrics`: Run metrics including duration and event timeline

### Observability & Guardrails

LedgerRun M5 includes built-in observability and safety guardrails to provide transparency and prevent unsafe trading behavior.

#### Observability Features

**Structured Logging:**
- Log levels: DEBUG, INFO, WARN, ERROR
- Structured log format (JSON or human-readable)
- Event tracking throughout execution lifecycle
- Set via environment variable: `LOG_FORMAT=json` for JSON output

**Run Metrics:**
- Execution duration tracking
- Event timeline with timestamps
- Performance monitoring
- All metrics saved to run metadata

**Example metrics** (from run metadata):
```json
{
  "metrics": {
    "durationMs": 11,
    "events": [
      { "name": "policy_load_start", "timestamp": "2026-01-10T14:27:29.857Z", "elapsed": 1 },
      { "name": "policy_load_complete", "timestamp": "2026-01-10T14:27:29.861Z", "elapsed": 5 },
      { "name": "allocation_start", "timestamp": "2026-01-10T14:27:29.863Z", "elapsed": 7 },
      { "name": "allocation_complete", "timestamp": "2026-01-10T14:27:29.865Z", "elapsed": 9 },
      { "name": "safety_checks_start", "timestamp": "2026-01-10T14:27:29.865Z", "elapsed": 9 },
      { "name": "safety_checks_complete", "timestamp": "2026-01-10T14:27:29.866Z", "elapsed": 10 },
      { "name": "orders_executed", "timestamp": "2026-01-10T14:27:29.867Z", "elapsed": 11 }
    ]
  }
}
```

#### Guardrails (Safety Checks)

LedgerRun automatically runs safety checks before order execution. Currently, these checks produce warnings but do not block execution (blocking behavior coming in future release).

**Position Size Limits:**
- Prevents any single position from exceeding a % of total portfolio
- Default: 50% max position size
- Configurable via guardrails parameter

**Daily Spend Limits:**
- Tracks cumulative spending across all runs in a single day
- Default: $10,000 daily limit
- Prevents runaway spending

**Large Order Warnings:**
- Warns when an order exceeds a threshold % of portfolio
- Default: 10% threshold
- Helps catch unexpected large orders

**Policy Validation:**
- Validates policy settings for safety issues
- Warns about concentrated positions, high limits, etc.
- Runs automatically on every execution

**Example guardrails output:**
```
⚠️  Safety Warning: Large order detected: VTI $676.00 (40.2% of portfolio)
🚨 Safety Check Failed: Daily spend limit exceeded: $11000.00 (limit: $10000.00)
```

**Guardrails Configuration:**
```javascript
// Example (for advanced users - currently requires code modification)
guardrails: {
  maxPositionPct: 0.5,        // 50% max per position
  dailySpendLimit: 10000,     // $10k daily limit
  largeOrderThreshold: 0.1    // 10% warning threshold
}
```

### Architecture

```
ledgerrun/
├── packages/
│   ├── core/              # Core allocation logic
│   │   └── src/
│   │       ├── allocate.js    # Allocation algorithm
│   │       └── validate.js    # Policy & snapshot validation
│   └── orchestrator/      # Execution orchestration
│       └── src/
│           ├── run.js         # Main run loop (with observability)
│           ├── persistence.js # Run metadata & idempotency
│           ├── logger.js      # Structured logging
│           ├── guardrails.js  # Safety checks & limits
│           └── metrics.js     # Run metrics tracking
├── apps/
│   └── api/               # CLI application
│       └── src/
│           └── cli.js         # Command-line interface
├── tests/                 # Test suites (42 tests, all passing)
│   ├── core/
│   │   └── allocate.test.js
│   └── orchestrator/
│       ├── run.test.js
│       ├── persistence.test.js
│       ├── idempotency.test.js
│       ├── guardrails.test.js
│       ├── logger.test.js
│       └── metrics.test.js
├── policies/              # Policy definitions
│   └── core.json
└── runs/                  # Run metadata (auto-created)
    └── *.json             # Includes metrics & safety check results
```

---

## Disclaimer

LedgerRun is execution software.
All investment decisions are made by the user.
Use at your own risk.