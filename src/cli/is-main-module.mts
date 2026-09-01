import { getNodeFs } from '../node/fs.mjs'
import { getNodeProcess } from '../node/process.mjs'
import { getNodeUrl } from '../node/url.mjs'
/**
 * @file Entrypoint detection for CLI scripts. The naive `import.meta.url ===
 *   file://argv[1]` comparison is symlink-fragile: Node resolves the REAL path
 *   for a module's `import.meta.url` while `getNodeProcess().argv[1]` keeps the
 *   path as invoked, so a script spawned via a symlinked location (macOS `/var`
 *   → `/private/var`, the shape every mkdtemp-based integration test hits)
 *   never matches and `main()` silently does not run. Compare realpaths on both
 *   sides instead.
 */

/**
 * True when the module at `importMetaUrl` is the process entrypoint.
 * `entryPath` defaults to `getNodeProcess().argv[1]`; injectable for tests.
 */
export function isMainModule(
  importMetaUrl: string,
  entryPath?: string | undefined,
): boolean {
  const nodeProcess = getNodeProcess()
  const entry = entryPath ?? nodeProcess.argv[1]
  if (!entry) {
    return false
  }
  try {
    const fs = getNodeFs()
    const url = getNodeUrl()
    return (
      fs.realpathSync(url.fileURLToPath(importMetaUrl)) ===
      fs.realpathSync(entry)
    )
  } catch {
    return false
  }
}
