'use strict'

// pico-pack: Bundle picomatch, del, and fast-glob together.
// These packages all depend on picomatch for glob pattern matching.
// Bundling them together eliminates code duplication where picomatch
// is bundled separately within del (252KB) and fast-glob (200KB).

const picomatch = require('picomatch')
const { deleteAsync, deleteSync } = require('del')
const fastGlob = require('fast-glob')

// Re-create del structure.
const del = {
  deleteAsync,
  deleteSync,
}

// Re-create fast-glob structure.
const glob = fastGlob.globStream
  ? {
      glob: fastGlob,
      globStream: fastGlob.globStream,
      globSync: fastGlob.sync,
    }
  : fastGlob

module.exports = {
  del,
  glob,
  picomatch,
}
