# Contributing to LedgerRun

Thank you for your interest in contributing to LedgerRun.

## Getting Started

### Prerequisites

- Node.js 20.x or 22.x
- npm 10.x or later

### Setup

```bash
git clone https://github.com/PaternalPath/ledgerrun.git
cd ledgerrun
npm install
```

### Verify Setup

```bash
npm test        # Run all tests (45 tests)
npm run lint    # Run ESLint
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make changes** and add tests
4. **Run checks** before committing:
   ```bash
   npm test && npm run lint
   ```
5. **Commit** with a clear message (see commit guidelines below)
6. **Push** and open a pull request

## Code Style

- ES Modules (`import`/`export`)
- Double quotes for strings
- Semicolons required
- 2-space indentation
- Arrow functions for callbacks

ESLint enforces these rules. Run `npm run lint` to check.

## Commit Messages

Use clear, descriptive commit messages:

```
<type>: <short description>

<optional body>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Adding or updating tests
- `chore`: Maintenance (dependencies, CI, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature

Examples:
```
feat: add support for multiple policies
fix: handle missing prices in strict mode
docs: update README with CLI examples
test: add validation tests for negative weights
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new functionality
- Update documentation if needed
- Ensure CI passes before requesting review
- Link related issues in the PR description

## Project Structure

```
packages/
  core/           # Pure allocation logic (no dependencies)
  orchestrator/   # Execution coordination
apps/
  api/            # CLI application
tests/
  core/           # Unit tests for core
  orchestrator/   # Orchestrator tests
  integration/    # CLI integration tests
docs/             # Documentation
policies/         # Example policy files
```

## Testing

- All new features require tests
- Tests use Node.js built-in test runner
- Run specific test file: `node --test tests/core/allocate.test.js`
- Tests should be deterministic (no network calls, no timing dependencies)

## Questions?

Open a GitHub issue for questions about contributing.
