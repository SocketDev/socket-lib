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
  jsPlugins: ['./oxlint-plugin/index.mts'],
  rules: {
    'socket-repo/no-inline-lazy-node-getter': 'error',
  },
})
