'use strict'

function defineLazyExport(name, load) {
  Object.defineProperty(module.exports, name, {
    configurable: true,
    enumerable: true,
    get: load,
    set(value) {
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      })
    },
  })
}

defineLazyExport(
  'Arborist',
  () =>
    (module.exports.Arborist = require('@npmcli/arborist/lib/arborist/index.js')),
)
defineLazyExport('cacache', () => {
  const cacacheRm = require('cacache/lib/rm.js')
  return (module.exports.cacache = {
    get: require('cacache/lib/get.js'),
    ls: { stream: require('cacache/lib/entry-index.js').lsStream },
    put: require('cacache/lib/put.js'),
    rm: { entry: cacacheRm.entry, all: cacacheRm.all },
    tmp: { withTmp: require('cacache/lib/util/tmp.js').withTmp },
  })
})
defineLazyExport(
  'libnpmpack',
  () => (module.exports.libnpmpack = require('libnpmpack/lib/index.js')),
)
defineLazyExport(
  'makeFetchHappen',
  () =>
    (module.exports.makeFetchHappen = {
      defaults: require('make-fetch-happen/lib/index.js').defaults,
    }),
)
defineLazyExport(
  'normalizePackageData',
  () =>
    (module.exports.normalizePackageData = require('normalize-package-data/lib/normalize.js')),
)
defineLazyExport(
  'npmPackageArg',
  () => (module.exports.npmPackageArg = require('npm-package-arg/lib/npa.js')),
)
defineLazyExport('pacote', () => {
  const pacoteIndex = require('pacote/lib/index.js')
  const { get: pacoteFetcherGet } = require('pacote/lib/fetcher.js')
  return (module.exports.pacote = {
    extract: (spec, dest, opts) => pacoteFetcherGet(spec, opts).extract(dest),
    manifest: pacoteIndex.manifest,
    packument: pacoteIndex.packument,
    tarball: pacoteIndex.tarball,
  })
})
defineLazyExport('semver', () => (module.exports.semver = require('semver')))
defineLazyExport(
  'validateNpmPackageName',
  () =>
    (module.exports.validateNpmPackageName = require('validate-npm-package-name')),
)
