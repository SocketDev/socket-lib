/**
 * @file E2E: compile a socket-lib surface to a native binary with Perry, then
 *   run it. Guards the lib's ahead-of-time-compile support — the `node:smol-*`
 *   deferral and the `require` binding in `node/module.ts` — against
 *   regressions (both "compiles" and "runs"). Skipped when the pinned
 *   `@perryts/perry` platform binary is unavailable (unsupported host).
 */
import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'

import { spawn } from '../../src/process/spawn/child'
import { tolerantTimeout } from '../_shared/fleet/lib/timing.mts'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..', '..')
const fixtureDir = path.resolve(repoRoot, 'test', 'fixtures', 'perry')
// On Windows the runnable shim is perry.cmd; the extensionless `perry` is a
// POSIX sh script Windows can't exec directly. spawn() runs the .cmd via
// cmd.exe when shell: true (see below).
const perryBin = path.resolve(
  repoRoot,
  'node_modules',
  '.bin',
  WIN32 ? 'perry.cmd' : 'perry',
)

// Fail-closed: telemetry off, no background update checks (fleet rule).
const perryEnv: NodeJS.ProcessEnv = {
  ...process.env,
  CI: 'true',
  PERRY_NO_TELEMETRY: '1',
  PERRY_NO_UPDATE_CHECK: '1',
}

// Resolve @socketsecurity/lib to THIS repo (not the published version) so the
// compile exercises local `src`. With the package in perry.compilePackages,
// Perry resolves and compiles its TypeScript source directly.
function linkLocalLib(): void {
  const scopeDir = path.join(fixtureDir, 'node_modules', '@socketsecurity')
  mkdirSync(scopeDir, { recursive: true })
  const link = path.join(scopeDir, 'lib')
  safeDeleteSync(link)
  symlinkSync(repoRoot, link, 'dir')
  safeDeleteSync(path.join(fixtureDir, '.perry-cache'))
}

describe.skipIf(!existsSync(perryBin))('perry native-compile e2e', () => {
  it(
    'compiles a socket-lib surface natively under lockdown, then runs it',
    async () => {
      linkLocalLib()
      // Windows executables need a .exe extension to be launchable; perry
      // writes exactly the -o path, so ask for .exe there (the .attest.json
      // sidecar derives from the same path).
      const out = path.join(
        os.tmpdir(),
        WIN32 ? 'socket-lib-perry-e2e.exe' : 'socket-lib-perry-e2e',
      )
      // perry names the attest sidecar off the -o path; on Windows the .exe
      // stem may or may not be kept, so track both candidates.
      const outStem = out.replace(/\.exe$/, '')
      const attestCandidates = [`${out}.attest.json`, `${outStem}.attest.json`]
      safeDeleteSync(out)
      for (let i = 0, { length } = attestCandidates; i < length; i += 1) {
        safeDeleteSync(attestCandidates[i]!)
      }

      // `lockdown` + `strict` + `emitAttest` come from the fixture package.json.
      const compiled = await spawn(
        perryBin,
        ['compile', 'entry.ts', '-o', out],
        { cwd: fixtureDir, env: perryEnv, shell: WIN32, stdioString: true },
      ).catch(error => error)
      expect(
        compiled.code,
        `compile failed:\n${compiled.stdout ?? ''}${compiled.stderr ?? ''}`,
      ).toBe(0)
      expect(existsSync(out)).toBe(true)
      // emitAttest writes a provenance sidecar (SHA-256 + perry version).
      expect(attestCandidates.some(p => existsSync(p))).toBe(true)

      // No shell here: `out` is the compiled native binary (a PE on Windows),
      // which Node executes directly by path. Routing it through cmd.exe
      // (shell) fails — cmd.exe can't run an extensionless executable.
      const ran = await spawn(out, [], { stdioString: true }).catch(
        error => error,
      )
      expect(
        ran.code,
        `binary errored at runtime:\n${ran.stdout ?? ''}${ran.stderr ?? ''}`,
      ).toBe(0)
    },
    tolerantTimeout(180_000),
  )
})
