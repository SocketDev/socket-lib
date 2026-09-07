'use strict'

// Re-export from external-pack bundle for better deduplication.
const { search } = require('../external-pack')
// Declare the named export for Node's CommonJS lexer before forwarding the namespace.
exports.Separator = search.Separator
module.exports = search
