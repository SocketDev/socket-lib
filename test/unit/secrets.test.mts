/**
 * @fileoverview Unit tests for the secrets/ module — both the
 * keychain backend (per-platform OS credential store) and the
 * rc-file writer (literal-export shell-rc block).
 *
 * Strategy:
 *   - Keychain tests round-trip a unique throwaway value through
 *     the real OS backend, then clean up. Platform-gated: the test
 *     skips when the backend isn't available (libsecret missing on
 *     Linux, etc.). Service name is `socket-lib-test-<rand>` so we
 *     never collide with real socket-cli / socket-mcp entries.
 *   - rc tests drive `write` / `clear` against a fake HOME and
 *     assert the on-disk shape (no real ~/.zshenv touched).
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { platform, tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  clearCache,
  deleteSecret,
  deleteSecretFromSlots,
  getBackendAvailability,
  readSecret,
  readSecretFromSlots,
  writeSecret,
  writeSecretToSlots,
} from '../../src/secrets/keychain'

import { resolve, resolveSync } from '../../src/secrets/find'

import * as rc from '../../src/secrets/rc'

const IS_MACOS = platform() === 'darwin'
const BACKEND_OK = getBackendAvailability().available

export function rng(): string {
  return Math.random().toString(36).slice(2, 10)
}

describe('secrets/keychain', () => {
  it.skipIf(!BACKEND_OK)('write/read/delete round-trip', async () => {
    const service = `socket-lib-test-${rng()}`
    const account = 'TEST_TOKEN'
    const value = `test-value-${rng()}`
    try {
      await writeSecret({ service, account, value })
      const back = await readSecret({ service, account })
      expect(back).toBe(value)
    } finally {
      await deleteSecret({ service, account })
    }
  })

  it.skipIf(!BACKEND_OK)(
    'read returns undefined for absent entry',
    async () => {
      const service = `socket-lib-test-${rng()}`
      const back = await readSecret({ service, account: 'NEVER_SET' })
      expect(back).toBeUndefined()
    },
  )

  it.skipIf(!BACKEND_OK)(
    'delete returns "absent" when entry does not exist',
    async () => {
      const service = `socket-lib-test-${rng()}`
      const outcome = await deleteSecret({ service, account: 'NEVER_SET' })
      expect(outcome).toBe('absent')
    },
  )

  it.skipIf(!BACKEND_OK)('multi-slot write/read/delete', async () => {
    const service = `socket-lib-test-${rng()}`
    const value = `multi-${rng()}`
    const accounts = ['CANONICAL_NAME', 'LEGACY_ALIAS']
    try {
      const writes = await writeSecretToSlots({ service, accounts, value })
      expect(writes).toHaveLength(2)
      expect(writes.map(r => r.outcome)).toEqual(['written', 'written'])

      const hit = await readSecretFromSlots({ service, accounts })
      expect(hit).toBeTruthy()
      expect(hit!.value).toBe(value)
      expect(hit!.account).toBe('CANONICAL_NAME')

      // After deleting the canonical, the legacy is still reachable.
      await deleteSecret({ service, account: 'CANONICAL_NAME' })
      const fallback = await readSecretFromSlots({ service, accounts })
      expect(fallback).toBeTruthy()
      expect(fallback!.account).toBe('LEGACY_ALIAS')
    } finally {
      await deleteSecretFromSlots({ service, accounts })
    }
  })

  it('write rejects non-string value', async () => {
    await expect(
      writeSecret({
        service: 'x',
        account: 'y',
        // @ts-expect-error: deliberately wrong type
        value: 123,
      }),
    ).rejects.toThrow(/non-empty string/)
    await expect(
      writeSecret({ service: 'x', account: 'y', value: '' }),
    ).rejects.toThrow(/non-empty string/)
  })

  it('getBackendAvailability returns a shape regardless of platform', () => {
    const result = getBackendAvailability()
    expect(typeof result.available).toBe('boolean')
    expect(typeof result.toolName).toBe('string')
  })
})

export function withFakeHome(): {
  rcPath: string
  cleanup: () => void
} {
  const fake = mkdtempSync(path.join(tmpdir(), 'secrets-rc-test-'))
  const prevHome = process.env['HOME']
  const prevShell = process.env['SHELL']
  process.env['HOME'] = fake
  process.env['SHELL'] = '/bin/zsh'
  const rcPath = path.join(fake, '.zshenv')
  return {
    rcPath,
    cleanup: () => {
      if (prevHome === undefined) {
        delete process.env['HOME']
      } else {
        process.env['HOME'] = prevHome
      }
      if (prevShell === undefined) {
        delete process.env['SHELL']
      } else {
        process.env['SHELL'] = prevShell
      }
      rmSync(fake, { recursive: true, force: true })
    },
  }
}

describe('secrets/rc', () => {
  it.skipIf(!IS_MACOS)('inserts a managed block with literal exports', () => {
    const { rcPath, cleanup } = withFakeHome()
    try {
      writeFileSync(rcPath, '# existing\nexport PATH=$PATH:/foo\n')
      const r = rc.write({
        service: 'test-svc',
        exports: { TEST_VAR: 'value-1', TEST_ALIAS: 'value-1' },
        notes: ['Test note'],
      })
      expect(r).toBeTruthy()
      expect(r!.outcome).toBe('inserted')
      const content = readFileSync(rcPath, 'utf8')
      expect(content).toMatch(/BEGIN test-svc env \(managed\)/)
      expect(content).toMatch(/END test-svc env/)
      expect(content).toMatch(/# Test note/)
      expect(content).toMatch(/export TEST_VAR='value-1'/)
      expect(content).toMatch(/export TEST_ALIAS='value-1'/)
      expect(content).toMatch(/existing/)
      expect(content).toMatch(/export PATH/)
      // NO live keychain call in the block.
      expect(content).not.toMatch(/\$\([^)]*security find-generic-password/)
    } finally {
      cleanup()
    }
  })

  it.skipIf(!IS_MACOS)('escapes single quotes safely', () => {
    const { rcPath, cleanup } = withFakeHome()
    try {
      writeFileSync(rcPath, '')
      rc.write({
        service: 'test-svc',
        exports: { TEST_VAR: "value'with'quotes" },
      })
      const content = readFileSync(rcPath, 'utf8')
      // POSIX single-quote escape: close, escape, reopen.
      expect(content).toMatch(/export TEST_VAR='value'\\''with'\\''quotes'/)
    } finally {
      cleanup()
    }
  })

  it.skipIf(!IS_MACOS)('clear removes the block', () => {
    const { rcPath, cleanup } = withFakeHome()
    try {
      writeFileSync(rcPath, '# before\n')
      rc.write({
        service: 'test-svc',
        exports: { TEST_VAR: 'v' },
      })
      const removed = rc.clear('test-svc')
      expect(removed).toBe(true)
      const content = readFileSync(rcPath, 'utf8')
      expect(content).not.toMatch(/BEGIN test-svc env/)
      expect(content).toMatch(/# before/)
    } finally {
      cleanup()
    }
  })

  it.skipIf(!IS_MACOS)('legacySentinels migrates an older block', () => {
    const { rcPath, cleanup } = withFakeHome()
    try {
      const legacyBlock = `# BEGIN socket-cli keychain bridge (managed)
SOCKET_API_TOKEN="$(security find-generic-password -s socket-cli -a SOCKET_API_TOKEN -w 2>/dev/null)"
# END socket-cli keychain bridge`
      writeFileSync(rcPath, `# existing\n\n${legacyBlock}\n`)
      const r = rc.write({
        service: 'socket-cli',
        exports: { SOCKET_API_TOKEN: 'literal-value' },
        legacySentinels: ['# BEGIN socket-cli keychain bridge (managed)'],
      })
      expect(r).toBeTruthy()
      const content = readFileSync(rcPath, 'utf8')
      // Legacy block gone.
      expect(content).not.toMatch(/keychain bridge/)
      expect(content).not.toMatch(/security find-generic-password/)
      // New block in.
      expect(content).toMatch(/BEGIN socket-cli env \(managed\)/)
      expect(content).toMatch(/export SOCKET_API_TOKEN='literal-value'/)
    } finally {
      cleanup()
    }
  })

  it.skipIf(!IS_MACOS)('returns undefined on non-existent rc location', () => {
    const { cleanup } = withFakeHome()
    try {
      // Force an "other" shell so pickRcFile returns undefined.
      process.env['SHELL'] = '/bin/exotic-shell'
      const r = rc.write({
        service: 'test-svc',
        exports: { TEST: 'v' },
      })
      expect(r).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  // Verify existsSync of the temp file (sanity).
  it('temp-home fixture sets up correctly', () => {
    const { rcPath, cleanup } = withFakeHome()
    try {
      writeFileSync(rcPath, 'hello')
      expect(existsSync(rcPath)).toBe(true)
    } finally {
      cleanup()
    }
  })
})

describe('secrets/find', () => {
  it('prefers env-var over keychain (env wins on the canonical name)', async () => {
    const account = `TEST_VAR_${rng()}`
    process.env[account] = 'from-env'
    try {
      const result = await resolve({
        service: 'unused',
        accounts: [account],
      })
      expect(result).toEqual({
        value: 'from-env',
        source: 'env',
        account,
      })
    } finally {
      delete process.env[account]
    }
  })

  it.skipIf(!BACKEND_OK)(
    'falls through to keychain when env is empty',
    async () => {
      const service = `socket-lib-test-${rng()}`
      const account = `KC_ONLY_${rng()}`
      const value = `kc-value-${rng()}`
      try {
        await writeSecret({ service, account, value })
        clearCache()
        const result = await resolve({ service, accounts: [account] })
        expect(result).toEqual({ value, source: 'keychain', account })
      } finally {
        await deleteSecret({ service, account })
      }
    },
  )

  it('returns undefined when neither env nor keychain has the value', async () => {
    const result = await resolve({
      service: `nope-${rng()}`,
      accounts: [`NOPE_${rng()}`],
    })
    expect(result).toBeUndefined()
  })

  it('tries accounts in order; first non-empty env-var wins', async () => {
    const a = `CAN_${rng()}`
    const b = `LEG_${rng()}`
    process.env[b] = 'legacy'
    try {
      const result = await resolve({
        service: 'unused',
        accounts: [a, b],
      })
      expect(result).toEqual({ value: 'legacy', source: 'env', account: b })
    } finally {
      delete process.env[b]
    }
  })

  it('empty / whitespace env-var values do NOT count as a hit', async () => {
    const account = `EMPTY_${rng()}`
    process.env[account] = '   '
    try {
      const result = await resolve({
        service: `nope-${rng()}`,
        accounts: [account],
      })
      expect(result).toBeUndefined()
    } finally {
      delete process.env[account]
    }
  })

  it('resolveSync mirrors resolve()', () => {
    const account = `SYNC_${rng()}`
    process.env[account] = 'sync-value'
    try {
      const result = resolveSync({
        service: 'unused',
        accounts: [account],
      })
      expect(result).toEqual({
        value: 'sync-value',
        source: 'env',
        account,
      })
    } finally {
      delete process.env[account]
    }
  })
})

describe('secrets/keychain cache', () => {
  it.skipIf(!BACKEND_OK)(
    'subsequent reads of the same key skip the OS call',
    async () => {
      const service = `socket-lib-test-${rng()}`
      const account = `CACHED_${rng()}`
      const value = `cv-${rng()}`
      try {
        await writeSecret({ service, account, value })
        // First read after write: hits the post-write cache slot
        // set by writeSecret. Result should be the same value.
        const first = await readSecret({ service, account })
        expect(first).toBe(value)
        // Now wipe the entry from the keychain directly via
        // deleteSecret (which also invalidates the cache).
        await deleteSecret({ service, account })
        // After invalidation, a fresh read hits the keychain again
        // and finds the entry gone.
        const afterDelete = await readSecret({ service, account })
        expect(afterDelete).toBeUndefined()
      } finally {
        await deleteSecret({ service, account })
      }
    },
  )

  it.skipIf(!BACKEND_OK)(
    'clearCache forces a re-read on the next call',
    async () => {
      const service = `socket-lib-test-${rng()}`
      const account = `CLEAR_${rng()}`
      const value = `clr-${rng()}`
      try {
        await writeSecret({ service, account, value })
        // Read once to populate the cache.
        expect(await readSecret({ service, account })).toBe(value)
        clearCache()
        // After clearing, the next call shells out again. Same value
        // since we haven't changed the keychain.
        expect(await readSecret({ service, account })).toBe(value)
      } finally {
        await deleteSecret({ service, account })
      }
    },
  )
})
