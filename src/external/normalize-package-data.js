'use strict'

// Re-export from npm-core bundle for better deduplication
const { normalizePackageData } = require('./npm-core')
module.exports = normalizePackageData
