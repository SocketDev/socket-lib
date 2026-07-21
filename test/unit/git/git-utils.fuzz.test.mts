/**
 * @file Property/fuzz tests (fast-check, Tier 3 — a seeded harness driving the
 *   real SUTs over generated repo trees) for the git utils. fast-check
 *   generates adversarial file NAMES — non-ASCII, spaces, quotes, `#`/`!`/`$` —
 *   that a hand-picked example set misses.
 *
 *   - `getTrackedIgnoredFiles` uses `-z` (NUL-delimited, zero quoting), so the
 *     strong property holds: every generated tracked-ignored name comes back
 *     BYTE-FOR-BYTE. This is the direct regression guard for the quoting bug.
 *   - `getTreeManifest` is newline-delimited (its output is hashed into a pin
 *     that must stay stable), so git still C-quotes some pathological names;
 *     the property there is the one that actually matters — the manifest is
 *     DETERMINISTIC (the pin can't shift). Verbatim non-ASCII rendering is
 *     covered by the concrete example test in tree.test.mts. Each run spins a
 *     real temp repo, so numRuns + the per-test timeout are tuned for
 *     wall-clock: the ls-files probe reads the INDEX (stage-only, no commit);
 *     only the ls-tree probe needs a single commit.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { getTrackedIgnoredFiles } from '../../../src/git/ignored'
import { getTreeManifest } from '../../../src/git/tree'
import { spawnSync } from '../../../src/process/spawn/child'
import { runWithTempDir } from '../util/temp-file-helper'

const TIMEOUT_MS = 60_000

// A diverse-but-filesystem-valid single path component. Keep the chars that
// exercise git path handling — space, quotes, `#`/`!`/`$`, and the whole
// non-ASCII range (the quotePath surface). Drop only what can't be ONE path
// component or is noise here: `/` (0x2f) and a backslash (0x5c —
// normalizePath maps it to `/`, out of scope), plus every C0 control byte
// (<= 0x1f) and DEL (0x7f) — git ALWAYS octal-escapes those regardless of
// core.quotePath, so they're unrelated to the non-ASCII escaping under test and
// are filesystem-flaky. Map, never filter.
const genName = fc.string({ minLength: 1, maxLength: 24 }).map(s => {
  let cleaned = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c <= 0x1f || c === 0x7f || c === 0x2f || c === 0x5c) {
      continue
    }
    cleaned += ch
  }
  return cleaned === '' || cleaned === '.' || cleaned === '..'
    ? `x${cleaned.length}`
    : cleaned
})

const genNames = fc.uniqueArray(genName, { minLength: 1, maxLength: 4 })

describe('git utils — property/fuzz over adversarial file names', () => {
  test(
    'getTrackedIgnoredFiles round-trips every tracked-ignored name verbatim (-z)',
    async () => {
      await fc.assert(
        fc.asyncProperty(genNames, async names => {
          await runWithTempDir(async dir => {
            spawnSync('git', ['init'], { cwd: dir })
            await fs.mkdir(path.join(dir, 'gen'))
            // oxlint-disable-next-line socket/prefer-all-settled -- fail-fast: a failed fixture write must abort the run
            await Promise.all(
              names.map(n => fs.writeFile(path.join(dir, 'gen', n), 'x\n')),
            )
            // Stage into the index (ls-files -ci reads the index, not commits);
            // then ignore gen/ so its staged contents are tracked-AND-ignored.
            // `-f`: the caller's GLOBAL excludes may match a generated name
            // (e.g. `*~` backup files), and a plain add would silently skip it.
            spawnSync('git', ['add', '-f', 'gen'], { cwd: dir })
            await fs.writeFile(path.join(dir, '.gitignore'), 'gen/\n')
            const expected = names.map(n => `gen/${n}`).toSorted()
            expect(await getTrackedIgnoredFiles({ cwd: dir })).toEqual(expected)
          })
        }),
        { numRuns: 20 },
      )
    },
    TIMEOUT_MS,
  )

  test(
    'getTreeManifest is deterministic + non-empty over adversarial names',
    async () => {
      await fc.assert(
        fc.asyncProperty(genNames, async names => {
          await runWithTempDir(async dir => {
            spawnSync('git', ['init'], { cwd: dir })
            spawnSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir })
            spawnSync('git', ['config', 'user.name', 'T'], { cwd: dir })
            spawnSync('git', ['config', 'commit.gpgsign', 'false'], {
              cwd: dir,
            })
            // oxlint-disable-next-line socket/prefer-all-settled -- fail-fast: a failed fixture write must abort the run
            await Promise.all(
              names.map(n => fs.writeFile(path.join(dir, n), 'x\n')),
            )
            // `-f`: force past the caller's global excludes (e.g. `*~`) so every
            // generated name lands in the commit.
            spawnSync('git', ['add', '-f', '-A'], { cwd: dir })
            spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir })
            const manifest = await getTreeManifest('HEAD', { cwd: dir })
            expect(manifest.length).toBeGreaterThan(0)
            // Same ref → byte-identical manifest: the content pin can't shift.
            expect(await getTreeManifest('HEAD', { cwd: dir })).toBe(manifest)
          })
        }),
        { numRuns: 20 },
      )
    },
    TIMEOUT_MS,
  )
})
