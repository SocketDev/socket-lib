/**
 * @file Unit tests for the two CJS stubs that make terminal-link bundleable:
 *   `stubs/has-flag.cjs` and `stubs/supports-hyperlinks.cjs`.
 *   Both replace ESM-only packages at bundle time. A stub is a
 *   re-implementation, so it can drift from the package it stands in for, and
 *   nothing else in the build would notice: the bundle would keep building and
 *   the behavior would quietly differ. These pin the parts the fleet depends
 *   on.
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const require_ = createRequire(import.meta.url)
const stubsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'scripts',
  'repo',
  'build-externals',
  'stubs',
)

const hasFlag = require_(path.join(stubsDir, 'has-flag.cjs')) as (
  flag: string,
  argv?: string[] | undefined,
) => boolean

/**
 * Load supports-hyperlinks fresh so module-scope state cannot leak.
 */
function loadSupportsHyperlinks(): {
  supportsHyperlink: (stream?: unknown | undefined) => boolean
  stdout: boolean
  stderr: boolean
} {
  const target = path.join(stubsDir, 'supports-hyperlinks.cjs')
  delete require_.cache[require_.resolve(target)]
  return require_(target)
}

const savedEnv = { ...process.env }

afterEach(() => {
  for (const key of [
    'CI',
    'DOMTERM',
    'FORCE_HYPERLINK',
    'NO_HYPERLINK',
    'TERM_PROGRAM',
    'TERM_PROGRAM_VERSION',
    'VTE_VERSION',
    'WT_SESSION',
  ]) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

describe('stubs/has-flag', () => {
  it('finds a long flag', () => {
    expect(hasFlag('foo', ['--foo'])).toBe(true)
  })

  it('finds a single-character flag with one dash', () => {
    expect(hasFlag('f', ['-f'])).toBe(true)
  })

  it('accepts an already-prefixed flag without doubling the dashes', () => {
    expect(hasFlag('--foo', ['--foo'])).toBe(true)
  })

  it('returns false when the flag is absent', () => {
    expect(hasFlag('foo', ['--bar'])).toBe(false)
  })

  it('ignores a flag that appears after the -- terminator', () => {
    // The rule that makes this more than an indexOf: everything past `--` is a
    // positional argument, not a flag for this process.
    expect(hasFlag('foo', ['--bar', '--', '--foo'])).toBe(false)
    expect(hasFlag('foo', ['--foo', '--', '--bar'])).toBe(true)
  })
})

describe('stubs/supports-hyperlinks', () => {
  it('honors FORCE_HYPERLINK in both directions', () => {
    process.env['FORCE_HYPERLINK'] = '1'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(true)
    process.env['FORCE_HYPERLINK'] = '0'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(false)
    process.env['FORCE_HYPERLINK'] = 'false'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(false)
  })

  it('reports no support under CI', () => {
    // CI logs render the escape as noise rather than a link.
    delete process.env['FORCE_HYPERLINK']
    process.env['CI'] = '1'
    process.env['TERM_PROGRAM'] = 'iTerm.app'
    process.env['TERM_PROGRAM_VERSION'] = '3.4.0'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(false)
  })

  it('gates iTerm on version 3.1', () => {
    delete process.env['FORCE_HYPERLINK']
    delete process.env['CI']
    process.env['TERM_PROGRAM'] = 'iTerm.app'
    process.env['TERM_PROGRAM_VERSION'] = '3.0.9'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(false)
    process.env['TERM_PROGRAM_VERSION'] = '3.1.0'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(true)
  })

  it('accepts the terminals with unconditional support', () => {
    delete process.env['FORCE_HYPERLINK']
    delete process.env['CI']
    for (const term of ['ghostty', 'kitty', 'rio', 'WezTerm']) {
      process.env['TERM_PROGRAM'] = term
      expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(true)
    }
  })

  it('excludes VTE 0.50.0 exactly, which upstream treats as broken', () => {
    delete process.env['FORCE_HYPERLINK']
    delete process.env['CI']
    delete process.env['TERM_PROGRAM']
    process.env['VTE_VERSION'] = '0.50.0'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(false)
    process.env['VTE_VERSION'] = '0.50.1'
    expect(loadSupportsHyperlinks().supportsHyperlink()).toBe(true)
  })

  it('reports no support for a non-TTY stream', () => {
    delete process.env['FORCE_HYPERLINK']
    delete process.env['CI']
    process.env['TERM_PROGRAM'] = 'kitty'
    expect(loadSupportsHyperlinks().supportsHyperlink({ isTTY: false })).toBe(
      false,
    )
  })

  it('exposes stdout and stderr as lazy getters', () => {
    // Values, not getters, would capture a TTY handle at import — slow and not
    // snapshot-safe. A getter re-reads the env each access, which is also what
    // makes the FORCE_HYPERLINK cases above observable.
    const mod = loadSupportsHyperlinks()
    const descriptor = Object.getOwnPropertyDescriptor(mod, 'stdout')
    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.value).toBeUndefined()
    process.env['FORCE_HYPERLINK'] = '1'
    expect(mod.stdout).toBe(true)
    process.env['FORCE_HYPERLINK'] = '0'
    expect(mod.stdout).toBe(false)
  })
})
