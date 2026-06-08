/**
 * @file Socket-lib repo-local oxlint plugin. Rules that encode conventions
 *   specific to socket-lib's own module shape (not fleet-canonical, so not in
 *   `.config/fleet/oxlint-plugin/`). Wiring: `.config/repo/oxlintrc.json`
 *   extends the fleet config, adds this plugin to `jsPlugins`, and enables its
 *   rules under the `socket-repo/` namespace.
 */

import noInlineLazyNodeGetter from './rules/no-inline-lazy-node-getter.mts'

const plugin = {
  meta: {
    name: 'socket-repo',
  },
  rules: {
    'no-inline-lazy-node-getter': noInlineLazyNodeGetter,
  },
}

// oxlint-disable-next-line socket/no-default-export -- oxlint jsPlugins contract requires a default-exported plugin object.
export default plugin
