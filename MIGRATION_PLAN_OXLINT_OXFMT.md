# Migration Plan: ESLint → Oxlint & Biome → Oxfmt

## Executive Summary

This document outlines the migration from ESLint + Biome to Oxlint + Oxfmt for the socket-lib project.

**Key Benefits:**

- **Performance**: Oxlint is 50-100× faster than ESLint, Oxfmt is 30× faster than Prettier and 3× faster than Biome
- **Simplified toolchain**: Reduce from 2 tools to 2 Rust-based tools from same project (better integration)
- **Modern**: Built with Rust for speed, reliability, and modern JavaScript/TypeScript support
- **Migration support**: Both tools have automated migration commands

**Current State:**

- ESLint 9.35.0 with flat config (`.config/eslint.config.mjs`)
- Biome 2.2.4 for formatting and linting (`biome.json`)
- Complex ESLint setup with TypeScript, import, node, and unicorn plugins

## Phase 1: Oxfmt Migration (Formatter)

### Benefits of Migrating Formatter First

- Formatting is simpler to migrate (fewer edge cases)
- Provides quick win and confidence in Oxc tooling
- Allows validating output quality before tackling linting
- Oxfmt is stable and passes 100% of Prettier's conformance tests

### Step 1.1: Install Oxfmt

```bash
pnpm add -D oxfmt
```

### Step 1.2: Migrate Biome Config to Oxfmt

```bash
npx oxfmt --migrate biome
```

This will:

- Read `biome.json` formatter configuration
- Generate `.oxfmt.json` with equivalent settings
- Preserve formatting preferences (semicolons, quotes, line width, etc.)

### Step 1.3: Update package.json Scripts

**Before:**

```json
{
  "scripts": {
    "fix": "node scripts/lint.mjs --fix",
    "lint": "node scripts/lint.mjs"
  }
}
```

**After:**

```json
{
  "scripts": {
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "lint": "node scripts/lint.mjs"
  }
}
```

**Note**: Keep `scripts/lint.mjs` for now as it orchestrates multiple tools.

### Step 1.4: Update Build/Test Scripts

**Modify `scripts/lint.mjs`** to use oxfmt instead of Biome for formatting:

- Replace Biome format calls with `oxfmt` commands
- Keep Biome linting temporarily (will be replaced by Oxlint in Phase 2)
- Update progress messages

**Modify `scripts/test/main.mjs`** similarly.

### Step 1.5: Update CI Workflow

**File**: `.github/workflows/ci.yml`

Update the lint job to use oxfmt:

```yaml
- name: Format check
  run: pnpm run format:check
```

### Step 1.6: Update lint-staged (Husky)

**File**: `.husky/pre-commit` or `lint-staged` config

Replace Biome formatter with:

```json
{
  "*.{js,mjs,cjs,ts,mts,cts,json}": ["oxfmt --no-error-on-unmatched-pattern"]
}
```

### Step 1.7: Reformat Codebase

```bash
pnpm run format
```

Review changes carefully - Oxfmt output matches Prettier v3.8, may differ slightly from Biome.

### Step 1.8: Commit Formatting Changes

```bash
git add -A
git commit -m "chore: migrate from biome formatter to oxfmt

- Install oxfmt as dev dependency
- Migrate biome.json formatter config to .oxfmt.json
- Update scripts to use oxfmt for formatting
- Update CI workflow for oxfmt
- Update lint-staged/husky hooks
- Reformat entire codebase with oxfmt

Oxfmt is 30× faster than Prettier and 3× faster than Biome."
```

### Step 1.9: Update Documentation

- Update `CLAUDE.md` to reference oxfmt instead of Biome for formatting
- Update `CONTRIBUTING.md` if it mentions formatting tools
- Update VSCode/editor settings to use oxfmt extension if available

## Phase 2: Oxlint Migration (Linter)

### Challenges

- Complex ESLint config with multiple plugins
- TypeScript type-aware rules
- Custom rules for different file patterns (src/, test/, scripts/, .d.ts files)
- Need to maintain or replace plugin-specific rules

### Step 2.1: Audit Current ESLint Rules

Create a comprehensive list of:

1. All enabled ESLint rules from base config
2. TypeScript-specific rules (`@typescript-eslint/*`)
3. Plugin rules (`import-x/*`, `n/*`, `unicorn/*`, `sort-destructure-keys/*`)
4. File-specific overrides

Document which rules are:

- Critical (must have equivalents in Oxlint)
- Important (should have equivalents)
- Nice-to-have (can live without)

### Step 2.2: Install Oxlint

```bash
pnpm add -D oxlint
```

### Step 2.3: Generate Initial Oxlint Config

```bash
npx @oxlint/migrate --type-aware
```

This will:

- Read `.config/eslint.config.mjs` (ESLint flat config)
- Generate `.oxlintrc.json` with equivalent Oxlint rules
- Preserve file patterns and overrides
- Enable TypeScript type-aware rules
- Migrate ESLint plugins to continue working via Oxlint

**Note**: The `--type-aware` flag is important for preserving TypeScript rules that require type information.

### Step 2.4: Review Generated Config

**File**: `.oxlintrc.json`

Review and adjust:

1. Verify all critical rules were migrated
2. Check file pattern overrides match original intent
3. Validate TypeScript settings (tsconfig path, etc.)
4. Test that plugin rules are still available

### Step 2.5: Run Oxlint in Parallel

**Temporarily run both linters** to compare results:

```bash
# Run ESLint (current)
pnpm run lint

# Run Oxlint (new)
npx oxlint
```

Compare outputs and adjust `.oxlintrc.json` to match desired behavior.

### Step 2.6: Update Scripts

**Modify `scripts/lint.mjs`**:

- Replace ESLint calls with `oxlint` commands
- Remove Biome linting (already moved to oxfmt in Phase 1)
- Keep the orchestration structure for consistency

**Example change**:

```javascript
// Before
await runEslint()

// After
await runOxlint()
```

### Step 2.7: Update package.json Scripts

```json
{
  "scripts": {
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "lint": "node scripts/lint.mjs",
    "fix": "node scripts/lint.mjs --fix"
  }
}
```

### Step 2.8: Update CI Workflow

**File**: `.github/workflows/ci.yml`

The lint job should now run oxlint:

```yaml
- name: Lint
  run: pnpm run lint
```

### Step 2.9: Fix All Linting Issues

```bash
pnpm run lint
pnpm run fix  # Auto-fix what's possible
# Manually fix remaining issues
```

### Step 2.10: Remove ESLint Dependencies

Once oxlint is working correctly, remove ESLint and all plugins:

```bash
pnpm remove \
  eslint \
  @eslint/js \
  @eslint/compat \
  typescript-eslint \
  eslint-plugin-import-x \
  eslint-import-resolver-typescript \
  eslint-plugin-n \
  eslint-plugin-unicorn \
  eslint-plugin-sort-destructure-keys
```

### Step 2.11: Remove Biome

Since we've migrated both formatting and linting away from Biome:

```bash
pnpm remove @biomejs/biome
rm biome.json
```

### Step 2.12: Clean Up Config Files

- Remove `.config/eslint.config.mjs`
- Keep `.oxlintrc.json`
- Keep `.oxfmt.json`

### Step 2.13: Commit Linting Changes

```bash
git add -A
git commit -m "chore: migrate from eslint to oxlint

- Install oxlint as dev dependency
- Migrate eslint.config.mjs to .oxlintrc.json
- Update scripts to use oxlint for linting
- Update CI workflow for oxlint
- Remove eslint and all plugins
- Remove biome (formatting moved to oxfmt, linting to oxlint)

Oxlint is 50-100× faster than ESLint."
```

### Step 2.14: Update Documentation

- Update `CLAUDE.md` to reference oxlint instead of ESLint and Biome
- Update `CONTRIBUTING.md` if it mentions linting tools
- Update VSCode/editor settings to use oxlint extension

## Phase 3: Validation & Optimization

### Step 3.1: Full Test Suite

```bash
pnpm test
```

Ensure all tests pass with new tooling.

### Step 3.2: Verify CI Pipeline

Push changes and verify all CI jobs pass:

- Formatting check
- Linting
- Type checking
- Tests on all Node versions and platforms

### Step 3.3: Performance Benchmarking

Compare before/after times:

**Before (ESLint + Biome)**:

```bash
time pnpm run lint
time pnpm run format:check
```

**After (Oxlint + Oxfmt)**:

```bash
time pnpm run lint
time pnpm run format:check
```

Document improvements in commit message or changelog.

### Step 3.4: Team Alignment

- Announce migration in team channels
- Update editor setup guides
- Provide migration FAQ for team members

## Rollback Plan

If issues arise during migration:

### Rollback Oxfmt (Phase 1)

```bash
git revert <commit-hash>
pnpm remove oxfmt
pnpm install
```

Biome will handle formatting again.

### Rollback Oxlint (Phase 2)

```bash
git revert <commit-hash>
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-import-x eslint-plugin-n eslint-plugin-unicorn
pnpm install
```

ESLint config will be restored from git history.

## Risk Assessment

### Low Risk

- **Oxfmt migration**: Oxfmt is stable, passes 100% Prettier conformance tests
- **Automated migration**: Both tools have migration commands
- **Fast rollback**: Git makes reverting straightforward

### Medium Risk

- **Custom ESLint plugins**: May not have direct Oxlint equivalents
- **Plugin ecosystem**: Oxlint plugin support may differ from ESLint

### Mitigation

- Test thoroughly in CI before merging
- Run both linters in parallel during transition
- Keep detailed audit of rule mappings
- Maintain git history for easy rollback

## Timeline Estimate

**Phase 1 (Oxfmt)**: 2-4 hours

- Mostly automated migration
- Review formatting output
- Update scripts and CI

**Phase 2 (Oxlint)**: 4-8 hours

- More complex due to ESLint plugins
- Rule mapping and validation
- Fixing any new linting issues
- Updating scripts and CI

**Phase 3 (Validation)**: 2-4 hours

- Full test suite runs
- CI validation
- Documentation updates

**Total**: 8-16 hours (1-2 days of focused work)

## Success Criteria

1. ✅ All code is formatted consistently
2. ✅ All linting rules are enforced (or consciously relaxed)
3. ✅ CI pipeline passes all checks
4. ✅ All tests pass
5. ✅ Measurable performance improvement (aim for 10-50× faster)
6. ✅ Team can use new tools without friction
7. ✅ Documentation is updated

## References

- [Oxlint Migration Guide](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Oxlint Migrate Tool](https://github.com/oxc-project/oxlint-migrate)
- [Oxfmt Migration Guide](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html)
- [Oxfmt Beta Announcement](https://oxc.rs/blog/2026-02-24-oxfmt-beta)
- [Announcing Oxlint 1.0](https://voidzero.dev/posts/announcing-oxlint-1-stable)
- [Announcing Oxfmt Alpha](https://voidzero.dev/posts/announcing-oxfmt-alpha)
