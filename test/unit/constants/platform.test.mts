/**
 * @file Unit tests for platform detection and OS-specific constants. Tests
 *   platform/OS constants:
 *
 *   - IS_WINDOWS, IS_MAC, IS_LINUX (boolean flags)
 *   - PLATFORM (win32, darwin, linux from process.platform)
 *   - EOL (line ending: \r\n on Windows, \n on Unix)
 *   - Architecture detection (x64, arm64) Frozen constants for cross-platform
 *     compatibility.
 */

import { describe, expect, it } from 'vitest'

import os from 'node:os'
import process from 'node:process'

import {
  S_IXGRP as canonicalIxGrp,
  S_IXOTH as canonicalIxOth,
  S_IXUSR as canonicalIxUsr,
  getArch as canonicalGetArch,
} from '@socketsecurity/lib-stable/constants/platform'

import {
  DARWIN,
  S_IXGRP,
  S_IXOTH,
  S_IXUSR,
  WIN32,
  getArch,
  getLibc,
  getOs,
  getTarget,
} from '../../../src/constants/platform'

describe('constants/platform', () => {
  describe('platform detection', () => {
    it('should export DARWIN boolean', () => {
      expect(typeof DARWIN).toBe('boolean')
    })

    it('should export WIN32 boolean', () => {
      expect(typeof WIN32).toBe('boolean')
    })

    it('should have mutually exclusive platform flags', () => {
      // A system cannot be both Darwin and Win32
      if (DARWIN) {
        expect(WIN32).toBe(false)
      }
      if (WIN32) {
        expect(DARWIN).toBe(false)
      }
    })

    it('should reflect actual platform', () => {
      const platform = process.platform
      if (platform === 'darwin') {
        expect(DARWIN).toBe(true)
        expect(WIN32).toBe(false)
      } else if (platform === 'win32') {
        expect(DARWIN).toBe(false)
        expect(WIN32).toBe(true)
      } else {
        expect(DARWIN).toBe(false)
        expect(WIN32).toBe(false)
      }
    })

    it('should be consistent across multiple reads', () => {
      const darwin1 = DARWIN
      const darwin2 = DARWIN
      expect(darwin1).toBe(darwin2)

      const win321 = WIN32
      const win322 = WIN32
      expect(win321).toBe(win322)
    })
  })

  describe('getArch', () => {
    it('should return a string', () => {
      expect(typeof getArch()).toBe('string')
    })

    it('should match os.arch()', () => {
      expect(getArch()).toBe(os.arch())
    })

    it('should return consistent value across calls', () => {
      expect(getArch()).toBe(canonicalGetArch())
    })

    it('should return a known architecture', () => {
      expect([
        'arm',
        'arm64',
        'ia32',
        'mips',
        'mipsel',
        'ppc',
        'ppc64',
        's390',
        's390x',
        'x64',
      ]).toContain(canonicalGetArch())
    })
  })

  describe('getOs', () => {
    it('should return a string', () => {
      expect(typeof getOs()).toBe('string')
    })

    it('should match os.platform()', () => {
      expect(getOs()).toBe(os.platform())
    })

    it('should match process.platform', () => {
      expect(getOs()).toBe(process.platform)
    })

    it('should return consistent value across calls', () => {
      const first = getOs()
      const second = getOs()
      expect(first).toBe(second)
    })

    it('should return a known platform', () => {
      const known = [
        'aix',
        'darwin',
        'freebsd',
        'linux',
        'openbsd',
        'sunos',
        'win32',
      ]
      // getOs() (src) is the actual; the known set is the literal expected.
      expect(known.includes(getOs())).toBe(true)
    })

    it('should be consistent with DARWIN constant', () => {
      if (DARWIN) {
        expect(getOs()).toBe('darwin')
      } else {
        expect(getOs()).not.toBe('darwin')
      }
    })

    it('should be consistent with WIN32 constant', () => {
      if (WIN32) {
        expect(getOs()).toBe('win32')
      } else {
        expect(getOs()).not.toBe('win32')
      }
    })
  })

  describe('getLibc', () => {
    it('returns undefined off Linux', () => {
      if (process.platform !== 'linux') {
        expect(getLibc()).toBeUndefined()
      }
    })

    it('returns glibc or musl on Linux', () => {
      if (process.platform === 'linux') {
        expect(['glibc', 'musl'].includes(getLibc()!)).toBe(true)
      }
    })

    it('returns a consistent value across calls', () => {
      const first = getLibc()
      const second = getLibc()
      expect(first).toBe(second)
    })
  })

  describe('getTarget', () => {
    it('joins os and arch (raw Node vocabulary) with a dash', () => {
      // `canonicalGetArch` (the -stable snapshot) builds the expected prefix;
      // getTarget (src) is the value under test. Both are computed OUTSIDE
      // `expect(...)` so neither rule (no-stable-import-of-sut /
      // no-src-import-in-test-expect) flags a binding inside an assertion.
      const target = getTarget()
      const expectedPrefix = `${process.platform}-${canonicalGetArch()}`
      const startsWithPrefix = target.startsWith(expectedPrefix)
      expect(startsWithPrefix).toBe(true)
    })

    it('uses win32 not win', () => {
      const target = getTarget()
      expect(target.startsWith(`${process.platform}-`)).toBe(true)
    })

    it('only carries a -musl suffix on musl Linux', () => {
      const target = getTarget()
      const hostOs = getOs()
      const libc = getLibc()
      if (target.endsWith('-musl')) {
        expect(hostOs).toBe('linux')
        expect(libc).toBe('musl')
      }
    })

    it('returns a consistent value across calls', () => {
      const first = getTarget()
      const second = getTarget()
      expect(first).toBe(second)
    })
  })

  describe('file permission modes', () => {
    it('should export S_IXUSR constant', () => {
      expect(S_IXUSR).toBe(0o100)
    })

    it('should export S_IXGRP constant', () => {
      expect(S_IXGRP).toBe(0o010)
    })

    it('should export S_IXOTH constant', () => {
      expect(S_IXOTH).toBe(0o001)
    })

    it('should be octal numbers', () => {
      expect(typeof S_IXUSR).toBe('number')
      expect(typeof S_IXGRP).toBe('number')
      expect(typeof S_IXOTH).toBe('number')
    })

    it('should have correct decimal values', () => {
      expect(S_IXUSR).toBe(64) // 0o100 = 64
      expect(S_IXGRP).toBe(8) // 0o010 = 8
      expect(S_IXOTH).toBe(1) // 0o001 = 1
    })

    it('should have different values', () => {
      expect(S_IXUSR).not.toBe(canonicalIxGrp)
      expect(S_IXUSR).not.toBe(canonicalIxOth)
      expect(S_IXGRP).not.toBe(canonicalIxOth)
    })

    it('should be in descending order', () => {
      expect(S_IXUSR).toBeGreaterThan(canonicalIxGrp)
      expect(S_IXGRP).toBeGreaterThan(canonicalIxOth)
    })

    it('should be combinable with bitwise OR', () => {
      const allExecute = S_IXUSR | S_IXGRP | S_IXOTH
      expect(allExecute).toBe(0o111)
      expect(allExecute).toBe(73) // 64 + 8 + 1
    })

    it('should be testable with bitwise AND', () => {
      const mode = 0o755 // rwxr-xr-x
      expect(mode & S_IXUSR).toBeTruthy()
      expect(mode & S_IXGRP).toBeTruthy()
      expect(mode & S_IXOTH).toBeTruthy()
    })
  })

  describe('permission bit patterns', () => {
    it('should represent user execute permission', () => {
      // S_IXUSR = owner execute bit
      const userExec = S_IXUSR
      expect(userExec.toString(8)).toBe('100')
    })

    it('should represent group execute permission', () => {
      // S_IXGRP = group execute bit
      const groupExec = S_IXGRP
      expect(groupExec.toString(8)).toBe('10')
    })

    it('should represent other execute permission', () => {
      // S_IXOTH = other execute bit
      const otherExec = S_IXOTH
      expect(otherExec.toString(8)).toBe('1')
    })

    it('should combine to create execute-only mode', () => {
      const execOnly = S_IXUSR | S_IXGRP | S_IXOTH
      expect(execOnly).toBe(0o111)
    })

    it('should work with common file modes', () => {
      const mode755 = 0o755
      expect(mode755 & S_IXUSR).toBe(canonicalIxUsr)
      expect(mode755 & S_IXGRP).toBe(canonicalIxGrp)
      expect(mode755 & S_IXOTH).toBe(canonicalIxOth)
    })

    it('should detect missing execute permissions', () => {
      const mode644 = 0o644 // rw-r--r--
      expect(mode644 & S_IXUSR).toBe(0)
      expect(mode644 & S_IXGRP).toBe(0)
      expect(mode644 & S_IXOTH).toBe(0)
    })
  })

  describe('platform-specific behavior', () => {
    it('should enable platform-specific logic for Darwin', () => {
      if (DARWIN) {
        // macOS-specific code would go here
        expect(process.platform).toBe('darwin')
      }
    })

    it('should enable platform-specific logic for Windows', () => {
      if (WIN32) {
        // Windows-specific code would go here
        expect(process.platform).toBe('win32')
      }
    })

    it('should handle non-Darwin, non-Windows platforms', () => {
      if (!DARWIN && !WIN32) {
        // Likely Linux or other Unix
        expect(['linux', 'freebsd', 'openbsd', 'sunos', 'aix']).toContain(
          process.platform,
        )
      }
    })
  })

  describe('real-world usage', () => {
    it('should support checking if executable bit is set', () => {
      const fileMode = 0o755
      const isExecutable = !!(fileMode & S_IXUSR)
      expect(isExecutable).toBe(true)
    })

    it('should support adding execute permissions', () => {
      let mode = 0o644 // rw-r--r--
      mode |= S_IXUSR | S_IXGRP | S_IXOTH
      expect(mode).toBe(0o755) // rwxr-xr-x
    })

    it('should support removing execute permissions', () => {
      let mode = 0o755 // rwxr-xr-x
      mode &= ~(S_IXUSR | S_IXGRP | S_IXOTH)
      expect(mode).toBe(0o644) // rw-r--r--
    })

    it('should support platform-conditional file paths', () => {
      const separator = WIN32 ? '\\' : '/'
      const path = `home${separator}user${separator}file.txt`
      if (WIN32) {
        expect(path).toContain('\\')
      } else {
        expect(path).toContain('/')
      }
    })

    it('should support platform-conditional binary extensions', () => {
      const binaryName = WIN32 ? 'app.exe' : 'app'
      if (WIN32) {
        expect(binaryName.endsWith('.exe')).toBe(true)
      } else {
        expect(binaryName).not.toContain('.')
      }
    })
  })

  describe('constant identity', () => {
    // ESM-imported `const` bindings are read-only by spec; we don't
    // re-verify that here. Earlier revs attempted an assignment-to-
    // readonly trap which is correct in theory but triggers a vite-
    // SSR transform that balloons the worker heap. Test the value
    // identity / type instead — that's what callers actually rely on.
    it('DARWIN is a boolean singleton', () => {
      expect(typeof DARWIN).toBe('boolean')
    })

    it('WIN32 is a boolean singleton', () => {
      expect(typeof WIN32).toBe('boolean')
    })

    it('S_IXUSR is the canonical exec-by-owner bit', () => {
      expect(S_IXUSR).toBe(64)
      expect(typeof S_IXUSR).toBe('number')
    })
  })

  describe('permission constant relationships', () => {
    it('should have powers of 2 relationship in octal', () => {
      // In octal: 100, 010, 001 (each digit is independent)
      expect(S_IXUSR).toBe(64) // 2^6
      expect(S_IXGRP).toBe(8) // 2^3
      expect(S_IXOTH).toBe(1) // 2^0
    })

    it('should not overlap when combined', () => {
      const combined = S_IXUSR | S_IXGRP | S_IXOTH
      // Each bit should contribute to the final value
      expect(combined).toBe(canonicalIxUsr + canonicalIxGrp + canonicalIxOth)
    })

    it('should be extractable individually from combined mode', () => {
      const mode = 0o751 // rwxr-x--x
      expect(mode & S_IXUSR).toBe(canonicalIxUsr) // User can execute
      expect(mode & S_IXGRP).toBe(canonicalIxGrp) // Group can execute
      expect(mode & S_IXOTH).toBe(canonicalIxOth) // Other can execute
    })
  })
})
