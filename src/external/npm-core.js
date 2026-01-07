'use strict'

// npm-core: Bundle npm-package-arg, normalize-package-data, semver, and validate-npm-package-name together.
// These packages share dependencies and are commonly used together for package spec parsing.

const npmPackageArg = require('npm-package-arg/lib/npa.js')
const normalizePackageData = require('normalize-package-data/lib/normalize.js')
const semver = require('semver')
const validateNpmPackageName = require('validate-npm-package-name')

module.exports = {
  npmPackageArg,
  normalizePackageData,
  semver,
  validateNpmPackageName,
}
