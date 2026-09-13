/**
 * @file Bounded ZIP extraction with path and symlink containment.
 */

import { unzipSync } from 'fflate'

import { safeMkdir } from '../fs/safe.mjs'
import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { ArrayPrototypeSlice } from '../primordials/array.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import { SetCtor } from '../primordials/map-set.mjs'

import {
  assertArchiveExists,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TOTAL_SIZE,
  validatePathWithinBase,
} from './shared.mjs'

import type { UnzipFileInfo } from 'fflate'
import type { ExtractOptions } from './types.mjs'

export async function assertSecureDirectory(
  directory: string,
  normalizedOutputDir: string,
): Promise<void> {
  const fs = getNodeFs()
  const path = getNodePath()
  const relative = path.relative(normalizedOutputDir, directory)
  const components = relative ? relative.split(path.sep) : []
  let current = normalizedOutputDir
  for (const component of components) {
    current = path.join(current, component)
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- inspect type
      const stats = await fs.promises.lstat(current)
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new ErrorCtor(
          `Archive destination component is unsafe: ${current}`,
        )
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      await fs.promises.mkdir(current)
    }
  }
}

export async function ensureSecureOutputDirectory(
  directory: string,
): Promise<void> {
  const fs = getNodeFs()
  try {
    // oxlint-disable-next-line socket/prefer-exists-sync -- inspect type
    const stats = await fs.promises.lstat(directory)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new ErrorCtor(`Archive destination is unsafe: ${directory}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    await safeMkdir(directory)
    // oxlint-disable-next-line socket/prefer-exists-sync -- inspect type
    const stats = await fs.promises.lstat(directory)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new ErrorCtor(`Archive destination is unsafe: ${directory}`)
    }
  }
}

export async function extractZip(
  archivePath: string,
  outputDir: string,
  options?: ExtractOptions | undefined,
): Promise<void> {
  const opts = { __proto__: null, ...options } as typeof options
  assertArchiveExists(archivePath)
  const resolvedOptions: ResolvedZipOptions = {
    maxEntries: opts?.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxFileSize: opts?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    maxTotalSize: opts?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE,
    strip: opts?.strip ?? 0,
  }
  const normalizedOutputDir = normalizePath(outputDir)
  await ensureSecureOutputDirectory(normalizedOutputDir)
  const fs = getNodeFs()
  const archive = fs.readFileSync(archivePath)
  const entries = planZipEntries(archive, normalizedOutputDir, resolvedOptions)
  const names = new SetCtor(
    entries.filter(entry => !entry.directory).map(entry => entry.archiveName),
  )
  const inflated = unzipSync(archive, {
    filter: entry => names.has(entry.name),
  })

  for (const entry of entries) {
    if (entry.directory) {
      await assertSecureDirectory(entry.targetPath, normalizedOutputDir)
      continue
    }
    const contents = inflated[entry.archiveName]
    if (!contents) {
      throw new ErrorCtor(
        `Archive entry was not inflated: ${entry.archiveName}`,
      )
    }
    await writeZipEntry(entry.targetPath, contents, normalizedOutputDir)
  }
}

export function planZipEntries(
  archive: Uint8Array,
  normalizedOutputDir: string,
  options: ResolvedZipOptions,
): PlannedZipEntry[] {
  const opts = { __proto__: null, ...options } as typeof options
  const entries: PlannedZipEntry[] = []
  const targets = new SetCtor<string>()
  let entryCount = 0
  let totalSize = 0

  unzipSync(archive, {
    filter(entry) {
      entryCount += 1
      if (entryCount > opts.maxEntries) {
        throw new ErrorCtor(
          `Archive has too many entries: ${entryCount} (limit: ${opts.maxEntries})`,
        )
      }
      const planned = planZipEntry(entry, normalizedOutputDir, opts.strip)
      if (!planned) {
        return false
      }
      if (!planned.directory) {
        if (entry.originalSize > opts.maxFileSize) {
          throw new ErrorCtor(
            `File size exceeds limit: ${entry.name} (${entry.originalSize} bytes > ${opts.maxFileSize} bytes)`,
          )
        }
        totalSize += entry.originalSize
        if (totalSize > opts.maxTotalSize) {
          throw new ErrorCtor(
            `Total extracted size exceeds limit: ${totalSize} bytes > ${opts.maxTotalSize} bytes`,
          )
        }
      }
      if (targets.has(planned.targetPath)) {
        throw new ErrorCtor(
          `Duplicate archive destination: ${planned.targetPath}`,
        )
      }
      targets.add(planned.targetPath)
      entries.push(planned)
      return false
    },
  })
  return entries
}

export interface PlannedZipEntry {
  readonly archiveName: string
  readonly directory: boolean
  readonly targetPath: string
}

export interface ResolvedZipOptions {
  readonly maxEntries: number
  readonly maxFileSize: number
  readonly maxTotalSize: number
  readonly strip: number
}

export function planZipEntry(
  entry: UnzipFileInfo,
  normalizedOutputDir: string,
  strip: number,
): PlannedZipEntry | undefined {
  if (entry.name.includes('\0')) {
    throw new ErrorCtor(
      `Invalid null byte in archive entry name: ${entry.name}`,
    )
  }
  const parts = entry.name.split('/')
  if (parts.length <= strip) {
    return undefined
  }
  const strippedPath = ArrayPrototypeSlice(parts, strip).join('/')
  if (!strippedPath) {
    return undefined
  }
  const path = getNodePath()
  const targetPath = path.join(normalizedOutputDir, strippedPath)
  validatePathWithinBase(targetPath, normalizedOutputDir, entry.name)
  return {
    archiveName: entry.name,
    directory: entry.name.endsWith('/'),
    targetPath,
  }
}

export async function writeZipEntry(
  targetPath: string,
  contents: Uint8Array,
  normalizedOutputDir: string,
): Promise<void> {
  const fs = getNodeFs()
  const path = getNodePath()
  const parent = path.dirname(targetPath)
  await assertSecureDirectory(parent, normalizedOutputDir)
  try {
    // oxlint-disable-next-line socket/prefer-exists-sync -- inspect type
    const stats = await fs.promises.lstat(targetPath)
    if (stats.isSymbolicLink()) {
      throw new ErrorCtor(`Archive destination is a symlink: ${targetPath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  const flags =
    fs.constants.O_CREAT |
    fs.constants.O_WRONLY |
    fs.constants.O_TRUNC |
    fs.constants.O_NOFOLLOW
  const handle = await fs.promises.open(targetPath, flags, 0o666)
  try {
    await handle.writeFile(contents)
  } finally {
    await handle.close()
  }
}
