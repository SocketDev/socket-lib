import process from 'node:process'

import { describe, expect, test } from 'vitest'

import { getJreArch } from '../../../../src/external-tools/jre/detect-platform-arch'

const SUPPORTED = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
  'win-arm64',
  'win-x64',
]

describe('external-tools/jre/detect-platform-arch — getJreArch', () => {
  test('returns a supported Adoptium key for the current host (or undefined)', () => {
    const arch = getJreArch()
    if (arch !== undefined) {
      expect(SUPPORTED).toContain(arch)
    }
  })

  test('uses win not win32 in the platform segment', () => {
    const arch = getJreArch()
    if (arch !== undefined) {
      expect(arch.startsWith('win32-')).toBe(false)
    }
  })

  test('only carries a -musl suffix on linux', () => {
    const arch = getJreArch()
    if (arch?.endsWith('-musl')) {
      expect(arch.startsWith('linux-')).toBe(true)
    }
  })

  test('agrees with the host platform family', () => {
    const arch = getJreArch()
    if (arch === undefined) {
      return
    }
    if (process.platform === 'win32') {
      expect(arch.startsWith('win-')).toBe(true)
    } else if (process.platform === 'darwin') {
      expect(arch.startsWith('darwin-')).toBe(true)
    } else if (process.platform === 'linux') {
      expect(arch.startsWith('linux-')).toBe(true)
    }
  })
})

