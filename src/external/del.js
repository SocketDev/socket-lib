'use strict'

// Export only what we use to reduce bundle size
const { deleteAsync, deleteSync } = require('del')

module.exports = {
  deleteAsync,
  deleteSync,
}
