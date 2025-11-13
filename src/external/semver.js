'use strict'

// Re-export from npm-core bundle for better deduplication
const { semver } = require('./npm-core')
module.exports = semver
