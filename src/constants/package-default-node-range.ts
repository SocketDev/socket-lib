/**
 * @file Default Node.js version range for packages.
 */

import { maintainedNodeVersions } from './maintained-node-versions'

// The major is the integer prefix of the controlled 'X.Y.Z' constant — a
// full semver parse here pulled the entire semver graph (whose index builds
// `new Comparator` at ITS module eval) into every importer at module eval,
// making the whole constants surface hostile to V8 startup snapshots.
const packageDefaultNodeRange = `>=${Number.parseInt(maintainedNodeVersions.last, 10)}`

export { packageDefaultNodeRange }
