'use strict'

// Re-export from npm-core bundle for better deduplication.
const { validateNpmPackageName } = require('./npm-core')
module.exports = validateNpmPackageName
