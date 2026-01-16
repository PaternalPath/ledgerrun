# Fortune-500 Quality Upgrade Plan

## Current State Audit (2026-01-16)

### Repository Structure

This is a **monorepo** with the following structure:

```
ledgerrun/
├── packages/
│   ├── core/                  # @ledgerrun/core - allocation logic
│   │   ├── src/
│   │   │   ├── allocate.js   # Core allocation algorithm (282 LOC)
│   │   │   ├── validate.js   # Policy/snapshot validation (91 LOC)
│   │   │   └── index.js      # Public exports
│   │   └── package.json
│   └── orchestrator/          # @ledgerrun/orchestrator - execution
│       ├── src/
│       │   └── run.js        # Main run loop (85 LOC)
│       └── package.json
├── apps/
│   └── api/                   # CLI application
│       └── src/
│           └── cli.js        # CLI entry point (140 LOC)
├── tests/
│   ├── core/
│   │   └── allocate.test.js  # 3 tests
│   └── orchestrator/
│       └── run.test.js       # 4 tests
├── policies/
│   └── core.json             # Sample policy file
├── docs/
│   ├── architecture.md       # EMPTY
│   ├── compliance.md         # EMPTY
│   └── runbook.md            # EMPTY
├── package.json              # Root package with scripts
└── README.md                 # Good content, needs polish
```

### Entrypoints

1. **Core Library** (`packages/core/src/index.js`):
   - `allocate(policy, snapshot, options)` - Main allocation function
   - `validatePolicy(policy)` - Policy validation
   - `validateSnapshot(snapshot)` - Snapshot validation

2. **Orchestrator** (`packages/orchestrator/src/run.js`):
   - `runOnce({ policyPath, broker, dryRun, execute, silent })` - Main execution loop

3. **CLI** (`apps/api/src/cli.js`):
   - `npm run plan` - Dry run planning
   - `npm run execute` - Execution (requires `--execute` flag)

### Current Scripts (Root package.json)

```json
{
  "test": "node --test",           // ✅ WORKS - Uses Node.js built-in test runner
  "plan": "node apps/api/src/cli.js plan",     // ✅ WORKS
  "execute": "node apps/api/src/cli.js execute" // ✅ WORKS
}
```

**Missing Scripts:**
- `lint` - No linting configured
- `typecheck` - N/A (pure JavaScript, no TypeScript)
- `build` - N/A (no build step needed for this library)

### Test Status

**Current Coverage: 7 tests, all passing**

✅ **What's Covered:**
- Basic pro-rata allocation
- NOOP when cash below threshold
- Missing price handling (strict mode throws)
- Orchestrator dry-run safety
- Orchestrator execute=true behavior
- Paper-only enforcement
- NOOP status handling

❌ **What's Missing (Critical Safety Invariants):**
- Rounding stability (no penny drift beyond tolerance)
- minOrderUsd threshold behavior
- Drift band mode switching logic
- Underweight prioritization when outside band
- Missing price in non-strict mode (should skip symbol, not fail)
- maxOrders cap enforcement
- cashBufferPct behavior
- maxInvestAmountUsd cap
- Input validation edge cases
- CLI integration test (exit codes, output markers)

### Documentation Status

| Document | Status | Required |
|----------|--------|----------|
| README.md | ⚠️ Good but needs polish | Yes |
| docs/architecture.md | ❌ Empty | Yes |
| docs/safety-model.md | ❌ Missing | Yes |
| docs/runbook.md | ❌ Empty | Yes |
| CHANGELOG.md | ❌ Missing | Yes |
| docs/PLAN.md | ✅ This document | No (audit only) |

### Tooling & Configuration

| File | Status | Required |
|------|--------|----------|
| .gitignore | ❌ Missing | Yes |
| .editorconfig | ❌ Missing | Yes |
| eslint.config.js | ❌ Missing | Yes |
| .prettierrc | ⚠️ Optional | Recommended |
| .github/workflows/ci.yml | ❌ Missing | Yes |

### Dependencies

**Current:** None (beyond Node.js built-ins)

**Proposed Additions (Minimal):**
- `eslint` + `@eslint/js` - Linting
- `globals` - ESLint globals helper
- _(Optional)_ `prettier` - Code formatting

### Gap Analysis vs Acceptance Criteria

#### 1. Clean Machine Verification ❌

- ✅ `npm ci` - Would work (no dependencies yet)
- ✅ `npm test` - Works
- ❌ `npm run lint` - Not configured
- ✅ `npm run typecheck` - N/A (no TypeScript)
- ✅ `npm run build` - N/A (no build step, document this)

#### 2. CI Required ❌

- ❌ No GitHub Actions workflow exists

#### 3. Safety Invariants Locked by Tests ⚠️ PARTIAL

- ✅ Dry-run never executes (covered)
- ✅ execute=true must be explicit (covered)
- ✅ Paper-only guard enforced (covered)
- ⚠️ Missing price behavior partially covered (strict mode only)
- ❌ Drift band logic not comprehensively tested
- ❌ Rounding stability not tested
- ❌ Input validation edge cases not tested

#### 4. Documentation Required ❌

- ⚠️ README needs polish (public API section, non-goals)
- ❌ architecture.md empty
- ❌ safety-model.md missing
- ❌ runbook.md empty

#### 5. Packaging Quality ⚠️ PARTIAL

- ✅ Intentional exports (packages/core/src/index.js is clean)
- ✅ No accidental exports
- ❌ CLI lacks --help output
- ❌ No .gitignore (risk of committed secrets)

---

## Upgrade Plan: 8 Tasks

### Task 1: Project Structure & Tooling
**Goal:** Add standard tooling and configuration files

**Actions:**
1. Create `.gitignore` (node_modules, .env, coverage, etc.)
2. Create `.editorconfig` (consistent formatting)
3. Add ESLint configuration (`eslint.config.js` - flat config)
4. Install dev dependencies: `eslint`, `@eslint/js`, `globals`
5. Add `lint` script to root package.json
6. Run lint, fix any issues

**Acceptance:**
- `npm run lint` passes
- `.gitignore` prevents common mistakes
- `.editorconfig` ensures consistency

### Task 2: Expand Test Coverage - Safety Invariants
**Goal:** Lock down all critical safety behaviors with tests

**Actions:**
1. **Allocation Tests** (`tests/core/allocate.test.js`):
   - Add rounding stability test (verify no >$0.01 drift)
   - Add minOrderUsd threshold test
   - Add drift band switching test (pro-rata vs underweights)
   - Add underweight prioritization test
   - Add missing price non-strict mode test (should skip symbol)
   - Add maxOrders cap test
   - Add cashBufferPct test
   - Add maxInvestAmountUsd test

2. **Validation Tests** (new file: `tests/core/validate.test.js`):
   - Invalid policy schemas
   - Edge cases (weights sum to != 1, negative values, etc.)

3. **Integration Test** (new file: `tests/integration/cli.test.js`):
   - Run CLI in subprocess
   - Assert exit code 0 for dry-run
   - Assert output contains expected markers

**Acceptance:**
- All safety invariants have explicit test coverage
- Test suite covers edge cases
- `npm test` passes with expanded coverage

### Task 3: CLI Quality & Help Output
**Goal:** Production-grade CLI with clear usage

**Actions:**
1. Add `--help` / `-h` flag handler to cli.js
2. Improve error messages (clear, actionable)
3. Validate required flags
4. Add examples to help output
5. Ensure stable exit codes (0=success, 1=error)

**Acceptance:**
- `node apps/api/src/cli.js --help` shows clear usage
- Error messages are actionable
- Exit codes are correct

### Task 4: GitHub Actions CI
**Goal:** Automated testing on push/PR

**Actions:**
1. Create `.github/workflows/ci.yml`
2. Configure matrix: Node.js 20, 22 (LTS versions)
3. Steps: checkout → setup-node → npm ci → npm test → npm run lint
4. Add status badge to README

**Acceptance:**
- Pushing to branch triggers CI
- CI passes
- Badge appears in README

### Task 5: Complete Documentation
**Goal:** Professional, concise, useful docs

**Actions:**
1. **docs/architecture.md** (1 page):
   - Module overview
   - Data flow: policy → snapshot → allocation → plan → execute
   - Decision tree diagram (when to use pro-rata vs underweights)

2. **docs/safety-model.md**:
   - Invariants (what cannot happen by design)
   - How tests enforce each invariant
   - Paper-only enforcement
   - Execute gating

3. **docs/runbook.md**:
   - How to use safely in paper mode
   - Step-by-step for plan vs execute
   - Checklist before enabling any real execution
   - Troubleshooting common errors

4. **Delete docs/compliance.md** (out of scope for v0.1.0)

**Acceptance:**
- Each doc is concise (1-2 pages max)
- Real, useful content (no fluff)
- Technical but accessible

### Task 6: Polish README
**Goal:** README reads like a real internal tool

**Actions:**
1. Add "Public API" section:
   - Core exports: `allocate`, `validatePolicy`, `validateSnapshot`
   - Orchestrator export: `runOnce`
   - Clear function signatures and return types

2. Improve "Safety Model Summary" section
3. Add "Examples" section matching CLI usage
4. Enhance "Non-goals" section
5. Add "Versioning" section (semver)
6. Add repository metadata suggestions (topics, description)

**Acceptance:**
- README is clear, professional, complete
- Public API is documented
- Safety model is prominent

### Task 7: Release Hygiene
**Goal:** Versioning and changelog discipline

**Actions:**
1. Create `CHANGELOG.md` with v0.1.0 section
2. Add "Versioning" section to README (semver)
3. Document what's in v0.1.0 vs future

**Acceptance:**
- CHANGELOG.md exists and is structured
- Versioning policy is clear

### Task 8: Final Verification & Commit
**Goal:** Ensure all acceptance criteria pass

**Actions:**
1. Run full verification sequence:
   ```bash
   npm ci
   npm test
   npm run lint
   ```
2. Manually test CLI commands
3. Review all docs for quality
4. Commit with clear message
5. Push to branch: `chore/ledgerrun-fortune-500`

**Acceptance:**
- All criteria from "Non-negotiable acceptance criteria" pass
- Branch is ready for review

---

## Success Metrics

At completion, the following must all be true:

1. ✅ `npm ci && npm test && npm run lint` - All pass
2. ✅ GitHub Actions CI configured and passing
3. ✅ All safety invariants have test coverage
4. ✅ CLI has --help output
5. ✅ Documentation complete and professional
6. ✅ README has public API section
7. ✅ .gitignore prevents secret leaks
8. ✅ CHANGELOG.md exists
9. ✅ No build step needed (documented)

---

## What We Will NOT Do

Per Fortune-500 quality constraints:

- ❌ No TypeScript migration (repo is pure JS)
- ❌ No build step (library is runtime JS)
- ❌ No large frameworks (keep dependencies minimal)
- ❌ No real brokerage integration (mock only)
- ❌ No live trading features (paper-only)
- ❌ No secrets committed

---

## Estimated Scope

- **8 tasks** total
- **~15-20 files** to create/modify
- **~500-800 lines** of new tests
- **~300-400 lines** of documentation
- **Zero behavioral changes** to core logic (only additions)

---

## Next Steps

Execute tasks 1-8 sequentially, committing after each task completion.
