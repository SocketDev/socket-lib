/**
 * @file MacOS-only fsync barrier for `dist/`. Walk the tree and `fsync()` every
 *   regular file so downstream steps (tests, packagers) see fully-durable bytes
 *   rather than page-cache state. esbuild + child-process builders resolve their
 *   write Promises before the file system view is durable on darwin CI runners.
 *
 *   Skipped on Linux + Windows: Linux's `fs.writeFile` already provides the
 *   needed durability for our use, and Windows cannot `open(dir, 'r')` for the
 *   directory-flush step (different file-handle semantics).
 *
 *   **Why:** Past incident — socket-lib v6.0.1 + v6.0.2 macOS CI flakes where
 *   `Build completed successfully` logged with 502 validated exports, then the
 *   very next vitest run hit `Unexpected token '{'` on a `dist/external/*.js`
 *   shim and `Cannot find module 'dist/packages/normalize.js'`. Files written
 *   but not yet durable.
 */

import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export async function fsyncFile(filePath: string): Promise<void> {
  // Best-effort — a single failed fsync shouldn't tank the build. Macs
  // occasionally surface EPERM on system-restored files; the bytes are
  // already on disk, just unflushable from userspace.
  try {
    const fh = await fsPromises.open(filePath, 'r')
    try {
      await fh.sync()
    } finally {
      await fh.close()
    }
  } catch {
    // ignore — best-effort barrier
  }
}

export async function fsyncDist(dir: string): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }
  const entries = await fsPromises.readdir(dir, { withFileTypes: true })
  const filePromises: Array<Promise<void>> = []
  const subdirs: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      subdirs.push(entryPath)
    } else if (entry.isFile()) {
      filePromises.push(fsyncFile(entryPath))
    }
  }
  await Promise.all(filePromises)
  // Subdirs in parallel to keep the barrier cheap on wide trees.
  await Promise.all(subdirs.map(fsyncDist))
}
