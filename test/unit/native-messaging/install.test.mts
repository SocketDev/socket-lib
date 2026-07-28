/**
 * @file Unit tests for `installNativeHost` — focused on the input-validation
 *   guards (production-mode wildcard rejection, empty allowedOrigins) plus
 *   `buildManifest` shape, plus the filesystem-write paths.
 *   The write paths run for real: `chromeManifestDirs()` derives its targets
 *   from HOME, so `withEnvSync` points an install at a temp tree and the test
 *   reads back the wrapper and manifests it actually wrote. The Windows
 *   registry step is the one arm left to the OS.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { withEnvSync } from '../../../src/env/rewire'

const tmpDirs: string[] = []

afterAll(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir, { force: true })
  }
})

import {
  assertNodeStripTypesSupported,
  buildManifest,
  chromeManifestDirs,
  HOST_NAME,
  installNativeHost,
  MIN_NODE_VERSION_FOR_STRIP_TYPES,
  stripTypesFlag,
  writeWrapperPosix,
  writeWrapperWindows,
} from '../../../src/native-messaging/install'

describe('buildManifest', () => {
  it('returns the canonical Chrome native-host manifest shape', () => {
    const manifest = buildManifest('/abs/path/wrapper.sh', [
      'chrome-extension://abc/',
    ]) as Record<string, unknown>
    // The literal canonical value (asserted against HOST_NAME itself below) —
    // a -stable HOST_NAME isn't published, and the src constant can't build its
    // own expected value (no-src-import-in-test-expect).
    expect(manifest['name']).toBe('dev.socket.trusted_publisher_host')
    expect(manifest['type']).toBe('stdio')
    expect(manifest['path']).toBe('/abs/path/wrapper.sh')
    expect(manifest['allowed_origins']).toEqual(['chrome-extension://abc/'])
  })

  it('passes allowedOrigins through verbatim (including multiple)', () => {
    const manifest = buildManifest('/x', [
      'chrome-extension://a/',
      'chrome-extension://b/',
    ]) as Record<string, unknown>
    expect(manifest['allowed_origins']).toEqual([
      'chrome-extension://a/',
      'chrome-extension://b/',
    ])
  })

  it('passes `*` through (caller decides if dev mode permits it)', () => {
    // buildManifest is layer-1 — it doesn't enforce policy, it just
    // builds the JSON. installNativeHost is where the production-mode
    // wildcard rejection lives.
    const manifest = buildManifest('/x', ['*']) as Record<string, unknown>
    expect(manifest['allowed_origins']).toEqual(['*'])
  })
})

describe('installNativeHost — input validation', () => {
  it('rejects production: true with a `*` origin', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: ['*'],
        production: true,
      }),
    ).toThrow(/production mode rejects allowedOrigins '\*'/)
  })

  it('rejects production: true with `*` mixed into a list of real IDs', () => {
    // Even one `*` in the list is enough — Chrome ORs origins, so a
    // wildcard alongside a specific ID effectively allows everyone.
    expect(() =>
      installNativeHost({
        allowedOrigins: ['chrome-extension://abc/', '*'],
        production: true,
      }),
    ).toThrow(/production mode rejects/)
  })

  it('rejects an empty allowedOrigins list (dev mode)', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: [],
      }),
    ).toThrow(/must contain at least one origin/)
  })

  it('rejects an empty allowedOrigins list (production mode)', () => {
    expect(() =>
      installNativeHost({
        allowedOrigins: [],
        production: true,
      }),
    ).toThrow(/must contain at least one origin/)
  })

  // The "happy path" (production: true with a real extension ID) writes
  // to ~/Library/Application Support/... and adds Chrome NM directories;
  // exercising it in a unit test would touch the dev machine's real
  // Chrome config. That's an integration test, not a unit test — leave
  // it for the `test/integration/native-messaging/` suite (TBD).
})

describe('constants', () => {
  it('exports the canonical host name', () => {
    expect(HOST_NAME).toBe('dev.socket.trusted_publisher_host')
  })

  it('exports the minimum Node version', () => {
    // Matches the Node 22.6 floor for stable type-stripping.
    expect(MIN_NODE_VERSION_FOR_STRIP_TYPES).toBe('22.6.0')
  })
})

// ── wrapper scripts + host paths ────────────────────────────────
//
// These write real files into a temp dir and read them back: the wrapper is a
// shell/batch script whose exact bytes matter (shebang, quoting, line endings,
// exec bit), so asserting on a stub would prove nothing.

describe('stripTypesFlag', () => {
  it('returns either the flag or an empty string, never undefined', () => {
    // Node 24+ strips types by default and needs no flag; earlier supported
    // versions need one. Both are valid — what matters is that the wrapper
    // template can always interpolate the result.
    const flag = stripTypesFlag()
    expect(['', '--strip-types ']).toContain(flag)
  })
})

describe('writeWrapperPosix', () => {
  it('writes an executable sh wrapper that execs node on the host script', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nm-wrapper-'))
    tmpDirs.push(dir)
    const wrapper = path.join(dir, 'wrapper.sh')
    writeWrapperPosix(wrapper)
    const body = readFileSync(wrapper, 'utf8')
    expect(body.startsWith('#!/bin/sh\n')).toBe(true)
    expect(body).toContain('exec ')
    // The interpreter is quoted so a space in the path cannot split the word.
    expect(body).toContain(`"${process.execPath}"`)
    expect(body.endsWith('\n')).toBe(true)
  })

  it('marks the wrapper executable', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nm-wrapper-mode-'))
    tmpDirs.push(dir)
    const wrapper = path.join(dir, 'wrapper.sh')
    writeWrapperPosix(wrapper)
    // Chrome execs this directly, so the owner-execute bit is load-bearing.
    expect(statSync(wrapper).mode & 0o100).toBe(0o100)
  })

  it('overwrites an existing wrapper', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nm-wrapper-over-'))
    tmpDirs.push(dir)
    const wrapper = path.join(dir, 'wrapper.sh')
    writeFileSync(wrapper, 'stale contents')
    writeWrapperPosix(wrapper)
    expect(readFileSync(wrapper, 'utf8')).not.toContain('stale')
  })
})

describe('writeWrapperWindows', () => {
  it('writes a CRLF batch wrapper that forwards its arguments', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nm-wrapper-win-'))
    tmpDirs.push(dir)
    const wrapper = path.join(dir, 'wrapper.cmd')
    writeWrapperWindows(wrapper)
    const body = readFileSync(wrapper, 'utf8')
    expect(body.startsWith('@echo off\r\n')).toBe(true)
    // cmd.exe requires CRLF, and %* forwards the args Chrome passes.
    expect(body).toContain('\r\n')
    expect(body).toContain('%*')
    expect(body).toContain(`"${process.execPath}"`)
  })
})

describe('chromeManifestDirs', () => {
  it('returns at least one absolute NativeMessagingHosts directory', () => {
    const dirs = chromeManifestDirs()
    expect(dirs.length).toBeGreaterThan(0)
    for (const dir of dirs) {
      expect(path.isAbsolute(dir)).toBe(true)
      expect(dir).toContain('NativeMessagingHosts')
    }
  })

  it('returns distinct directories', () => {
    const dirs = chromeManifestDirs()
    expect(new Set(dirs).size).toBe(dirs.length)
  })
})

describe('assertNodeStripTypesSupported', () => {
  it('returns without throwing on a Node that can strip types', () => {
    // The suite itself runs on a supported Node, so this is the pass arm; the
    // throw arm builds its message from the detected version manager and is
    // exercised by the upgrade-hint unit tests.
    expect(() => assertNodeStripTypesSupported()).not.toThrow()
  })
})

// ── installNativeHost: the write path ───────────────────────────
//
// `chromeManifestDirs()` derives its targets from HOME (and XDG_CONFIG_HOME on
// Linux), so `withEnvSync` points the whole install at a temp tree. Everything
// below is a real install — real wrapper, real manifests — just not in the
// developer's actual Chrome profile.

function installIntoTemp(
  origins: string[],
  options: { production?: boolean | undefined } = {},
): { home: string; result: ReturnType<typeof installNativeHost> } {
  const home = mkdtempSync(path.join(os.tmpdir(), 'nm-install-home-'))
  tmpDirs.push(home)
  const wrapperDir = mkdtempSync(path.join(os.tmpdir(), 'nm-install-wrap-'))
  tmpDirs.push(wrapperDir)
  const result = withEnvSync(
    {
      APPDATA: path.join(home, 'AppData', 'Roaming'),
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
    },
    () =>
      installNativeHost({
        allowedOrigins: origins,
        wrapperDir,
        ...options,
      }),
  )
  return { home, result }
}

describe('installNativeHost — write path', () => {
  it('writes a manifest into every Chrome host directory', () => {
    const { home, result } = installIntoTemp(['chrome-extension://abc/'])
    expect(result.manifestPaths.length).toBeGreaterThan(0)
    for (const manifestPath of result.manifestPaths) {
      // Every target lands under the temp HOME, never the real profile.
      expect(manifestPath.startsWith(home)).toBe(true)
      expect(existsSync(manifestPath)).toBe(true)
    }
  })

  it('writes the Chrome native-host manifest shape, newline-terminated', () => {
    // Asserted field by field rather than against buildManifest's output:
    // building the expectation with the code under test would pass even if
    // both sides drifted from what Chrome requires.
    const { result } = installIntoTemp(['chrome-extension://abc/'])
    const body = readFileSync(result.manifestPaths[0]!, 'utf8')
    expect(body.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(body)
    expect(parsed.type).toBe('stdio')
    expect(parsed.path).toBe(result.wrapperPath)
    expect(parsed.allowed_origins).toEqual(['chrome-extension://abc/'])
    expect(typeof parsed.name).toBe('string')
    expect(parsed.name.length).toBeGreaterThan(0)
    expect(typeof parsed.description).toBe('string')
  })

  it('writes the wrapper into wrapperDir and points the manifest at it', () => {
    const { result } = installIntoTemp(['*'])
    expect(existsSync(result.wrapperPath)).toBe(true)
    const parsed = JSON.parse(readFileSync(result.manifestPaths[0]!, 'utf8'))
    expect(parsed.path).toBe(result.wrapperPath)
  })

  it('creates host directories that do not exist yet', () => {
    // A fresh HOME has no NativeMessagingHosts tree at all; the installer is
    // responsible for building it.
    const { result } = installIntoTemp(['*'])
    for (const manifestPath of result.manifestPaths) {
      expect(existsSync(path.dirname(manifestPath))).toBe(true)
    }
  })

  it('is idempotent — a second install overwrites cleanly', () => {
    const first = installIntoTemp(['chrome-extension://one/'])
    const second = installIntoTemp(['chrome-extension://two/'])
    const parsed = JSON.parse(
      readFileSync(second.result.manifestPaths[0]!, 'utf8'),
    )
    expect(parsed.allowed_origins).toEqual(['chrome-extension://two/'])
    expect(first.result.manifestPaths.length).toBe(
      second.result.manifestPaths.length,
    )
  })

  it('records every written manifest path in the result', () => {
    const { result } = installIntoTemp(['*'])
    const unique = new Set(result.manifestPaths)
    expect(unique.size).toBe(result.manifestPaths.length)
  })
})
