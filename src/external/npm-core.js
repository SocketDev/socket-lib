'use strict'

// npm-core: Bundle npm-package-arg, normalize-package-data, and semver together
// These packages share dependencies and are commonly used together for package spec parsing

const npmPackageArg = require('npm-package-arg/lib/npa.js')
const normalizePackageData = require('normalize-package-data/lib/normalize.js')
const semver = require('semver')

module.exports = {
  npmPackageArg,
  normalizePackageData,
  semver,
}
