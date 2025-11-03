// Export only what we use to reduce bundle size
const { parallelMap, transform } = require('streaming-iterables')

module.exports = {
  parallelMap,
  transform,
}
