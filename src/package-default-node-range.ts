/**
 * @fileoverview Default Node.js version range for packages.
 */

const maintainedNodeVersions = require('#lib/maintained-node-versions').default
const semver = require('./external/semver')

const packageDefaultNodeRange = `>=${semver.parse(maintainedNodeVersions.last).major}`

export default packageDefaultNodeRange
export { packageDefaultNodeRange as 'module.exports' }
