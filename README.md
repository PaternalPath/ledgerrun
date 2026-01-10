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

## M2: Alpaca Paper Broker Adapter

The Alpaca adapter provides integration with Alpaca's paper trading API for testing and development.

### Environment Variables

```bash
ALPACA_API_KEY       # Your Alpaca API Key (required)
ALPACA_API_SECRET    # Your Alpaca API Secret (required)
```

Get your paper trading credentials from: https://app.alpaca.markets/paper/dashboard/overview

### CLI Usage

Fetch current account snapshot:
```bash
node packages/alpaca/src/cli.js snapshot
node packages/alpaca/src/cli.js snapshot VTI VXUS BND
```

The CLI outputs a JSON snapshot compatible with LedgerRun's core allocation engine.

### Programmatic Usage

```javascript
import { AlpacaClient, fetchSnapshot } from "@ledgerrun/alpaca";

const client = new AlpacaClient({ paper: true });
const snapshot = await fetchSnapshot(client, ["VTI", "VXUS", "BND"]);
// Use snapshot with core allocation engine
```

### Paper Trading Only

**IMPORTANT**: This adapter is configured for paper trading only. Live trading is not implemented.

---

## Disclaimer

LedgerRun is execution software.
All investment decisions are made by the user.
Use at your own risk.