/**
 * @file Unit tests for `runCli`'s command dispatch - the layer between the
 *   argv and the three engines. What is tested here is the wiring nobody else
 *   sees: which directory each command defaults to scanning, which failures
 *   abort before any work happens, how the audit filter flags partition the
 *   findings, and which stream each half of the output lands on. Every run uses
 *   an explicit `--surface` so the test asserts dispatch rather than the
 *   surface search, which has its own suite.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/cli.mts'

const tmpDirs: string[] = []

/**
 * Thrown in place of a real `process.exit` so a `fail()` call stops the run
 * the way it would in production instead of falling through.
 */
class ExitSignal extends Error {}

let stdout: ReturnType<typeof vi.spyOn>
let stderr: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new ExitSignal('exit')
  }) as never)
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

function out(): string {
  return stdout.mock.calls.map(call => String(call[0])).join('')
}

function err(): string {
  return stderr.mock.calls.map(call => String(call[0])).join('')
}

/**
 * A target tree. `files` keys are paths relative to the target root, so a test
 * can populate `src/`, `dist/`, or both.
 */
function target(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-cli-cmd-'))
  tmpDirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

/**
 * A primordials surface file written outside any target tree, passed via
 * `--surface` so the lookup order never enters the picture.
 */
function surface(names: string[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-cli-surface-'))
  tmpDirs.push(root)
  const abs = path.join(root, 'primordials.ts')
  writeFileSync(
    abs,
    names.map(name => `export const ${name} = 1`).join('\n') + '\n',
    'utf8',
  )
  return abs
}

/**
 * Run the CLI and report whether it bailed out through `fail()`.
 */
async function run(argv: string[]): Promise<{ exited: boolean }> {
  try {
    await runCli(argv)
    return { exited: false }
  } catch (e) {
    if (e instanceof ExitSignal) {
      return { exited: true }
    }
    throw e
  }
}

describe('argument rejection', () => {
  it('bails out on an unrecognized flag and reprints the help', async () => {
    expect((await run(['audit', '--nope'])).exited).toBe(true)
    expect(err()).toContain('prim:')
    expect(err()).toContain('USAGE')
  })

  it('prints help when a command is missing but flags are present', async () => {
    await run(['--target', '.'])
    expect(out()).toContain('prim')
    expect(out()).toContain('USAGE')
  })

  it('prints the describe envelope for --json with no command', async () => {
    await run(['--target', '.', '--json'])
    expect(Object.keys(JSON.parse(out())).toSorted()).toEqual([
      'describe',
      'help',
    ])
  })

  it('prints help for an explicit --help beside a command', async () => {
    await run(['audit', '--help'])
    expect(out()).toContain('USAGE')
  })

  it('names an unknown command rather than doing nothing', async () => {
    const root = target({ 'src/example.mjs': 'const a = 1\n' })
    const result = await run([
      'frobnicate',
      '--target',
      root,
      '--surface',
      surface(['ObjectKeys']),
    ])
    expect(result.exited).toBe(true)
    expect(err()).toContain('unknown command: frobnicate')
  })
})

describe('resolving the tree to scan', () => {
  it('rejects a target path that does not exist', async () => {
    const missing = path.join(os.tmpdir(), 'prim-absent-target')
    const result = await run(['audit', '--target', missing])
    expect(result.exited).toBe(true)
    expect(err()).toContain('target not found')
  })

  it('defaults audit to dist/ and says how to fix a missing one', async () => {
    // Auditing bundled output is the default because that is where vendored
    // code has already been inlined; a source-only checkout needs --dir src.
    const root = target({ 'src/example.mjs': 'const a = 1\n' })
    const result = await run(['audit', '--target', root])
    expect(result.exited).toBe(true)
    expect(err()).toContain('`dist/` not found')
    expect(err()).toContain('--dir src')
  })

  it('defaults lint to src/', async () => {
    const root = target({ 'dist/example.mjs': 'const a = 1\n' })
    const result = await run(['lint', '--target', root])
    expect(result.exited).toBe(true)
    expect(err()).toContain('`src/` not found')
  })

  it('honours an explicit --dir', async () => {
    const root = target({ 'build/example.mjs': 'const a = 1\n' })
    const result = await run([
      'audit',
      '--target',
      root,
      '--dir',
      'build',
      '--surface',
      surface(['ObjectKeys']),
    ])
    expect(result.exited).toBe(false)
  })
})

describe('the lint command', () => {
  it('runs without a primordials surface', async () => {
    // Lint is purely structural, so requiring --surface would be a pointless
    // barrier on a lint-only check.
    const root = target({
      'src/example.mjs': 'const { Array } = primordials\n',
    })
    const result = await run(['lint', '--target', root])
    expect(result.exited).toBe(false)
    expect(out()).toContain('ctor-rename')
  })

  it('exits non-zero when it finds a violation', async () => {
    const root = target({
      'src/example.mjs': 'const { Array } = primordials\n',
    })
    await run(['lint', '--target', root])
    expect(process.exitCode).toBe(1)
  })

  it('leaves the exit code alone on a clean tree', async () => {
    const root = target({
      'src/example.mjs': 'const { Array: ArrayCtor } = primordials\n',
    })
    await run(['lint', '--target', root])
    expect(process.exitCode).toBe(undefined)
  })

  it('emits a lint-tagged JSON envelope for --json', async () => {
    const root = target({
      'src/example.mjs': 'const { Array } = primordials\n',
    })
    await run(['lint', '--target', root, '--json'])
    const payload = JSON.parse(out())
    expect(payload.mode).toBe('lint')
    expect(payload.count).toBe(1)
  })

  it('accepts a repeated --primordials-source', async () => {
    const root = target({
      'src/example.mjs': 'const { Array } = safeReferences\n',
    })
    await run([
      'lint',
      '--target',
      root,
      '--primordials-source',
      'safeReferences',
      '--primordials-source',
      'primordials',
      '--json',
    ])
    expect(JSON.parse(out()).count).toBe(1)
  })

  it('accepts a single --primordials-source', async () => {
    const root = target({
      'src/example.mjs': 'const { Array } = safeReferences\n',
    })
    await run([
      'lint',
      '--target',
      root,
      '--primordials-source',
      'safeReferences',
      '--json',
    ])
    expect(JSON.parse(out()).count).toBe(1)
  })
})

describe('loading the surface', () => {
  it('bails out when --surface names a missing file', async () => {
    const root = target({ 'dist/example.mjs': 'const a = 1\n' })
    const result = await run([
      'audit',
      '--target',
      root,
      '--surface',
      path.join(root, 'absent.ts'),
    ])
    expect(result.exited).toBe(true)
    expect(err()).toContain('--surface path not found')
  })
})

describe('the audit command', () => {
  const SOURCE = 'const keys = Object.keys(o)\nconst n = Number.parseInt(s)\n'

  async function auditRun(extra: string[] = []) {
    const root = target({ 'dist/example.mjs': SOURCE })
    await run([
      'audit',
      '--target',
      root,
      '--surface',
      surface(['ObjectKeys']),
      ...extra,
    ])
  }

  it('reports covered and gap findings together by default', async () => {
    await auditRun(['--json'])
    const payload = JSON.parse(out())
    expect(payload.mode).toBe('audit')
    const kinds = new Set(payload.findings.map((f: { kind: string }) => f.kind))
    expect(kinds.has('covered')).toBe(true)
    expect(kinds.has('gap')).toBe(true)
  })

  it('keeps only the migration candidates for --coverage', async () => {
    await auditRun(['--json', '--coverage'])
    const payload = JSON.parse(out())
    expect(payload.mode).toBe('coverage')
    expect(
      payload.findings.every((f: { kind: string }) => f.kind !== 'gap'),
    ).toBe(true)
    expect(payload.findings.length).toBeGreaterThan(0)
  })

  it('keeps only the surface gaps for --gaps', async () => {
    await auditRun(['--json', '--gaps'])
    const payload = JSON.parse(out())
    expect(payload.mode).toBe('gaps')
    expect(
      payload.findings.every((f: { kind: string }) => f.kind === 'gap'),
    ).toBe(true)
    expect(payload.findings.length).toBeGreaterThan(0)
  })

  it('treats both flags together as the unfiltered audit', async () => {
    await auditRun(['--json', '--coverage', '--gaps'])
    const payload = JSON.parse(out())
    expect(payload.mode).toBe('audit')
    const kinds = new Set(payload.findings.map((f: { kind: string }) => f.kind))
    expect(kinds.has('covered')).toBe(true)
    expect(kinds.has('gap')).toBe(true)
  })

  it('writes human findings to stdout', async () => {
    await auditRun()
    expect(out()).toContain('ObjectKeys')
    expect(err()).toBe('')
  })
})

describe('the audit command with unreadable files', () => {
  it('warns on stderr and lists every skipped file', async () => {
    // stdout has to stay pipeable, so the incompleteness warning goes to
    // stderr - but it must still name the files or the audit looks complete.
    const root = target({
      'dist/broken.mjs': 'const = = =\n',
      'dist/broken.mts': 'const a: = = 1\n',
      'dist/fine.mjs': 'Object.keys(o)\n',
    })
    await run(['audit', '--target', root, '--surface', surface(['ObjectKeys'])])
    const text = err()
    expect(text).toContain('2 file(s) skipped')
    expect(text).toContain('parse-failed (1)')
    expect(text).toContain('broken.mjs')
    expect(text).toContain('ts-strip-failed (1)')
    expect(text).toContain('broken.mts')
  })

  it('keeps the warning out of the JSON stream', async () => {
    const root = target({ 'dist/broken.mjs': 'const = = =\n' })
    await run([
      'audit',
      '--target',
      root,
      '--json',
      '--surface',
      surface(['ObjectKeys']),
    ])
    expect(err()).toBe('')
    expect(JSON.parse(out()).parseFailures).toBe(1)
  })
})

describe('the mod command', () => {
  it('defaults to a dry run and reports what it would write', async () => {
    const root = target({ 'src/example.mjs': 'const keys = Object.keys(o)\n' })
    const result = await run([
      'mod',
      '--target',
      root,
      '--surface',
      surface(['ObjectKeys']),
      '--json',
    ])
    expect(result.exited).toBe(false)
    expect(JSON.parse(out()).applied).toBe(false)
  })

  it('emits relative imports when the tree owns a split surface', async () => {
    // Importing '@socketsecurity/lib/primordials' from inside socket-lib
    // itself would be a self-import; the relative form is the only safe one.
    const root = target({
      'src/consumer.mjs': 'const keys = Object.keys(o)\n',
      'src/primordials/object.js': 'export const ObjectKeys = 1\n',
    })
    await run([
      'mod',
      '--target',
      root,
      '--surface',
      path.join(root, 'src', 'primordials'),
      '--json',
    ])
    const payload = JSON.parse(out())
    expect(payload.rewriteCount).toBeGreaterThan(0)
  })

  it('emits a single relative import for a legacy one-file surface', async () => {
    const root = target({
      'src/consumer.mjs': 'const keys = Object.keys(o)\n',
      'src/primordials.mjs': 'export const ObjectKeys = 1\n',
    })
    await run([
      'mod',
      '--target',
      root,
      '--surface',
      path.join(root, 'src', 'primordials.mjs'),
      '--json',
    ])
    expect(JSON.parse(out()).rewriteCount).toBeGreaterThan(0)
  })
})
