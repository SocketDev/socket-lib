/**
 * @file Shadow-bin detection. A "shadow bin" is a binary exposed by a
 *   transitively-installed `node_modules/.bin` directory rather than the system
 *   installation. Callers (`findRealBin`) deliberately walk past these to find
 *   the real interpreter.
 */

import { normalizePath } from '@socketsecurity/lib/paths/normalize'

/**
 * Check if a directory path contains any shadow bin patterns.
 *
 * @example
 *   ;```typescript
 *   isShadowBinPath('/tmp/project/node_modules/.bin') // true
 *   isShadowBinPath('/usr/local/bin') // false
 *   ```
 */
export function isShadowBinPath(dirPath: string | undefined): boolean {
  if (!dirPath) {
    return false
  }
  // Check for node_modules/.bin pattern (Unix and Windows)
  const normalized = normalizePath(dirPath)
  return normalized.includes('node_modules/.bin')
}
