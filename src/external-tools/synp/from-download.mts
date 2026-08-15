/**
 * @file `synpFromDownload()` — installs the pinned synp npm package via
 *   `dlx/package` and returns a `ResolvedSynp` pointing at the resolved bin
 *   shim.
 */

import { downloadNpmPackage } from '../../dlx/package.mjs'

import { getSynpPackageSpec } from './asset-names.mjs'

import type { ResolvedSynp } from './types.mjs'

export interface SynpFromDownloadOptions {
  /**
   * Synp release version, e.g. `'1.9.14'`.
   */
  version: string
  /**
   * Optional SRI integrity (e.g. `sha512-...`). When set, dlx verifies the
   * downloaded tarball against this hash.
   */
  integrity?: string | undefined
}

export async function synpFromDownload(
  options: SynpFromDownloadOptions,
): Promise<ResolvedSynp> {
  const { integrity, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const packageSpec = getSynpPackageSpec({ version })
  const { binaryPath } = await downloadNpmPackage({
    spec: packageSpec,
    binaryName: 'synp',
    ...(integrity ? { hash: integrity } : {}),
  })
  return {
    path: binaryPath,
    source: 'download',
  }
}
