'use strict'

// Re-export from external-pack bundle for better deduplication.
const { select } = require('../external-pack')
// Declare the named export for Node's CommonJS lexer before forwarding the namespace.
exports.Separator = select.Separator
module.exports = select
