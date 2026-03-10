# Migration Plan: ESLint → Oxlint & Biome → Oxfmt

## Executive Summary

This document provides a comprehensive migration plan for replacing ESLint with oxlint and Biome with oxfmt in the socket-lib project. The migration has already been **partially completed** - configuration files exist and the tools are installed.

**Key Benefits:**

- Performance: Oxlint is 50-100x faster than ESLint
- Performance: Oxfmt is 30x faster than Prettier and 3x faster than Biome
- Simplified toolchain: Both tools are from the Oxc project (Rust-based)
- Modern: Built with Rust for speed, reliability, and modern JavaScript/TypeScript support
- Migration support: Both tools have automated migration commands

**Current State (as of migration plan):**

- ✅ Oxlint 1.52.0 installed
- ✅ Oxfmt 0.37.0 installed
- ✅ `.oxlintrc.json` configuration exists (312 lines)
- ✅ `.oxfmtrc.json` configuration exists (38 lines)
- ✅ `scripts/lint.mjs` already uses oxlint and oxfmt
- ✅ `package.json` scripts already configured
- ❌ Old ESLint config files may still exist
- ❌ Old Biome config files may still exist
- ❌ Documentation needs updating
- ❌ CI workflow references need updating (if any)

## Phase 0: Pre-Migration Audit

### Current Tool Analysis

**Oxlint CLI Capabilities:**

- `--init` - Initialize oxlint configuration with default values
- `--config` - Specify custom config file path
- `--fix` - Auto-fix issues
- `--fix-suggestions` - Apply auto-fixable suggestions
- `--fix-dangerously` - Apply dangerous fixes
- `--import-plugin`, `--react-plugin`, `--typescript-plugin`, etc. - Enable specific plugins
- `--type-aware` - Enable rules that require type information
- `--rules` - List all registered rules

**Oxfmt CLI Capabilities:**

- `--init` - Initialize `.oxfmtrc.json` with defaults
- `--migrate=SOURCE` - Migrate from prettier or biome
- `--write` - Format and write files in place (default)
- `--check` - Check if files are formatted
- `--stdin-filepath=PATH` - Specify file name for stdin

**Migration Tools:**

- `@oxlint/migrate` - Generates `.oxlintrc.json` from ESLint flat config
  - Supports `--type-aware` flag for TypeScript type-aware rules
  - Supports `--js-plugins` to preserve ESLint plugins via jsPlugins key
  - Supports `--replace-eslint-comments` to convert inline comments
  - Supports `--details` to list unmigrated rules

### Step 0.1: Verify Current Configuration

✅ **Configuration files exist:**

- `.oxlintrc.json` - 312 lines with comprehensive rules
- `.oxfmtrc.json` - 38 lines with formatting preferences

✅ **Key configuration highlights:**

**Oxlint config:**

- Plugins enabled: import, node, unicorn, typescript
- Categories: correctness disabled (rules configured individually)
- Environment: ES2026, Node.js builtins
- 167+ individual rules configured
- File-specific overrides for TypeScript, declaration files, tests, and scripts
- Uses `jsPlugins` for `eslint-plugin-sort-destructure-keys`
- Extensive ignore patterns for build artifacts, node_modules, etc.

**Oxfmt config:**

- Single quotes, no semicolons
- 2-space indentation
- 80 character print width
- Trailing commas always
- Arrow parens avoided when possible
- Extensive ignore patterns matching oxlint

### Step 0.2: Check for Old Configuration Files

Run these commands to find any remaining old config files:

```bash
# Check for ESLint configs
find . -name ".eslintrc*" -not -path "*/node_modules/*" -not -path "*/.git/*"
find . -name "eslint.config.*" -not -path "*/node_modules/*" -not -path "*/.git/*"

# Check for Biome configs
find . -name "biome.json" -not -path "*/node_modules/*"
```

### Step 0.3: Review Current Scripts

✅ **`scripts/lint.mjs` already configured:**

- Uses `pnpm exec oxfmt --check` for formatting checks
- Uses `pnpm exec oxlint` for linting
- Supports `--fix` flag for both tools
- Smart file filtering based on git changes
- Reads `.oxfmtrc.json` for exclude patterns

✅ **`package.json` scripts already configured:**

```json
{
  "fix": "node scripts/lint.mjs --fix",
  "format": "oxfmt",
  "format:check": "oxfmt --check",
  "lint": "node scripts/lint.mjs",
  "lint:oxlint": "oxlint .",
  "lint:oxfmt": "oxfmt --check ."
}
```

## Phase 1: Clean Up Old Tools

Since oxlint and oxfmt are already configured and working, the main task is removing the old tools and their configurations.

### Step 1.1: Identify Old Dependencies

Check if these are still installed:

```bash
pnpm list | grep -E "(eslint|biome)"
```

Expected old dependencies to remove:

- `eslint`
- `@eslint/js`
- `@eslint/compat`
- `typescript-eslint`
- `eslint-plugin-import-x`
- `eslint-import-resolver-typescript`
- `eslint-plugin-n`
- `eslint-plugin-unicorn`
- `eslint-plugin-sort-destructure-keys` (still needed for oxlint jsPlugins)
- `@biomejs/biome`

**Note:** Keep `eslint-plugin-sort-destructure-keys` as it's used via oxlint's jsPlugins feature.

### Step 1.2: Remove Old Dependencies

```bash
# Remove ESLint and plugins (keep eslint-plugin-sort-destructure-keys)
pnpm remove \
  eslint \
  @eslint/js \
  @eslint/compat \
  typescript-eslint \
  eslint-plugin-import-x \
  eslint-import-resolver-typescript \
  eslint-plugin-n \
  eslint-plugin-unicorn

# Remove Biome
pnpm remove @biomejs/biome
```

### Step 1.3: Remove Old Configuration Files

```bash
# Remove ESLint config (if exists)
rm -f .eslintrc.js .eslintrc.json .eslintrc.cjs .eslintrc.yml .eslintrc.yaml
rm -f eslint.config.js eslint.config.mjs eslint.config.cjs
rm -rf .config/eslint.config.mjs

# Remove Biome config (if exists)
rm -f biome.json

# Remove ESLint ignore file (if exists)
rm -f .eslintignore
```

### Step 1.4: Update Git Hooks

✅ **Git hooks already configured correctly:**

**`.husky/pre-commit`:**

```bash
pnpm lint --staged
```

This already uses the new `scripts/lint.mjs` which runs oxlint and oxfmt.

No changes needed, but verify it works:

```bash
# Test the pre-commit hook
git add -A
git commit --no-verify -m "test: verify pre-commit hook"
git reset HEAD~1
```

### Step 1.5: Update CI/CD

**File:** `.github/workflows/ci.yml`

Current CI configuration uses reusable workflow from socket-registry:

```yaml
jobs:
  ci:
    name: Run CI Pipeline
    uses: SocketDev/socket-registry/.github/workflows/ci.yml@67a3db92603c23c58031586611c7cc852244c87c
    with:
      lint-script: 'pnpm run lint --all'
```

✅ **Already correct!** The `lint-script` calls `pnpm run lint --all`, which uses the new `scripts/lint.mjs` that runs oxlint and oxfmt.

**Verify CI works:**

1. Push changes to a branch
2. Observe CI runs successfully
3. Check lint job completes without errors

## Phase 2: Documentation Updates

### Step 2.1: Update CLAUDE.md

Update the lib-specific sections in CLAUDE.md:

**Section: "Commands"**

- No changes needed - commands already reference generic `pnpm run lint` and `pnpm run fix`

**Section: "Code Style - Lib-Specific"**
Update to mention oxlint instead of ESLint/Biome:

```markdown
### Linting & Formatting

- **Linter**: oxlint (Rust-based, 50-100x faster than ESLint)
- **Formatter**: oxfmt (Rust-based, 30x faster than Prettier)
- **Config files**: `.oxlintrc.json`, `.oxfmtrc.json`
- **Run checks**: `pnpm run lint` (checks both formatting and linting)
- **Auto-fix**: `pnpm run fix` (auto-fixes issues)
```

### Step 2.2: Update VSCode Settings (Optional)

**File:** `.vscode/settings.json`

Currently minimal - could add oxlint/oxfmt extensions if available:

```json
{
  "cSpell.words": [
    "browserlist",
    "dirents",
    "extensionless",
    "hyrious",
    "socketregistry"
  ],
  "editor.trimAutoWhitespace": true,
  "files.trimTrailingWhitespaceInRegexAndStrings": true,
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "source.fixAll": false
  }
}
```

**Note:** As of early 2026, oxlint and oxfmt VSCode extensions may not be available yet. Check:

- https://marketplace.visualstudio.com/search?term=oxlint
- https://marketplace.visualstudio.com/search?term=oxfmt

### Step 2.3: Update README (if exists)

If there's a development setup section in README.md, update it to mention:

- Oxlint for linting
- Oxfmt for formatting
- Refer to CLAUDE.md for detailed development guidelines

## Phase 3: Validation & Testing

### Step 3.1: Full Lint Check

Run a complete lint check on the entire codebase:

```bash
# Check formatting
pnpm run format:check

# Check linting
pnpm run lint:oxlint

# Or run both via unified script
pnpm run lint --all
```

Fix any issues found:

```bash
pnpm run fix
```

### Step 3.2: Test Suite

Ensure all tests pass:

```bash
pnpm test
```

### Step 3.3: Type Checking

Verify TypeScript types:

```bash
pnpm run check
```

### Step 3.4: Full Build

Run a complete build:

```bash
pnpm run clean
pnpm run build
```

### Step 3.5: Performance Benchmarking

Compare lint performance before and after (if old tools still installed):

```bash
# Oxlint + Oxfmt (new)
time pnpm run lint --all

# Document the results
```

Expected results:

- Oxlint: ~100-500ms for full codebase
- Oxfmt: ~50-200ms for full codebase
- Total: Sub-second linting for most changes

### Step 3.6: CI Validation

Push changes and verify CI pipeline:

```bash
# Create a test branch
git checkout -b test/verify-oxlint-oxfmt

# Commit changes
git add -A
git commit -m "chore: complete migration to oxlint and oxfmt"

# Push and observe CI
git push -u origin test/verify-oxlint-oxfmt
```

**Verify:**

1. ✅ Lint job passes
2. ✅ Test jobs pass on all platforms (Ubuntu, Windows)
3. ✅ Test jobs pass on all Node versions (22, 24)
4. ✅ Type check passes
5. ✅ Build completes successfully

## Phase 4: Finalization

### Step 4.1: Create Migration Commit

Once everything is validated, create a clean commit:

```bash
git add -A
git commit -m "chore: complete migration to oxlint and oxfmt

- Remove ESLint and all plugins (except sort-destructure-keys for jsPlugins)
- Remove Biome formatter/linter
- Update documentation to reference oxlint/oxfmt
- Verify all CI checks pass with new tooling

Performance improvements:
- Linting: 50-100x faster than ESLint
- Formatting: 30x faster than Prettier, 3x faster than Biome
- Total lint time: ~100-500ms for full codebase

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 4.2: Update Changelog (Optional)

Add an entry to CHANGELOG.md:

```markdown
## [Unreleased]

### Changed

- Migrated from ESLint to oxlint (50-100x performance improvement)
- Migrated from Biome to oxfmt (3x performance improvement)
- Simplified tooling stack to Oxc project tools
```

### Step 4.3: Team Communication

Announce the migration:

**Example message:**

> We've completed the migration from ESLint + Biome to oxlint + oxfmt! 🚀
>
> **What changed:**
>
> - Linting is now 50-100x faster
> - Formatting is now 3x faster
> - Same commands: `pnpm lint`, `pnpm fix`, `pnpm format`
> - Git hooks work the same way
>
> **What you need to do:**
>
> - Run `pnpm install` to update dependencies
> - No other changes needed!
> - Editor extensions for oxlint/oxfmt may not be available yet

## Troubleshooting

### Issue: Oxlint reports errors not seen by ESLint

**Solution:** Review the specific rule and either:

1. Fix the code (oxlint may have caught a real issue)
2. Disable the rule in `.oxlintrc.json` if it's too strict
3. Add an inline comment: `// oxlint-disable-next-line rule-name`

### Issue: Oxfmt formatting differs from Biome

**Solution:**

1. Oxfmt aims for Prettier 3.8 compatibility, not Biome compatibility
2. Review the differences - oxfmt formatting is generally good
3. If specific formatting is critical, adjust `.oxfmtrc.json` settings
4. Reformat entire codebase: `pnpm run format`

### Issue: `eslint-plugin-sort-destructure-keys` not working

**Solution:**

1. Ensure the plugin is still installed: `pnpm list eslint-plugin-sort-destructure-keys`
2. Verify `.oxlintrc.json` has `"jsPlugins": ["eslint-plugin-sort-destructure-keys"]`
3. Check the rule is enabled: `"sort-destructure-keys/sort-destructure-keys": "error"`

### Issue: Type-aware rules not working

**Solution:**

1. Ensure `.oxlintrc.json` has TypeScript plugin enabled
2. Run oxlint with type-aware flag: `oxlint --type-aware .`
3. Verify `tsconfig.json` path is correct in config

### Issue: CI failing with "oxlint not found"

**Solution:**

1. Ensure `oxlint` and `oxfmt` are in `devDependencies` in `package.json`
2. Verify `pnpm install` runs before lint step in CI
3. Check cache is not stale - clear CI cache if needed

## Rollback Plan

If critical issues arise and rollback is needed:

### Rollback Step 1: Reinstall Old Tools

```bash
# Reinstall ESLint and plugins
pnpm add -D \
  eslint@^9.0.0 \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-import-x \
  eslint-plugin-n \
  eslint-plugin-unicorn

# Reinstall Biome
pnpm add -D @biomejs/biome@^2.0.0
```

### Rollback Step 2: Restore Old Configs

```bash
# Restore from git history
git checkout HEAD~1 -- .config/eslint.config.mjs
git checkout HEAD~1 -- biome.json
```

### Rollback Step 3: Revert Scripts

```bash
# Revert scripts/lint.mjs changes
git checkout HEAD~1 -- scripts/lint.mjs

# Or revert the entire commit
git revert HEAD
```

### Rollback Step 4: Run Tests

```bash
pnpm install
pnpm run lint --all
pnpm test
```

## Risk Assessment

### Low Risk ✅

- **Configuration already exists:** Migration is mostly cleanup
- **Scripts already updated:** Main orchestration is done
- **Automated migration available:** `@oxlint/migrate` handles complexity
- **Fast rollback:** Git makes reverting straightforward
- **Comprehensive config:** 312-line `.oxlintrc.json` with extensive rules

### Medium Risk ⚠️

- **Plugin ecosystem:** oxlint's jsPlugins feature is newer, may have edge cases
- **Type-aware rules:** Some TypeScript rules may behave differently
- **Editor support:** VSCode extensions may not be as mature as ESLint

### Mitigation ✅

- ✅ Run parallel testing before removing old tools
- ✅ Extensive ignore patterns already configured
- ✅ File-specific overrides already configured
- ✅ Test on CI before merging
- ✅ Keep detailed documentation of changes

## Success Criteria

1. ✅ All old ESLint dependencies removed (except sort-destructure-keys)
2. ✅ All old Biome dependencies removed
3. ✅ Old configuration files removed
4. ✅ All code passes oxlint checks
5. ✅ All code passes oxfmt checks
6. ✅ All tests pass
7. ✅ CI pipeline passes all checks
8. ✅ Performance improvement measured (aim for 10-50x faster)
9. ✅ Documentation updated
10. ✅ Team notified and trained

## Timeline Estimate

Given that configuration and scripts are already complete:

**Phase 1 (Cleanup)**: 1-2 hours

- Remove old dependencies
- Remove old config files
- Verify git hooks and CI

**Phase 2 (Documentation)**: 1-2 hours

- Update CLAUDE.md
- Update other documentation
- Create team announcement

**Phase 3 (Validation)**: 1-2 hours

- Full lint and test suite
- CI validation
- Performance benchmarking

**Phase 4 (Finalization)**: 1 hour

- Create clean commit
- Update changelog
- Team communication

**Total**: 4-7 hours (less than 1 day of focused work)

**Actual time may be shorter** since most configuration is done.

## Key Configuration Details

### Oxlint Configuration Highlights

**From `.oxlintrc.json`:**

```json
{
  "plugins": ["import", "node", "unicorn"],
  "categories": {
    "correctness": "off" // Rules configured individually
  },
  "env": {
    "builtin": true,
    "es2026": true
  },
  "rules": {
    // 167+ rules configured
    "no-debugger": "error",
    "no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_|^this$",
        "ignoreRestSiblings": true,
        "varsIgnorePattern": "^_"
      }
    ]
    // ... many more
  },
  "jsPlugins": ["eslint-plugin-sort-destructure-keys"],
  "overrides": [
    {
      "files": ["**/*.{cts,mts,ts}"],
      "rules": {
        /* TypeScript-specific rules */
      },
      "plugins": ["typescript"]
    },
    {
      "files": ["**/*.d.{cts,mts,ts}"],
      "rules": { "no-unused-vars": "off" }
    },
    {
      "files": ["test/**/*.ts", "test/**/*.mts", "test/**/*.mjs"],
      "rules": {
        /* Test-specific rules */
      }
    }
  ]
}
```

### Oxfmt Configuration Highlights

**From `.oxfmtrc.json`:**

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "arrowParens": "avoid"
}
```

## References

- [Oxlint Migration Guide](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Oxlint-Migrate Tool](https://github.com/oxc-project/oxlint-migrate)
- [Oxfmt Documentation](https://oxc.rs/docs/guide/usage/formatter)
- [Announcing Oxlint 1.0](https://voidzero.dev/posts/announcing-oxlint-1-stable)
- [Oxc Project](https://oxc.rs/)

---

**Migration Status:** 🟡 **In Progress** (Configuration complete, cleanup pending)

**Next Steps:** Execute Phase 1 to remove old tools and dependencies.
