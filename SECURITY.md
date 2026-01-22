# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in LedgerRun, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email the maintainers with details of the vulnerability
2. Include steps to reproduce the issue
3. Provide any relevant logs or screenshots (redact sensitive data)

### What to Expect

- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline depends on severity

### Severity Guidelines

| Severity | Description | Example |
|----------|-------------|---------|
| Critical | Direct financial loss or credential exposure | Hardcoded API keys, order execution bypass |
| High | Security control bypass | Paper-only enforcement bypass |
| Medium | Information disclosure | Verbose error messages exposing internals |
| Low | Minor issues | Missing security headers |

## Security Measures

LedgerRun implements multiple security layers:

1. **Paper-only enforcement** - v0.1.x only supports paper trading
2. **Execute flag gating** - Orders require explicit `--execute` flag
3. **Input validation** - All policies and snapshots validated before processing
4. **Secret scanning** - Gitleaks runs on every push to detect hardcoded credentials
5. **Dependency auditing** - `npm audit` checks for known vulnerabilities in CI

## Best Practices for Users

- Never commit `.env` files or API credentials to version control
- Use environment variables for sensitive configuration
- Review allocation plans before enabling `--execute` flag
- Keep dependencies updated
