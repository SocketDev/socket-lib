/**
 * @file Socket-lib repo oxlint config. Imports the fleet factory and augments
 *   it in JS with socket-lib's repo-local plugin + rule. See
 *   `.config/fleet/oxlint.config.mts` for why this is a factory call rather
 *   than oxlint `extends` (extends drops plugins/categories/ignorePatterns and
 *   mis-roots relative globs). `config()` returns the full fleet config with
 *   the fleet plugin's jsPlugins path already resolved absolute; this adds the
 *   repo plugin (relative to THIS file, which is where oxlint loads the merged
 *   object) and activates the repo rule under the `socket-repo/` namespace.
 */

import { config } from '../fleet/oxlint.config.mts'

export default config({
  // The active plugin is the one-dir-per-rule tree at `.config/oxlint-plugin/`
  // (cascading in). A pre-migration flat tree still lingers at
  // `.config/fleet/oxlint-plugin/` — its rule sources + test fixtures contain
  // the bad patterns each rule detects by design, so linting them self-flags.
  // Ignore it until the upstream migration removes the stale tree (the fleet
  // factory already ignores `**/.config/oxlint-plugin/**`).
  ignorePatterns: ['**/.config/fleet/oxlint-plugin/**'],
  jsPlugins: ['./oxlint-plugin/index.mts'],
  rules: {
    'socket-repo/no-inline-lazy-node-getter': 'error',
    // Brand-new socket/* rules from the plugin cascade: each surfaced a
    // pre-existing debt pile the whole-tree autofix could not clear
    // (param renames + Promise.allSettled refactors need review). Staged
    // OFF per the fleet "surface the cleanup as a separate task" doctrine;
    // the lint-modernization campaign owns the burn-down. Delete entries
    // as each rule reaches zero findings.
    'socket/bag-param-optionality-naming': 'off',
    'socket/no-deprecation': 'off',
    'socket/no-sync-rm-in-test-lifecycle': 'off',
    'socket/options-param-naming': 'off',
    'socket/prefer-all-settled': 'off',
    // The `--type-aware` tsgolint lane the fleet lint runner's whole-tree
    // gate turned on is staged OFF rule-by-rule here, mirroring the
    // socket-sdk-js / socket-registry adoption overlays. First enforcement
    // surfaced ~1.6k pre-existing findings, concentrated in test `as` casts
    // and mock-method references. Burn the debt down rule-by-rule, deleting
    // entries here as each rule reaches zero findings — the fleet
    // lint-modernization campaign owns the sweep. Repo-specific, so it lives
    // in `.config/repo/`, NOT the cascaded fleet config.
    'typescript/await-thenable': 'off',
    'typescript/consistent-return': 'off',
    'typescript/no-base-to-string': 'off',
    'typescript/no-floating-promises': 'off',
    'typescript/no-misused-spread': 'off',
    'typescript/no-unnecessary-boolean-literal-compare': 'off',
    'typescript/no-unnecessary-type-arguments': 'off',
    'typescript/no-unnecessary-type-assertion': 'off',
    'typescript/no-unnecessary-type-conversion': 'off',
    'typescript/no-unnecessary-type-parameters': 'off',
    'typescript/no-unsafe-type-assertion': 'off',
    'typescript/require-array-sort-compare': 'off',
    'typescript/restrict-template-expressions': 'off',
    'typescript/unbound-method': 'off',
  },
})
