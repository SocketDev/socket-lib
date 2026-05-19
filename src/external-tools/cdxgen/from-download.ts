/**
 * @file `cdxgenFromDownload()` — installs the pinned cdxgen npm package via
 *   `dlx/package` and returns a `ResolvedCdxgen` pointing at the resolved bin
 *   shim. cdxgen is npm-only; there's no platform fan-out, no archive
 *   extraction, no GitHub release dance — the dlx layer handles the npm tarball
 *   fetch, SRI verification, and `node_modules/.bin/cdxgen` resolution.
 *   Trust-on-first-use: pass `integrity` from `external-tools.json` /
 *   `bundle-tools.json` to verify against the pinned SRI. Omitted on first
 *   install — the dlx layer reports the computed SRI back so consumers can pin
 *   it.
 */

import { downloadPackage } from '../../dlx/package'

import { getCdxgenPackageSpec } from './asset-names'

import type { ResolvedCdxgen } from './types'

export interface CdxgenFromDownloadOptions {
  /**
   * Cdxgen release version, e.g. `'12.0.0'`.
   */
  version: string
  /**
   * Optional SRI integrity (e.g. `sha512-...`). When set, dlx verifies the
   * downloaded tarball against this hash.
   */
  integrity?: string | undefined
}

export async function cdxgenFromDownload(
  opts: CdxgenFromDownloadOptions,
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
    source: 'download',
  }
}
