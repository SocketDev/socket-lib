'use strict'

// Re-export from the external-pack bundle so terminal-link shares ONE copy of
// supports-color and has-flag with the rest of the pack.
const { terminalLink } = require('./external-pack')

const exported = terminalLink.default || terminalLink
module.exports = exported
module.exports.default = exported
