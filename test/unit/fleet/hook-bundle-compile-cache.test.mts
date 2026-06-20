// vitest spec proving the fleet hook bundle's V8 compile cache is actually
// created and flushed: build the CJS bundle, spawn the hand-written .cjs loader
// (which calls module.enableCompileCache) for an event, then assert the cache
// dir is populated (file count > 0). Without that file count the compile-cache
// claim is unproven, so this test is the gate on the whole feature.
//
// See docs/agents.md/fleet/hook-bundle.md.

import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { rolldown } from 'rolldown'

import { createLibStubPlugin } from '../../../.config/repo/rolldown/lib-stub.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// test/unit/fleet/ -> repo root
const repoRoot = path.join(__dirname, '..', '..', '..')
const dispatchDir = path.join(
  repoRoot,
  '.claude',
  'hooks',
  'fleet',
  '_dispatch',
)

const STUB_PATTERN = /@socketsecurity\/lib(?:-stable)?\/.*\/(?:globs|sorts)\.js$/

/**
 * Build the dispatch bundle from the live _dispatch sources into outFile.
 */
async function buildBundle(outFile: string): Promise<void> {
  const bundle = await rolldown({
    external: [/^node:/],
    input: path.join(dispatchDir, 'dispatch-entry.mts'),
    platform: 'node',
    plugins: [createLibStubPlugin({ stubPattern: STUB_PATTERN })],
  })
  await bundle.write({
    file: outFile,
    format: 'cjs',
    minify: true,
    sourcemap: false,
  })
  await bundle.close()
}

/**
 * Count regular files anywhere under dir (recursively). 0 when dir is missing.
 */
function countFiles(dir: string): number {
  if (!existsSync(dir)) {
    return 0
  }
  let total = 0
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      total += countFiles(full)
    } else if (dirent.isFile()) {
      total += 1
    }
  }
  return total
}

describe('hook-bundle compile cache', () => {
  test('the .cjs loader populates the compile-cache dir for an event', async () => {
    if (!existsSync(path.join(dispatchDir, 'dispatch-entry.mts'))) {
      // Live _dispatch sources are only present after a dogfood cascade; in a
      // template-only checkout there is nothing to build. Skip rather than fail.
      return
    }
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'hook-bundle-cache-'))
    try {
      const bundlePath = path.join(tmp, 'bundle.cjs')
      await buildBundle(bundlePath)
      assert.equal(existsSync(bundlePath), true, 'bundle.cjs should be built')

      const cacheDir = path.join(tmp, 'cache')
      const loaderPath = path.join(tmp, 'loader.cjs')
      // A self-contained loader that mirrors _dispatch/index.cjs: enable the
      // compile cache at cacheDir, then require the bundle.
      writeFileSync(
        loaderPath,
        [
          `'use strict'`,
          `require('node:module').enableCompileCache(${JSON.stringify(cacheDir)})`,
          `require(${JSON.stringify(bundlePath)})`,
          ``,
        ].join('\n'),
      )

      const result = spawnSync('node', [loaderPath, 'PostToolUse'], {
        encoding: 'utf8',
        input: JSON.stringify({
          hook_event_name: 'PostToolUse',
          tool_input: { command: 'ls' },
          tool_name: 'Bash',
        }),
      })
      assert.equal(result.status, 0, `loader should exit 0; stderr: ${String(result.stderr ?? '')}`)

      const cacheFileCount = countFiles(cacheDir)
      assert.ok(
        cacheFileCount > 0,
        `expected the V8 compile-cache dir to be populated (files > 0), saw ${cacheFileCount}. ` +
          `A type-stripped .mts loader leaves 0 here; a plain CJS bundle must flush.`,
      )
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })
})
