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

LedgerRun provides two main commands for running allocation strategies:

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
│           └── run.js         # Main run loop
├── apps/
│   └── api/               # CLI application
│       └── src/
│           └── cli.js         # Command-line interface
├── tests/                 # Test suites
│   ├── core/
│   └── orchestrator/
└── policies/              # Policy definitions
    └── core.json
```

---

## Disclaimer

LedgerRun is execution software.
All investment decisions are made by the user.
Use at your own risk.