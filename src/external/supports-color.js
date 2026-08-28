'use strict'

// Re-export from external-pack bundle for better deduplication.
const { supportsColor } = require('./external-pack')
// supports-color is an ESM module whose surface spans two levels: the default
// export holds the eagerly-computed { stdout, stderr } results, while the
// createSupportsColor factory sits on the namespace beside it. Both are copied
// across, because the per-stream factory is the only way to ask about a stream
// that is not one of the two standard ones.
const eager = supportsColor.default || supportsColor
Object.assign(module.exports, eager)
if (typeof supportsColor.createSupportsColor === 'function') {
  module.exports.createSupportsColor = supportsColor.createSupportsColor
}
module.exports.default = eager
