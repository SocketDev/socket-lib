'use strict'

// npm-pack: Bundle npm package utilities together.
// Includes: arborist, cacache, libnpmpack, make-fetch-happen, pacote,
// npm-package-arg, normalize-package-data, semver, validate-npm-package-name.

const { get: pacoteFetcherGet } = require('pacote/lib/fetcher.js')
const libnpmpack = require('libnpmpack/lib/index.js')
const cacacheGet = require('cacache/lib/get.js')
const cacachePut = require('cacache/lib/put.js')
const cacacheRm = require('cacache/lib/rm.js')
const { lsStream } = require('cacache/lib/entry-index.js')
const cacacheTmp = require('cacache/lib/util/tmp.js')
const makeFetchHappen = require('make-fetch-happen/lib/index.js')
const Arborist = require('@npmcli/arborist/lib/arborist/index.js')

// From npm-core (consolidated).
const npmPackageArg = require('npm-package-arg/lib/npa.js')
const normalizePackageData = require('normalize-package-data/lib/normalize.js')
const semver = require('semver')
const validateNpmPackageName = require('validate-npm-package-name')

// Re-create pacote.extract wrapper
const pacote = {
  extract: (spec, dest, opts) => pacoteFetcherGet(spec, opts).extract(dest),
}

// Re-create cacache structure
const cacache = {
  get: cacacheGet,
  put: cacachePut,
  rm: {
    entry: cacacheRm.entry,
    all: cacacheRm.all,
  },
  ls: {
    stream: lsStream,
  },
  tmp: {
    withTmp: cacacheTmp.withTmp,
  },
}

module.exports = {
  Arborist,
  cacache,
  libnpmpack,
  makeFetchHappen: { defaults: makeFetchHappen.defaults },
  normalizePackageData,
  npmPackageArg,
  pacote,
  semver,
  validateNpmPackageName,
}
