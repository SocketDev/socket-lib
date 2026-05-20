/**
 * @file Maintained Node.js versions without external dependencies.
 */

import { ObjectAssign, ObjectFreeze } from '../primordials/object'

// Manually maintained Node.js version list.
// https://nodejs.org/en/about/previous-releases#looking-for-latest-release-of-a-version-branch
//
// Updated October 16th, 2025.
// - v25: 25.0.0 (Current)
// - v24: 24.10.0 (Current)
// - v22: 22.20.0 (Active LTS)
// - v20: 20.19.5 (Maintenance LTS)
// - v18: 18.20.8 (End-of-life)
const next = '25.0.0'
const current = '22.20.0'
const previous = '20.19.5'
const last = '18.20.8'

const maintainedNodeVersions = ObjectFreeze(
  ObjectAssign([last, previous, current, next], {
    current,
    last,
    next,
    previous,
  }),
) as readonly string[] & {
  current: string
  last: string
  next: string
  previous: string
}

export { maintainedNodeVersions }
