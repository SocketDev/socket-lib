'use strict'

// Re-export from external-pack bundle for better deduplication.
const { checkbox } = require('../external-pack')
// Declare the named export for Node's CommonJS lexer before forwarding the namespace.
exports.Separator = checkbox.Separator
module.exports = checkbox
