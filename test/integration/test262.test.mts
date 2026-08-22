/*
 * @file Gate: the pinned test262 subset must have no unexpected failures.
 *
 *   Skipped when the submodule is unfetched or the package is unbuilt, since
 *   the runner needs both. The skip is why this is a wrapper rather than a
 *   line in the default suite: it keeps `pnpm test` runnable on a fresh clone
 *   while still gating a machine that has the pieces.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { describe, expect, it } from 'vitest'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(thisDir, '..', '..')
const RUNNER = path.join(repoRoot, 'test', 'scripts', 'test262-runner.mts')

const skipTests =
  !existsSync(path.join(repoRoot, 'upstream', 'test262')) ||
  !existsSync(path.join(repoRoot, 'dist'))

const TIMEOUT_MS = 15 * 60 * 1000

describe.skipIf(skipTests)('test262 conformance', () => {
  it(
    'no unexpected failures vs the allowlist',
    async () => {
      // Catch rather than pass `throws: false`: the published lib-stable's
      // SpawnOptions has no such field, and a newer lib resolves with the code
      // where the published one rejects with it. Catching covers both shapes.
      let code = 0
      try {
        const result = await spawn(process.execPath, [RUNNER], {
          stdio: 'inherit',
        })
        code = result.code ?? 0
      } catch (e) {
        code =
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          typeof e.code === 'number'
            ? e.code
            : 1
      }
      expect(code).toBe(0)
    },
    TIMEOUT_MS,
  )
})
