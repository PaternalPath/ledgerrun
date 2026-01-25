# LedgerRun

[![CI](https://github.com/PaternalPath/ledgerrun/actions/workflows/ci.yml/badge.svg)](https://github.com/PaternalPath/ledgerrun/actions/workflows/ci.yml)

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

- **Execution-first**: Automation beats intention
- **Policy-as-code**: Rules are explicit, versioned, and enforced
- **Glass box**: Every trade is explainable with full audit trail
- **Safety by default**: Paper-only, execute gating, multiple caps, dry-run first

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

**v0.1.0** - Paper trading only

✅ Core allocation logic
✅ Drift-aware rebalancing
✅ CLI with safety gating
✅ Comprehensive test coverage (46 tests)
✅ Full documentation

⚠️ **Mock broker only** - Real Alpaca integration not yet implemented

---

## Quick Start

```bash
git clone https://github.com/PaternalPath/ledgerrun.git
cd ledgerrun
npm ci
cp .env.example .env
npm test
```

### Running Tests

```bash
npm test
npm run lint
```

### Using the CLI

**Get help:**

```bash
node apps/api/src/cli.js --help
```

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

Create a local environment file before running the CLI:

```bash
cp .env.example .env
```

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

### Policy Templates

Pre-built policies for common investment strategies:

| Policy | File | Description |
|--------|------|-------------|
| **Core DCA** | `policies/core.json` | Default 70/30 US/International equity |
| **Aggressive Growth** | `policies/aggressive.json` | 100% equity with emerging markets |
| **Balanced 60/40** | `policies/balanced.json` | Classic 60% equity / 40% bond split |
| **Conservative Income** | `policies/conservative.json` | Bond-heavy for capital preservation |

```bash
# Use a specific policy template
npm run plan -- --policy policies/aggressive.json
```

## Public API

LedgerRun is structured as a monorepo with clear API boundaries.

### Core Library (`packages/core`)

Pure allocation logic with zero dependencies.

```javascript
import { allocate, validatePolicy, validateSnapshot } from "@ledgerrun/core";

// Compute allocation plan
const plan = allocate(policy, snapshot, options);
// Returns: { status, legs, notes, totalValueUsd, ... }

// Validate inputs
validatePolicy(policy);     // Throws on invalid policy
validateSnapshot(snapshot); // Throws on invalid snapshot
```

**Key Types:**

```javascript
// Policy
{
  version: 1,
  name: string,
  targets: [{ symbol: string, targetWeight: number }],
  cashBufferPct?: number,
  minInvestAmountUsd?: number,
  maxInvestAmountUsd?: number,
  minOrderUsd?: number,
  maxOrders?: number,
  drift: { kind: "none" | "band", maxAbsPct?: number },
  allowMissingPrices?: boolean
}

// Snapshot
{
  asOfIso: string,
  cashUsd: number,
  positions: [{ symbol: string, quantity: number, marketValueUsd: number }],
  pricesUsd: { [symbol: string]: number }
}

// Plan Result
{
  status: "PLANNED" | "NOOP",
  policyName: string,
  legs: [{ symbol, notionalUsd, targetWeight, currentWeight, reasonCodes }],
  notes: string[],
  totalValueUsd: number,
  investableCashUsd: number,
  plannedSpendUsd: number
}
```

### Orchestrator (`packages/orchestrator`)

Execution coordination and broker integration.

```javascript
import { runOnce } from "@ledgerrun/orchestrator";

// Run allocation cycle
const result = await runOnce({
  policyPath: "policies/core.json",
  broker: brokerInstance,      // Must implement broker interface
  dryRun: true,                 // Default: true (safe)
  execute: false,               // Default: false (requires explicit flag)
  silent: false                 // Default: false (log to console)
});
// Returns: { plan, execution? }
```

**Broker Interface:**

```javascript
{
  isPaper(): boolean,
  getSnapshot(): Promise<Snapshot>,
  executeOrders(legs): Promise<{ ordersPlaced: number, orderIds: string[] }>
}
```

### CLI (`apps/api`)

Command-line interface for end users.

```bash
# Commands
npm run plan            # Dry-run planning
npm run execute         # Execution (requires --execute flag)
npm run validate        # Validate policy file

# Flags
--policy <path>         # Policy file path
--execute               # Enable order execution
--dry-run               # Force dry-run mode
--json                  # Output result as JSON (for scripting/CI)
--quiet, -q             # Minimal output (suppress banner and details)
--help, -h              # Show help
--version, -v           # Show version number
```

---

## Architecture

```
ledgerrun/
├── packages/
│   ├── core/                  # Pure allocation logic
│   │   ├── src/
│   │   │   ├── allocate.js   # Allocation algorithm
│   │   │   ├── validate.js   # Input validation
│   │   │   └── index.js      # Public exports
│   │   └── package.json
│   └── orchestrator/          # Execution orchestration
│       ├── src/
│       │   └── run.js        # Main run loop
│       └── package.json
├── apps/
│   └── api/                   # CLI application
│       └── src/
│           └── cli.js        # Command-line interface
├── tests/                     # Test suites (46 tests)
│   ├── core/                 # Unit tests
│   ├── orchestrator/         # Integration tests
│   └── integration/          # CLI tests
├── docs/                      # Documentation
│   ├── PLAN.md               # Upgrade roadmap
│   ├── architecture.md       # System design
│   ├── safety-model.md       # Safety invariants
│   └── runbook.md            # Operational guide
└── policies/                  # Policy definitions
    └── core.json
```

For detailed architecture, see [docs/architecture.md](docs/architecture.md).

---

## Safety Model

LedgerRun is designed with multiple layers of safety protection:

1. **Paper-only enforcement** - Only paper trading supported in v0.1.0
2. **Execute flag gating** - Orders require explicit `--execute` flag
3. **Dry-run default** - Default behavior is always safe
4. **Input validation** - All inputs validated before processing
5. **Capital controls** - Multiple caps prevent over-investment
6. **Rounding stability** - Deterministic rounding, no penny drift
7. **Drift band logic** - Explicit mode switching (pro-rata vs underweights)
8. **Audit trail** - Every decision explained in plan notes

For full safety details, see [docs/safety-model.md](docs/safety-model.md).

---

## Documentation

- **[README.md](README.md)** - This file (overview and quick start)
- **[docs/architecture.md](docs/architecture.md)** - System design and data flow
- **[docs/safety-model.md](docs/safety-model.md)** - Safety invariants and test coverage
- **[docs/runbook.md](docs/runbook.md)** - Operational guide and troubleshooting
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

---

## Versioning

LedgerRun follows [Semantic Versioning](https://semver.org/):

- **v0.x.x** - Pre-release (paper trading only, breaking changes may occur)
- **v1.0.0** - First stable release (when real broker integration is production-ready)

Current version: **v0.1.0**

---

## Development

### Running Locally

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Run linter
npm run lint

# Test CLI commands
npm run plan
npm run execute -- --dry-run
```

### CI/CD

GitHub Actions runs on every push:
- Lint check (ESLint)
- Test suite (46 tests on Node.js 20.x and 22.x)
- No build step required (runtime JavaScript)

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make changes and add tests
4. Ensure `npm test` and `npm run lint` pass
5. Commit with clear messages
6. Push and create a pull request

---

## Disclaimer

LedgerRun is execution software.
All investment decisions are made by the user.
Use at your own risk.

**v0.1.0 is NOT production-ready for real money.**
