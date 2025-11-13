'use strict'

// Re-export from npm-core bundle for better deduplication
const { npmPackageArg } = require('./npm-core')
module.exports = npmPackageArg
