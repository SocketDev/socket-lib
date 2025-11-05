/**
 * @fileoverview Default Node.js version range for packages.
 */

const maintainedNodeVersions = require('./maintained-node-versions')
const semver = require('./external/semver')

export default `>=${semver.parse(maintainedNodeVersions.last).major}`
