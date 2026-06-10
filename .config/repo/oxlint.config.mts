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
  },
})
