/**
 * @fileoverview Default Node.js version range for packages.
 */

const { maintainedNodeVersions } = require('#lib/maintained-node-versions')
const semver = require('./external/semver')

const packageDefaultNodeRange = `>=${semver.parse(maintainedNodeVersions.last).major}`

export { packageDefaultNodeRange }
