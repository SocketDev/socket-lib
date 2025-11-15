/**
 * @fileoverview Default Node.js version range for packages.
 */

import { maintainedNodeVersions } from './maintained-node-versions'
import * as semver from './external/semver.js'

const packageDefaultNodeRange = `>=${semver.parse(maintainedNodeVersions.last).major}`

export { packageDefaultNodeRange }
