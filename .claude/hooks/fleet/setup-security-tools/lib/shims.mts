import path from 'node:path'

import { getSocketAppDir } from '@socketsecurity/lib-stable/paths/socket'

// Single source for the SFW shim directory. The integrity checker
// (index.mts checkShims) and the repairer (install.mts findBrokenShims) MUST
// scan the same dir — they previously diverged (`_wheelhouse/shims` vs a
// hardcoded `~/.socket/sfw/shims`), so the detector and repairer operated on
// different trees. Both now call this.
export function getShimsDir(): string {
  return path.join(getSocketAppDir('wheelhouse'), 'shims')
}
