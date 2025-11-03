// Export only what we use to reduce bundle size
const fastGlob = require('fast-glob')

// Export just globStream - the only method we use
module.exports = fastGlob.globStream
  ? { globStream: fastGlob.globStream }
  : fastGlob
