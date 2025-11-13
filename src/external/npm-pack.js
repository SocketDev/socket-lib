'use strict'

// npm-pack: Bundle arborist, cacache, libnpmpack, make-fetch-happen, and pacote together
// These packages work together for npm package fetching, caching, and packing

const { get: pacoteFetcherGet } = require('pacote/lib/fetcher.js')
const libnpmpack = require('libnpmpack/lib/index.js')
const cacacheGet = require('cacache/lib/get.js')
const cacachePut = require('cacache/lib/put.js')
const cacacheRm = require('cacache/lib/rm.js')
const { lsStream } = require('cacache/lib/entry-index.js')
const cacacheTmp = require('cacache/lib/util/tmp.js')
const makeFetchHappen = require('make-fetch-happen/lib/index.js')
const Arborist = require('@npmcli/arborist/lib/arborist/index.js')

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
  pacote,
  libnpmpack,
  cacache,
  makeFetchHappen: { defaults: makeFetchHappen.defaults },
}
