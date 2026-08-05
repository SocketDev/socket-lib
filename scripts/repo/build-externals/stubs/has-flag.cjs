'use strict'

// CJS re-implementation of has-flag v5, which is ESM-only.
//
// Bundled, `require('has-flag')` hands back the module NAMESPACE, so
// supports-color calls an object and dies on "hasFlag is not a function". That
// only became reachable once terminal-link joined external-pack and created the
// first supports-hyperlinks -> supports-color -> has-flag edge inside the
// bundle. Swapping the source for real CJS fixes it where it happens, instead
// of unwrapping .default at each consumer.
//
// Behavior matches has-flag v5 exactly, including the `--` terminator rule.
module.exports = function hasFlag(flag, argv = process.argv) {
  const prefix = flag.startsWith('-') ? '' : flag.length === 1 ? '-' : '--'
  const position = argv.indexOf(prefix + flag)
  const terminatorPosition = argv.indexOf('--')
  return (
    position !== -1 &&
    (terminatorPosition === -1 || position < terminatorPosition)
  )
}
