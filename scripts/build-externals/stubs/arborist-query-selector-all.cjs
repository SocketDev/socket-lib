/**
 * Arborist query-selector-all stub.
 *
 * arborist/lib/node.js adds a `querySelectorAll` method to Node that
 * delegates to this module. The method is part of arb.query()'s public
 * API — a CSS-selector-style query over the dependency tree that we
 * never call.
 *
 * Stub throws if invoked so accidental callers get a clear message.
 * Drops @npmcli/query + postcss-selector-parser (already stubbed) from
 * the bundle's reach via this entry.
 */
'use strict'

module.exports = () => {
  throw new Error(
    'socket-lib bundle: Node.querySelectorAll is stubbed — arb.query() is not supported.',
  )
}
