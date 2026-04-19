/**
 * Arborist IsolatedReifier mixin stub.
 *
 * arborist/index.js composes the Arborist class via:
 *   const Base = mixins.reduce((a, b) => b(a), require('node:events'))
 * where `mixins` includes `require('./isolated-reifier.js')`.
 *
 * The isolated reifier only runs when `options.installStrategy === 'linked'`
 * (reify.js:118). We never pass that flag, so the `_createIsolatedTree`
 * symbol method added by this mixin is never called.
 *
 * Identity-mixin stub: returns the class unchanged. Preserves the
 * `mixins.reduce(...)` chain without adding the isolated-reifier
 * methods to the prototype.
 */
'use strict'

module.exports = cls => cls
