'use strict'

// CJS re-implementation of supports-hyperlinks, which is ESM-only.
//
// It is the only reason terminal-link reaches supports-color, and bundled ESM
// hands back a namespace where a function is called. Rather than also stubbing
// supports-color, which is a far larger surface, this stubs the single consumer
// and answers the one question asked of it: does this terminal render OSC 8.
//
// Detection mirrors supports-hyperlinks: explicit env override first, then CI,
// whose logs never render links, then the terminals with known support.
const os = require('node:os')
const process = require('node:process')

function parseVersion(version) {
  // major, then optional .minor, then optional .patch — each captured, and each
  // absent group falls back to 0 below. Matches anywhere so a prefix like
  // "3.4.19beta" still yields 3.4.19.
  const parts = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version || '')
  if (!parts) {
    return { major: 0, minor: 0, patch: 0 }
  }
  return {
    major: Number(parts[1] || 0),
    minor: Number(parts[2] || 0),
    patch: Number(parts[3] || 0),
  }
}

function supported(stream) {
  const { env } = process
  const forced = env['FORCE_HYPERLINK']
  if (forced !== undefined && forced.length > 0) {
    return !(forced === '0' || forced.toLowerCase() === 'false')
  }
  if (env['NO_HYPERLINK'] !== undefined || env['DOMTERM']) {
    return Boolean(env['DOMTERM'])
  }
  // A non-TTY has no terminal to render the escape.
  if (stream && stream.isTTY === false) {
    return false
  }
  // CI logs render the escape as noise.
  if (env['CI']) {
    return false
  }
  if (env['WT_SESSION']) {
    return true
  }
  if (env['TERM_PROGRAM']) {
    const version = parseVersion(env['TERM_PROGRAM_VERSION'])
    switch (env['TERM_PROGRAM']) {
      case 'ghostty':
      case 'kitty':
      case 'rio':
      case 'WezTerm':
        return true
      case 'iTerm.app':
        return version.major > 3 || (version.major === 3 && version.minor >= 1)
      case 'vscode':
        return version.major > 1 || (version.major === 1 && version.minor >= 72)
      default:
        break
    }
  }
  if (env['VTE_VERSION']) {
    // 0.50.0 is where VTE gained OSC 8; 0.50.0 exactly is excluded upstream.
    if (env['VTE_VERSION'] === '0.50.0') {
      return false
    }
    const version = parseVersion(env['VTE_VERSION'])
    return version.major > 0 || version.minor >= 50
  }
  if (os.platform() === 'win32') {
    const release = parseVersion(os.release())
    return release.major >= 10 && release.patch >= 14_393
  }
  return false
}

// `stdout`/`stderr` are lazy getters, not values: touching a stream at module
// eval captures a TTY handle on import, which is slow and not snapshot-safe.
// Callers read these as properties, so a getter is a drop-in.
module.exports = { supportsHyperlink: supported }
Object.defineProperty(module.exports, 'stdout', {
  configurable: true,
  enumerable: true,
  get: () => supported(process.stdout),
})
Object.defineProperty(module.exports, 'stderr', {
  configurable: true,
  enumerable: true,
  get: () => supported(process.stderr),
})
module.exports.default = module.exports
