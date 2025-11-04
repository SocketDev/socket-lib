'use strict'

// Export only what we use from libnpmexec to reduce bundle size
// libnpmexec provides the npm exec (npx) programmatic API

const getBinFromManifest = require('libnpmexec/lib/get-bin-from-manifest')

module.exports = {
  getBinFromManifest,
}
