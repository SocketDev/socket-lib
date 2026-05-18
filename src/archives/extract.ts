/**
 * @file `extractArchive` — format-detecting dispatcher that routes to
 *   `extractTar` / `extractTarGz` / `extractZip`.
 */

import { ErrorCtor } from '../primordials/error'

import { detectArchiveFormat } from './detect'
import { getPath } from './_internal'
import { extractTar, extractTarGz } from './tar'
import { extractZip } from './zip'

import type { ExtractOptions } from './types'

/**
 * Extract an archive to a directory. Automatically detects format from file
 * extension.
 *
 * @example
 *   ;```typescript
 *   await extractArchive('/tmp/package.tar.gz', '/tmp/output')
 *   await extractArchive('/tmp/release.zip', '/tmp/output', { strip: 1 })
 *   ```
 *
 * @param archivePath - Path to archive file.
 * @param outputDir - Directory to extract to.
 * @param options - Extraction options.
 *
 * @throws Error if archive format is not supported
 */
export async function extractArchive(
  archivePath: string,
  outputDir: string,
  options: ExtractOptions = {},
): Promise<void> {
  const format = detectArchiveFormat(archivePath)

  if (!format) {
    const path = getPath()
    const ext = path.extname(archivePath).toLowerCase()
    throw new ErrorCtor(
      `Unsupported archive format${ext ? ` (extension: ${ext})` : ''}: ${archivePath}. ` +
        'Supported formats: .zip, .tar, .tar.gz, .tgz',
    )
  }

  switch (format) {
    case 'zip':
      return await extractZip(archivePath, outputDir, options)
    case 'tar':
      return await extractTar(archivePath, outputDir, options)
    case 'tar.gz':
    case 'tgz':
      return await extractTarGz(archivePath, outputDir, options)
  }
}
