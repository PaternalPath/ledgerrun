# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `--version` / `-v` CLI flag to display version number
- Version now shown in `--help` output and startup banner
- `--json` CLI flag for machine-readable JSON output (for scripting/CI)
- `--quiet` / `-q` CLI flag for minimal output (suppresses banner and details)
- Policy templates: aggressive, balanced, conservative strategies

## [0.1.0] - 2026-01-16

### Added

#### Core Features
- Core allocation algorithm with pro-rata and underweight modes
- Policy validation with clear error messages
- Snapshot validation for broker data
- Drift band logic for rebalancing triggers
- Capital controls: cash buffer, min/max invest, min order size, max orders
- Rounding stability (no penny drift)
- Missing price handling (strict and non-strict modes)

#### CLI & Orchestrator
- CLI with `plan` and `execute` commands
- `--help` flag with comprehensive usage information
- Execute flag gating (requires explicit `--execute`)
- Dry-run default behavior
- Paper-only enforcement (ALPACA_PAPER check)
- MockBroker for development and testing
- Audit trail via structured console output

#### Testing
- 46 comprehensive tests covering all safety invariants
- Unit tests for core allocation logic
- Integration tests for orchestrator
- CLI integration tests in subprocess
- All tests use mocks (no network calls)

#### Documentation
- README with public API documentation
- Architecture guide (docs/architecture.md)
- Safety model documentation (docs/safety-model.md)
- Operational runbook (docs/runbook.md)
- Upgrade plan (docs/PLAN.md)

#### Tooling
- ESLint 9 with flat config
- EditorConfig for consistent formatting
- GitHub Actions CI (Node.js 20.x and 22.x)
- .gitignore to prevent secret leaks

### Security
- Paper-only trading enforced at multiple layers
- Execute flag gating prevents accidental execution
- Input validation prevents invalid data processing
- Capital controls limit exposure

### Known Limitations
- **No real broker integration** - MockBroker only
- No order cancellation
- No real-time price fetching
- No partial fill handling
- No retry logic
- No position reconciliation
- **Not production-ready for real money**

---

## Upgrade Guide

### From nothing to v0.1.0

This is the initial release.

**Installation:**

```bash
git clone https://github.com/PaternalPath/ledgerrun.git
cd ledgerrun
npm ci
npm test
```

**Usage:**

See [docs/runbook.md](docs/runbook.md) for detailed usage instructions.

---

## Version History

- **v0.1.0** (2026-01-16) - Initial release (paper trading only)

---

## Future Roadmap

Potential features for future releases (not committed):

- Real Alpaca API integration
- Live trading support (with extensive safety checks)
- Order cancellation and modification
- Position reconciliation
- Retry logic for network failures
- Structured logging (JSON format)
- Multi-broker support
- Tax-loss harvesting
- Scheduled execution via cron/systemd
- Web UI for monitoring

---

## Contributing

See README.md for contribution guidelines.

---

## License

Copyright © 2026 PaternalPath. All rights reserved.
