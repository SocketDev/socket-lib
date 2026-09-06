/**
 * @file Volta-managed binary resolution.
 *   Volta layers binaries through `~/.volta/tools/{image,user}/...` with
 *   version-pinned subdirectories, so the path on PATH is a shim rather than
 *   the real CLI. Given the `.volta/` segment's offset in a bin path, the
 *   functions here walk into the image directory and return the real script.
 *   Results are memoized in `voltaBinCache`, which lives in `../shared.mjs` so
 *   `which.mts` can flush it alongside its own cache.
 */

import { readJsonSync } from '../../fs/read-json.mjs'
import { normalizePath } from '../../paths/normalize.mjs'
import { getFs, getPath, voltaBinCache } from '../shared.mjs'
import { BIN_SHIM_FORMAT, binShimFormat } from './bin-kinds.mjs'

/**
 * The subset of Volta's `user/platform.json` that pins tool versions.
 */
export type VoltaPlatform = {
  node?: { npm?: string | undefined; runtime?: string | undefined } | undefined
} | null

/**
 * Volta's pinned tool versions, or null when the file is absent or malformed.
 */
export function readVoltaPlatform(userPath: string): VoltaPlatform {
  const path = getPath()
  return readJsonSync(path.join(userPath, 'platform.json'), {
    throws: false,
  }) as VoltaPlatform
}

/**
 * The real script behind a Volta shim, or `''` when Volta does not manage it.
 *
 * `voltaIndex` is the offset of the `.volta/` segment inside `binPath`, which
 * the caller already located.
 */
export function resolveVoltaBinSync(config: {
  basename: string
  binPath: string
  voltaIndex: number
}): string {
  const { basename, binPath, voltaIndex } = config
  const fs = getFs()
  const path = getPath()
  const voltaPath = binPath.slice(0, voltaIndex)
  const voltaCacheKey = `${voltaPath}:${basename}`
  const cachedVolta = voltaBinCache.get(voltaCacheKey)
  // Cache hit fires on the second call for the same Volta key; the tests
  // exercise distinct keys.
  /* c8 ignore start */
  if (cachedVolta) {
    if (fs.existsSync(cachedVolta)) {
      return cachedVolta
    }
    voltaBinCache.delete(voltaCacheKey)
  }
  /* c8 ignore stop */
  const voltaToolsPath = path.join(voltaPath, 'tools')
  const imagePath = path.join(voltaToolsPath, 'image')
  const userPath = path.join(voltaToolsPath, 'user')
  // The npm cascade (image/npm/<ver> → image/node/<ver>/lib/node_modules/npm)
  // and the .cmd extension fallback are exercised on Windows runners.
  /* c8 ignore start */
  const voltaBinPath =
    binShimFormat(basename) === BIN_SHIM_FORMAT.npmCli
      ? voltaNpmCliPath({
          basename,
          imagePath,
          platform: readVoltaPlatform(userPath),
        })
      : voltaPackageBinPath({ basename, imagePath, userPath })
  /* c8 ignore stop */
  if (!voltaBinPath) {
    return ''
  }
  let resolvedVoltaPath = voltaBinPath
  try {
    resolvedVoltaPath = normalizePath(fs.realpathSync.native(voltaBinPath))
  } catch {}
  voltaBinCache.set(voltaCacheKey, resolvedVoltaPath)
  return resolvedVoltaPath
}

/**
 * The npm or npx CLI script inside a Volta image.
 *
 * Volta stores npm two ways depending on whether it was pinned separately:
 * under `image/npm/<version>/`, or bundled inside the Node image at
 * `image/node/<version>/lib/node_modules/npm/`. The first is tried first.
 */
export function voltaNpmCliPath(config: {
  basename: string
  imagePath: string
  platform: VoltaPlatform
}): string {
  const { basename, imagePath, platform } = config
  const npmVersion = platform?.node?.npm
  if (!npmVersion) {
    return ''
  }
  const fs = getFs()
  const path = getPath()
  const relCliPath = `bin/${basename}-cli.js`
  const imageNpmPath = path.join(imagePath, `npm/${npmVersion}/${relCliPath}`)
  const nodeVersion = platform?.node?.runtime
  if (!nodeVersion || fs.existsSync(imageNpmPath)) {
    return imageNpmPath
  }
  const bundledNpmPath = path.join(
    imagePath,
    `node/${nodeVersion}/lib/node_modules/npm/${relCliPath}`,
  )
  return fs.existsSync(bundledNpmPath) ? bundledNpmPath : ''
}

/**
 * A non-npm package binary inside a Volta image.
 *
 * Volta records the owning package in `user/bin/<name>.json`, then stores the
 * binary at `image/packages/<package>/bin/<name>`, with a `.cmd` sibling on
 * Windows.
 */
export function voltaPackageBinPath(config: {
  basename: string
  imagePath: string
  userPath: string
}): string {
  const { basename, imagePath, userPath } = config
  const fs = getFs()
  const path = getPath()
  const binInfo = readJsonSync(path.join(userPath, 'bin', `${basename}.json`), {
    throws: false,
  }) as { package?: string | undefined } | null
  const binPackage = binInfo?.package
  if (!binPackage) {
    return ''
  }
  const packageBinPath = path.join(
    imagePath,
    `packages/${binPackage}/bin/${basename}`,
  )
  if (fs.existsSync(packageBinPath)) {
    return packageBinPath
  }
  const cmdBinPath = `${packageBinPath}.cmd`
  return fs.existsSync(cmdBinPath) ? cmdBinPath : ''
}
