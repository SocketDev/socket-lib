/**
 * @file Behavioral tests for the bundled dist/external modules. The externals
 *   build collapses vendored below-floor engine gates (@npmcli/fs cp's
 *   `useNative = node.satisfies('>=16.7.0')`) so no `node` helper binding
 *   survives for downstream bundlers to mangle — packageurl-js's
 *   dist/exists.js once crashed at require time on `node.satisfies is not a
 *   function`. These tests exercise behavior, not bundle text: the affected
 *   dist bundles must load in a fresh child process (requiring npm-pack.js
 *   eagerly evaluates the @npmcli/fs module chain where the gate lived), and
 *   a directory copy round-trip through the lib's copy API must succeed on
 *   the native fs.cp path.
 */

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { copy } from '@socketsecurity/lib/fs/copy'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { spawnSync } from '@socketsecurity/lib/process/spawn/child'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const distExternalDir = path.join(repoRoot, 'dist', 'external')

describe('dist externals', () => {
  // cacache.js re-exports from npm-pack.js, so both bundles cover the
  // vendored @npmcli/fs chain that carried the engine gate.
  for (const bundle of ['npm-pack.js', 'cacache.js']) {
    it(`${bundle} loads in a fresh child process`, () => {
      const bundlePath = path.join(distExternalDir, bundle)
      const result = spawnSync(
        process.execPath,
        ['-e', 'require(process.argv[1])', bundlePath],
        { cwd: repoRoot },
      )
      expect(result.stderr.toString()).toBe('')
      expect(result.status).toBe(0)
    })
  }

  it('copies a directory round-trip through the lib copy API', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'externals-cp-'))
    try {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(path.join(src, 'nested'), { recursive: true })
      await fs.writeFile(path.join(src, 'a.txt'), 'alpha')
      await fs.writeFile(path.join(src, 'nested', 'b.txt'), 'beta')

      await copy(src, dest)

      expect(await fs.readFile(path.join(dest, 'a.txt'), 'utf8')).toBe('alpha')
      expect(
        await fs.readFile(path.join(dest, 'nested', 'b.txt'), 'utf8'),
      ).toBe('beta')
    } finally {
      safeDeleteSync(tmpDir)
    }
  })
})
