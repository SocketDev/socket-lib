import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ensurePayload,
  planFetch,
} from '../../../scripts/repo/bootstrap/fetch-session.mts'

describe('bootstrap session fetch', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), 'session-fetch-fixture-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(repoRoot, { recursive: true, force: true })
  })

  function writeFixture(relativePath: string, content: string): string {
    const target = path.join(repoRoot, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
    return target
  }

  it('skips fetching when the hook payload exists', () => {
    writeFixture('.claude/hooks/fleet/index.cjs', '')
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    expect(planFetch(repoRoot)).toEqual({ action: 'present' })
    expect(ensurePayload(repoRoot)).toBe(0)
    expect(stderr).not.toHaveBeenCalled()
  })

  it('reports a missing fetcher in a bare checkout', () => {
    expect(planFetch(repoRoot)).toEqual({ action: 'no-fetcher' })
  })

  it('plans the local bootstrap fetcher when the payload is absent', () => {
    const fleet = writeFixture('scripts/repo/bootstrap/fleet.mjs', '')

    expect(planFetch(repoRoot)).toEqual({ action: 'fetch', fleet })
  })

  it('warns without blocking when the fetcher is missing', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    expect(ensurePayload(repoRoot)).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(stdout).not.toHaveBeenCalled()
  })

  it('keeps successful fetcher output out of session context', () => {
    writeFixture(
      'scripts/repo/bootstrap/fleet.mjs',
      [
        "import { mkdirSync, writeFileSync } from 'node:fs'",
        "if (process.argv[2] !== '--if-current') process.exit(12)",
        "mkdirSync('.claude/hooks/fleet', { recursive: true })",
        "writeFileSync('.claude/hooks/fleet/index.cjs', '')",
        "process.stdout.write('fixture progress')",
        "process.stderr.write('fixture detail')",
      ].join('\n'),
    )
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    expect(ensurePayload(repoRoot)).toBe(0)
    expect(planFetch(repoRoot)).toEqual({ action: 'present' })
    expect(stderr).not.toHaveBeenCalled()
    expect(stdout).not.toHaveBeenCalled()
  })

  it('warns and preserves diagnostics when a local fetcher fails', () => {
    writeFixture(
      'scripts/repo/bootstrap/fleet.mjs',
      "process.stderr.write('fixture failure'); process.exitCode = 7",
    )
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)

    expect(ensurePayload(repoRoot)).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(2)
    expect(stdout).not.toHaveBeenCalled()
  })
})
