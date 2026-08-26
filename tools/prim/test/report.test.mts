/**
 * @file Unit tests for prim's reporters. These decide what lands on stdout
 *   versus stderr, and that split is a contract: findings go to stdout so
 *   `prim audit --json | jq` works, warnings and validation rejections go to
 *   stderr so they never corrupt that stream. The tests spy on both writers and
 *   assert which one received what, plus the exit signalling that tells CI a
 *   run failed.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fail, report, reportLint, reportMod } from '../src/report.mts'

function captureStdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

function captureStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
}

/**
 * Join every chunk a write spy received into one string, so an assertion can
 * read the output the way a terminal would.
 */
function written(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map(call => String(call[0])).join('')
}

const tmpDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * Write `content` to a fresh temp file and hand back its absolute path, so a
 * diff preview has real prior source to read.
 */
function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prim-report-'))
  tmpDirs.push(dir)
  const abs = path.join(dir, name)
  writeFileSync(abs, content, 'utf8')
  return abs
}

const COVERED_FINDING = {
  file: 'src/example.mts',
  kind: 'covered' as const,
  line: 7,
  pattern: 'items.map(fn)',
  primordial: 'ArrayPrototypeMap',
}

describe('fail', () => {
  it('writes a prim-prefixed line to stderr and exits non-zero', () => {
    const stderr = captureStderr()
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    fail('target not found')
    expect(written(stderr)).toBe('prim: target not found\n')
    expect(exit).toHaveBeenCalledWith(1)
  })
})

describe('report in JSON mode', () => {
  it('wraps the findings with the counts a consumer needs', () => {
    const stdout = captureStdout()
    report([COVERED_FINDING], true, 'example-pkg', 'audit', ['a.js'], ['b.ts'])
    const payload = JSON.parse(written(stdout))
    expect(payload).toEqual({
      count: 1,
      findings: [COVERED_FINDING],
      mode: 'audit',
      parseFailureFiles: ['a.js'],
      parseFailures: 1,
      stripFailureFiles: ['b.ts'],
      stripFailures: 1,
      targetName: 'example-pkg',
    })
  })

  it('reports zero failures when no skip lists are passed', () => {
    // The lists are optional at the call site; a missing one has to mean
    // "nothing was skipped", not "unknown".
    const stdout = captureStdout()
    report([], true, 'example-pkg', 'gaps')
    const payload = JSON.parse(written(stdout))
    expect(payload.parseFailures).toBe(0)
    expect(payload.parseFailureFiles).toEqual([])
    expect(payload.stripFailures).toBe(0)
    expect(payload.stripFailureFiles).toEqual([])
  })

  it('ends the payload with a newline so line-based readers see one record', () => {
    const stdout = captureStdout()
    report([], true, 'example-pkg', 'gaps')
    expect(written(stdout).endsWith('}\n')).toBe(true)
  })
})

describe('report in human mode', () => {
  it('writes the rendered findings text to stdout', () => {
    const stdout = captureStdout()
    report([COVERED_FINDING], false, 'example-pkg', 'audit')
    const text = written(stdout)
    expect(text).toContain('example-pkg (audit)')
    expect(text).toContain('ArrayPrototypeMap')
    expect(text).toContain('src/example.mts:7')
  })
})

describe('reportLint', () => {
  it('emits a lint-tagged JSON envelope', () => {
    const stdout = captureStdout()
    const finding = {
      file: 'src/example.mts',
      line: 3,
      message: 'constructor primordial must be aliased',
      rule: 'ctor-rename',
    }
    reportLint([finding], true, 'example-pkg')
    expect(JSON.parse(written(stdout))).toEqual({
      count: 1,
      findings: [finding],
      mode: 'lint',
      targetName: 'example-pkg',
    })
  })

  it('writes human findings text when JSON is off', () => {
    const stdout = captureStdout()
    reportLint([], false, 'example-pkg')
    expect(written(stdout)).toContain('example-pkg')
  })
})

describe('reportMod when validation rejected the batch', () => {
  it('sends the human report to stderr and sets a failing exit code', () => {
    // Nothing was written to disk, so the run must still fail loudly or a
    // scripted `prim mod --apply` reports success having changed nothing.
    const stdout = captureStdout()
    const stderr = captureStderr()
    reportMod(
      {
        validationFailed: true,
        validationFindings: [
          {
            file: 'src/example.mts',
            kind: 'self-import',
            message: 'rewrite added a self-import',
          },
        ],
      },
      false,
      true,
    )
    expect(written(stderr)).toContain('validation rejected 1 planned rewrite')
    expect(written(stdout)).toBe('')
    expect(process.exitCode).toBe(1)
  })

  it('reports the rejection as JSON with applied false', () => {
    const stdout = captureStdout()
    reportMod({ validationFailed: true, validationFindings: [] }, true, true)
    expect(JSON.parse(written(stdout))).toEqual({
      applied: false,
      validationFailed: true,
      validationFindings: [],
    })
    expect(process.exitCode).toBe(1)
  })
})

describe('reportMod in JSON mode', () => {
  it('reports the applied flag and the per-file breakdown', () => {
    const stdout = captureStdout()
    reportMod(
      {
        files: [{ file: 'src/example.mts', importAdded: true, rewrites: 2 }],
        filesChanged: 1,
        rewriteCount: 2,
        skipped: 0,
      },
      true,
      false,
    )
    expect(JSON.parse(written(stdout))).toEqual({
      applied: false,
      files: [{ file: 'src/example.mts', importAdded: true, rewrites: 2 }],
      filesChanged: 1,
      rewriteCount: 2,
      skipped: 0,
    })
  })
})

describe('reportMod in human mode', () => {
  it('says nothing is needed when there are no rewrites', () => {
    const stdout = captureStdout()
    reportMod(
      { files: [], filesChanged: 0, rewriteCount: 0, skipped: 0 },
      false,
      true,
    )
    expect(written(stdout)).toBe('mod: no rewrites needed.\n')
  })

  it('says "Wrote" after an apply and lists each file', () => {
    const stdout = captureStdout()
    reportMod(
      {
        files: [{ file: 'src/example.mts', importAdded: true, rewrites: 2 }],
        filesChanged: 1,
        rewriteCount: 2,
        skipped: 0,
      },
      false,
      true,
    )
    const text = written(stdout)
    expect(text).toContain('mod: Wrote 2 rewrite(s) across 1 file(s).')
    expect(text).toContain('src/example.mts: 2 rewrite(s), import added: yes')
    expect(text).not.toContain('dry run')
  })

  it('says "Would write" and flags the dry run when nothing was applied', () => {
    const stdout = captureStdout()
    reportMod(
      {
        files: [{ file: 'src/example.mts', importAdded: false, rewrites: 1 }],
        filesChanged: 1,
        rewriteCount: 1,
        skipped: 0,
      },
      false,
      false,
    )
    const text = written(stdout)
    expect(text).toContain('mod: Would write 1 rewrite(s) across 1 file(s).')
    expect(text).toContain('mod: dry run — pass --apply to write changes.')
    expect(text).toContain('import added: no')
  })

  it('names the flag that would pick up the skipped candidates', () => {
    const stdout = captureStdout()
    reportMod(
      { files: [], filesChanged: 1, rewriteCount: 1, skipped: 3 },
      false,
      true,
    )
    expect(written(stdout)).toContain(
      'mod: skipped 3 candidate(s) — pass --include-guessed',
    )
  })
})

describe('reportMod diff preview', () => {
  const PLAN_FILE = 'example.mts'

  function modResult(plans: unknown[]) {
    return {
      files: [{ file: PLAN_FILE, importAdded: false, rewrites: 1 }],
      filesChanged: 1,
      plans,
      rewriteCount: 1,
      skipped: 0,
    }
  }

  it('renders a unified patch per planned rewrite during a dry run', () => {
    const absPath = tmpFile(PLAN_FILE, 'const a = items.map(fn)\n')
    captureStdout()
    const log = vi
      .spyOn(getDefaultLogger(), 'log')
      .mockImplementation(() => undefined)
    reportMod(
      modResult([
        {
          absPath,
          newSource: 'const a = ArrayPrototypeMap(items, fn)\n',
          relPath: PLAN_FILE,
        },
      ]),
      false,
      false,
      true,
    )
    const patch = log.mock.calls.map(call => String(call[0])).join('')
    expect(patch).toContain(PLAN_FILE)
    expect(patch).toContain('-const a = items.map(fn)')
    expect(patch).toContain('+const a = ArrayPrototypeMap(items, fn)')
  })

  it('skips a plan whose file cannot be read rather than crashing', () => {
    // The tree can move under a long dry run; losing one preview beats
    // losing the whole report.
    const absPath = tmpFile(PLAN_FILE, 'const a = 1\n')
    captureStdout()
    const log = vi
      .spyOn(getDefaultLogger(), 'log')
      .mockImplementation(() => undefined)
    reportMod(
      modResult([
        {
          absPath: path.join(path.dirname(absPath), 'gone.mts'),
          newSource: 'const a = 2\n',
          relPath: 'gone.mts',
        },
      ]),
      false,
      false,
      true,
    )
    expect(log).not.toHaveBeenCalled()
  })

  it('prints no patch once the changes were applied', () => {
    // After `--apply` the file on disk IS the new source, so a diff would be
    // empty noise.
    const absPath = tmpFile(PLAN_FILE, 'const a = 1\n')
    captureStdout()
    const log = vi
      .spyOn(getDefaultLogger(), 'log')
      .mockImplementation(() => undefined)
    reportMod(
      modResult([{ absPath, newSource: 'const a = 2\n', relPath: PLAN_FILE }]),
      false,
      true,
      true,
    )
    expect(log).not.toHaveBeenCalled()
  })

  it('tolerates a result carrying no plans array', () => {
    captureStdout()
    const log = vi
      .spyOn(getDefaultLogger(), 'log')
      .mockImplementation(() => undefined)
    reportMod(modResult([]), false, false, true)
    expect(log).not.toHaveBeenCalled()
  })
})
