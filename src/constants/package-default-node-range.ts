/**
 * @file Default Node.js version range for packages.
 */

import { maintainedNodeVersions } from './maintained-node-versions'
import { parse } from '../external/semver'

/* c8 ignore next - External semver call */
const packageDefaultNodeRange = `>=${parse(maintainedNodeVersions.last)!.major}`

export { packageDefaultNodeRange }
