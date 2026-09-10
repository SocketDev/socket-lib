'use strict'

module.exports = {
  defaults(...args) {
    const { makeFetchHappen } = require('./npm-pack')
    return makeFetchHappen.defaults(...args)
  },
}
