'use strict'

// Export only what we use to reduce bundle size
const fastGlob = require('fast-glob')

// Export the methods we use
module.exports = fastGlob.globStream
  ? {
      glob: fastGlob,
      globStream: fastGlob.globStream,
      globSync: fastGlob.sync,
    }
  : fastGlob
