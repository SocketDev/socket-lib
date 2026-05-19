/**
 * @file `cdxgenFromNpm()` — fallback installer for cdxgen via npm/dlx. The
 *   default install path is `cdxgenFromDownload()` (SEA binary from the GitHub
 *   release); npm exists as a backup for two cases:
 *
 *   1. A platform upstream doesn't yet ship a SEA for (none today, but the API
 *      stays available so future platforms can fall back).
 *   2. Hosts that prefer the npm distribution for policy reasons (vendoring,
 *      Socket Firewall integration, etc.). Routes through `dlx/package` for SRI
 *      verification + concurrent install protection. Matches the pattern
 *      `setupAgentShield()` uses in the wheelhouse setup-security-tools hook.
 */

import { downloadPackage } from '../../dlx/package'

import { getCdxgenPackageSpec } from './asset-names'

import type { ResolvedCdxgen } from './types'

export interface CdxgenFromNpmOptions {
  /**
   * Cdxgen release version, e.g. `'12.4.1'`.
   */
  version: string
  /**
   * Optional SRI integrity (e.g. `sha512-...`). When set, dlx verifies the
   * downloaded tarball against this hash.
   */
  integrity?: string | undefined
}

export async function cdxgenFromNpm(
  opts: CdxgenFromNpmOptions,
): Promise<ResolvedCdxgen> {
  const { integrity, version } = opts
  const packageSpec = getCdxgenPackageSpec({ version })
  const { binaryPath } = await downloadPackage({
    package: packageSpec,
    binaryName: 'cdxgen',
    ...(integrity ? { hash: integrity } : {}),
  })
  return {
    path: binaryPath,
    source: 'npm',
  }
}
