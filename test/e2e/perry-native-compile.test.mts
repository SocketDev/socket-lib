/**
 * @file E2E: compile a socket-lib surface to a native binary with Perry, then
 *   run it. Guards the lib's ahead-of-time-compile support — the `node:smol-*`
 *   deferral and the `require` binding in `node/module.ts` — against
 *   regressions (both "compiles" and "runs"). Skipped when the pinned
 *   `@perryts/perry` platform binary is unavailable (unsupported host).
 */
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { spawn } from '../../src/process/spawn/child'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..', '..')
const fixtureDir = resolve(repoRoot, 'test', 'fixtures', 'perry')
const perryBin = resolve(repoRoot, 'node_modules', '.bin', 'perry')

// Fail-closed: telemetry off, no background update checks (fleet rule).
const perryEnv = {
  __proto__: null,
  ...process.env,
  CI: 'true',
  PERRY_NO_TELEMETRY: '1',
  PERRY_NO_UPDATE_CHECK: '1',
} as NodeJS.ProcessEnv

// Resolve @socketsecurity/lib to THIS repo (not the published version) so the
// compile exercises local `src`. With the package in perry.compilePackages,
// Perry resolves and compiles its TypeScript source directly.
function linkLocalLib(): void {
  const scopeDir = join(fixtureDir, 'node_modules', '@socketsecurity')
  mkdirSync(scopeDir, { recursive: true })
  const link = join(scopeDir, 'lib')
  rmSync(link, { force: true })
  symlinkSync(repoRoot, link, 'dir')
  rmSync(join(fixtureDir, '.perry-cache'), { force: true, recursive: true })
}

describe.skipIf(!existsSync(perryBin))('perry native-compile e2e', () => {
  it(
    'compiles a socket-lib surface natively under lockdown, then runs it',
    async () => {
      linkLocalLib()
      const out = join(tmpdir(), 'socket-lib-perry-e2e')
      rmSync(out, { force: true })
      rmSync(`${out}.attest.json`, { force: true })

      // `lockdown` + `strict` + `emitAttest` come from the fixture package.json.
      const compiled = await spawn(
        perryBin,
        ['compile', 'entry.ts', '-o', out],
        { cwd: fixtureDir, env: perryEnv, stdioString: true },
      ).catch(error => error)
      expect(
        compiled.code,
        `compile failed:\n${compiled.stdout ?? ''}${compiled.stderr ?? ''}`,
      ).toBe(0)
      expect(existsSync(out)).toBe(true)
      // emitAttest writes a provenance sidecar (SHA-256 + perry version).
      expect(existsSync(`${out}.attest.json`)).toBe(true)

      const ran = await spawn(out, [], { stdioString: true }).catch(
        error => error,
      )
      expect(
        ran.code,
        `binary errored at runtime:\n${ran.stdout ?? ''}${ran.stderr ?? ''}`,
      ).toBe(0)
    },
    180_000,
  )
})
