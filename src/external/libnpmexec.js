// Export only what we use from libnpmexec to reduce bundle size
// libnpmexec provides the npm exec (npx) programmatic API

/**
 * Get the binary name to execute from a package manifest.
 * Cherry-picked from libnpmexec@10.1.8/lib/get-bin-from-manifest.js
 * https://github.com/npm/cli/blob/latest/workspaces/libnpmexec/lib/get-bin-from-manifest.js
 *
 * Uses npm's bin resolution strategy:
 * 1. If all bin values are identical (aliases), use first key
 * 2. Try unscoped package name (e.g., 'cli' from '@scope/cli')
 * 3. Throw error if cannot determine
 *
 * @param {Object} mani - Package manifest (package.json contents)
 * @param {string} mani.name - Package name
 * @param {string|Object} [mani.bin] - Binary definitions
 * @param {string} [mani._id] - Package ID for error messages
 * @returns {string} Binary name to execute
 * @throws {Error} If binary cannot be determined
 */
const getBinFromManifest = mani => {
  // if we have a bin matching (unscoped portion of) packagename, use that
  // otherwise if there's 1 bin or all bin value is the same (alias), use
  // that; otherwise, fail
  const bin = mani.bin || {}
  if (new Set(Object.values(bin)).size === 1) {
    return Object.keys(bin)[0]
  }

  // XXX probably a util to parse this better?
  const name = mani.name.replace(/^@[^/]+\//, '')
  if (bin[name]) {
    return name
  }

  // XXX need better error message
  throw Object.assign(new Error('could not determine executable to run'), {
    pkgid: mani._id,
  })
}

module.exports = {
  getBinFromManifest,
}
