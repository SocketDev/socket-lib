/**
 * @file Tests for native-messaging/install's refusal and Linux arms. Three
 *   branches the running platform/runtime cannot produce: the too-old-Node
 *   refusal — the suite runs on a supported Node by definition — plus the
 *   missing-home failure and the Linux XDG layout. The runtime and platform
 *   constants are mocked so each is exercised where it would otherwise be
 *   dead.
 */

import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

vi.mock(import('../../../src/constants/node'), async importOriginal => ({
  ...(await importOriginal()),
  getNodeVersion: () => 'v20.0.0',
  supportsNodeStripTypes: () => false,
}))

vi.mock(import('../../../src/constants/platform'), async importOriginal => ({
  ...(await importOriginal()),
  DARWIN: false,
  WIN32: false,
}))

import {
  assertNodeStripTypesSupported,
  chromeManifestDirs,
  installNativeHost,
} from '../../../src/native-messaging/install'
import { withEnvSync } from '../../../src/env/rewire'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
  }
})

function fakeHome(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nm-linux-home-'))
  tmpDirs.push(dir)
  return dir
}

/**
 * Run `fn` with XDG_CONFIG_HOME set to `value`, or removed when undefined,
 * restoring whatever was there before. XDG is read straight off process.env by
 * the module, so it cannot go through the env rewire.
 */
function withXdg(value: string | undefined, fn: () => void): void {
  const previous = process.env['XDG_CONFIG_HOME']
  if (value === undefined) {
    delete process.env['XDG_CONFIG_HOME']
  } else {
    process.env['XDG_CONFIG_HOME'] = value
  }
  try {
    fn()
  } finally {
    if (previous === undefined) {
      delete process.env['XDG_CONFIG_HOME']
    } else {
      process.env['XDG_CONFIG_HOME'] = previous
    }
  }
}

describe('assertNodeStripTypesSupported on an unsupported Node', () => {
  it('throws naming the running version', () => {
    expect(() => assertNodeStripTypesSupported()).toThrow(/v20\.0\.0/)
  })

  it('names the detected Node manager and an upgrade hint', () => {
    // The message is the operator's whole remediation path, so it has to carry
    // more than "unsupported".
    let message = ''
    try {
      assertNodeStripTypesSupported()
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/Detected Node manager:/)
    expect(message).toMatch(/To upgrade:/)
  })

  it('blocks installNativeHost before anything is written', () => {
    // The refusal is the installer's first statement for a reason: a
    // half-installed host is worse than none.
    expect(() =>
      installNativeHost({
        allowedOrigins: ['*'],
        wrapperDir: fakeHome(),
      }),
    ).toThrow(/cannot run TypeScript directly/)
  })
})

describe('chromeManifestDirs without a home directory', () => {
  it('throws rather than resolving paths against undefined', () => {
    withEnvSync({ HOME: undefined, USERPROFILE: undefined }, () => {
      expect(() => chromeManifestDirs()).toThrow(
        /Cannot determine home directory/,
      )
    })
  })
})

describe('chromeManifestDirs on Linux', () => {
  it('uses XDG_CONFIG_HOME when it is set', () => {
    const home = fakeHome()
    const xdg = path.join(home, 'xdg')
    withEnvSync({ HOME: home, USERPROFILE: home }, () => {
      withXdg(xdg, () => {
        const dirs = chromeManifestDirs()
        expect(dirs.every(d => d.startsWith(xdg))).toBe(true)
        expect(dirs.some(d => d.includes('google-chrome'))).toBe(true)
        expect(dirs.some(d => d.includes('chromium'))).toBe(true)
      })
    })
  })

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    const home = fakeHome()
    withEnvSync({ HOME: home, USERPROFILE: home }, () => {
      withXdg(undefined, () => {
        const dirs = chromeManifestDirs()
        expect(dirs.every(d => d.startsWith(path.join(home, '.config')))).toBe(
          true,
        )
      })
    })
  })
})
