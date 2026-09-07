import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL(
    '../../../scripts/repo/build-externals/stubs/supports-hyperlinks.cjs',
    import.meta.url,
  ),
  'utf8',
)

function loadFixture(options: {
  env?: Record<string, string | undefined> | undefined
  platform?: string | undefined
  release?: string | undefined
}) {
  const reads = { stdout: 0, stderr: 0 }
  const module: { exports: unknown } = { exports: {} }
  const processFixture = {
    env: options.env ?? {},
    get stdout() {
      reads.stdout += 1
      return { isTTY: true }
    },
    get stderr() {
      reads.stderr += 1
      return { isTTY: false }
    },
  }
  vm.runInNewContext(source, {
    module,
    require(id: string) {
      if (id === 'node:process') {
        return processFixture
      }
      assert.equal(id, 'node:os')
      return {
        __proto__: null,
        platform: () => options.platform ?? 'linux',
        release: () => options.release ?? '0.0.0',
      }
    },
  })
  const exported = module.exports
  assert.ok(
    typeof exported === 'object' &&
      exported !== null &&
      'supportsHyperlink' in exported,
  )
  const support = exported.supportsHyperlink
  assert.ok(typeof support === 'function')
  return { __proto__: null, exported, reads, support }
}

describe('supports-hyperlinks consumer contract', () => {
  it.each([
    {
      name: 'forced-off',
      env: { FORCE_HYPERLINK: '0', WT_SESSION: 'example' },
      tty: true,
      expected: false,
    },
    {
      name: 'forced-on-before-ci-and-tty',
      env: { FORCE_HYPERLINK: 'true', CI: 'true' },
      tty: false,
      expected: true,
    },
    { name: 'disabled', env: { NO_HYPERLINK: '' }, tty: true, expected: false },
    {
      name: 'domterm',
      env: { DOMTERM: '1', NO_HYPERLINK: '1' },
      tty: true,
      expected: true,
    },
    {
      name: 'non-tty',
      env: { WT_SESSION: 'example' },
      tty: false,
      expected: false,
    },
    {
      name: 'ci',
      env: { CI: 'true', WT_SESSION: 'example' },
      tty: true,
      expected: false,
    },
    {
      name: 'windows-terminal',
      env: { WT_SESSION: 'example' },
      tty: true,
      expected: true,
    },
    {
      name: 'kitty',
      env: { TERM_PROGRAM: 'kitty' },
      tty: true,
      expected: true,
    },
    {
      name: 'old-iterm',
      env: {
        TERM_PROGRAM: 'iTerm.app',
        TERM_PROGRAM_VERSION: '3.0.0',
        VTE_VERSION: '1.0.0',
      },
      tty: true,
      expected: false,
    },
    {
      name: 'current-iterm',
      env: { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.1.0' },
      tty: true,
      expected: true,
    },
    {
      name: 'old-vscode',
      env: { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.71.0' },
      tty: true,
      expected: false,
    },
    {
      name: 'current-vscode',
      env: { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.72.0' },
      tty: true,
      expected: true,
    },
    {
      name: 'excluded-vte',
      env: { VTE_VERSION: '0.50.0' },
      tty: true,
      expected: false,
    },
    {
      name: 'supported-vte',
      env: { VTE_VERSION: '0.50.1' },
      tty: true,
      expected: true,
    },
    { name: 'unknown', env: {}, tty: true, expected: false },
    {
      name: 'unknown-program-vte',
      env: { TERM_PROGRAM: 'example-terminal', VTE_VERSION: '1.0.0' },
      tty: true,
      expected: true,
    },
    {
      name: 'unparseable-version',
      env: { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: 'unknown' },
      tty: true,
      expected: false,
    },
  ])('preserves $name detection', fixture => {
    const { support } = loadFixture({ env: fixture.env })
    expect(support({ isTTY: fixture.tty })).toBe(fixture.expected)
  })

  it.each([
    { release: '10.0.14392', expected: false },
    { release: '10.0.14393', expected: true },
  ])('handles Windows release $release', fixture => {
    expect(
      loadFixture({ platform: 'win32', release: fixture.release }).support({
        isTTY: true,
      }),
    ).toBe(fixture.expected)
  })

  it('keeps stream access lazy and preserves the CJS default alias', () => {
    const { exported, reads } = loadFixture({ env: { TERM_PROGRAM: 'kitty' } })
    expect(reads).toEqual({ stdout: 0, stderr: 0 })
    expect(Reflect.get(exported, 'default')).toBe(exported)
    expect(Reflect.get(exported, 'stdout')).toBe(true)
    expect(reads).toEqual({ stdout: 1, stderr: 0 })
    expect(Reflect.get(exported, 'stderr')).toBe(false)
    expect(reads).toEqual({ stdout: 1, stderr: 1 })
  })
})
