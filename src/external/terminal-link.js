'use strict'

// Lazy re-export from the external-pack bundle, so terminal-link shares ONE
// copy of supports-color / has-flag with the pack AND nothing loads its CJS
// dep chain until a hyperlink is actually rendered. See the getTerminalLink
// comment in ./external-pack.js for why eager loading broke src-context tests.
function terminalLink(text, url, options) {
  return require('./external-pack').getTerminalLink()(text, url, options)
}
Object.defineProperty(terminalLink, 'isSupported', {
  configurable: true,
  enumerable: true,
  get: () => require('./external-pack').getTerminalLink().isSupported,
})
Object.defineProperty(terminalLink, 'stderr', {
  configurable: true,
  enumerable: true,
  get: () => require('./external-pack').getTerminalLink().stderr,
})
module.exports = terminalLink
module.exports.default = terminalLink
