/**
 * @file Shadow-bin detection. A "shadow bin" is a binary exposed by a
 *   transitively-installed `node_modules/.bin` directory rather than the system
 *   installation. Callers (`findRealBin`) deliberately walk past these to find
 *   the real interpreter.
 */

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
  const normalized = dirPath.replace(/\\/g, '/')
  return normalized.includes('node_modules/.bin')
}
