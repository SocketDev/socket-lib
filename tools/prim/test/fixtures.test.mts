/**
 * @file Fixture-corpus tests for `prim mod`. Each fixture under
 *   `fixtures/<name>/` is a regression contract — a scenario the tool got wrong
 *   before. The contract: copy the fixture's `input/` into a tmpdir, run
 *   `applyCodemod`, compare the result against `expected.json`. `expected.json`
 *   shape:
 *
 *   ```jsonc
 *   {
 *   // What the codemod did. `ok: false` means the batch was rejected.
 *   "ok": true,
 *   // Optional: expected validation findings (when `ok: false`).
 *   "findings": [
 *   { "kind": "self-import", "fileMatches": "^src/primordials/" }
 *   ],
 *   // Optional: per-file rewrite count + new content invariants.
 *   "files": {
 *   "src/consumer.ts": {
 *   "rewrites": 1,
 *   "importAdded": true,
 *   "contentIncludes": ["from '../primordials/array'"],
 *   "contentExcludes": ["from '@socketsecurity/lib/primordials'"]
 *   }
 *   }
 *   }
 *   ```
 *
 *   Adding a new scenario: create `fixtures/<name>/input/...` +
 *   `expected.json`. The runner picks it up automatically; no test code to
 *   write per scenario. Each fixture's input MAY include a `primordials/`
 *   directory of leaves so the codemod's split-by-leaf import wiring exercises
 *   against a realistic surface. Otherwise the codemod falls back to the
 *   package-name specifier (consumer-of-lib mode).
 */

import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import { applyCodemod } from '../src/codemod.mts'
import { findLocalPrimordials, isSplitPrimordials } from '../src/cli.mts'
import { loadPrimordialsSurface } from '../src/surface.mts'

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(here, 'fixtures')
// socket-lib's own primordials directory — the real surface the tool would
// pick up in production. Fixtures that don't ship their own primordials/
// borrow this one so the codemod has something to consult when deciding
// which calls have a primordial counterpart.
const LIB_PRIMORDIALS = path.resolve(
  here,
  '..',
  '..',
  '..',
  'src',
  'primordials',
)

interface ExpectedFile {
  readonly rewrites?: number | undefined
  readonly importAdded?: boolean | undefined
  readonly contentIncludes?: readonly string[] | undefined
  readonly contentExcludes?: readonly string[] | undefined
}

interface ExpectedFinding {
  readonly kind: string
  readonly fileMatches?: string | undefined
}

interface Expected {
  readonly ok: boolean
  readonly findings?: readonly ExpectedFinding[] | undefined
  readonly files?: Readonly<Record<string, ExpectedFile>> | undefined
}

/**
 * Set up a tmpdir from the fixture's `input/` directory + invoke the codemod.
 * Returns the path to the temp scan dir + the codemod's result so the caller
 * can assert per-fixture.
 */
async function runFixture(fixturePath: string): Promise<{
  scanDir: string
  targetRoot: string
  cleanup: () => void
  result: Awaited<ReturnType<typeof applyCodemod>>
}> {
  const inputDir = path.join(fixturePath, 'input')
  if (!existsSync(inputDir)) {
    throw new Error(`fixture ${fixturePath} has no input/ dir`)
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'prim-fixture-'))
  cpSync(inputDir, tmp, { recursive: true })
  // Match production: `prim mod` is invoked with `--dir src`, so scanDir is
  // a subdirectory of the target root. Fixtures lay their files under
  // `input/src/...` to mirror this. The runner walks the fixture's `input/`
  // tree and picks the deepest sensible scan root — `input/src` if it
  // exists, otherwise `input`. `findLocalPrimordials` then probes `scanDir`
  // and one level up, so a primordials/ at `input/src/primordials` OR
  // `input/primordials` is detected either way.
  const targetRoot = tmp
  const scanDir = existsSync(path.join(tmp, 'src'))
    ? path.join(tmp, 'src')
    : tmp
  // Two concepts here:
  // - `surfacePath`: where to read the exports map FROM. Real
  //   src/primordials/ tree owns the surface; fixtures without their own
  //   primordials borrow socket-lib's so the codemod has something to
  //   consult.
  // - `selfPrimordialsRoot`: where the codemod should refuse to write TO.
  //   Only the fixture's own primordials/ — never the borrowed lib path,
  //   which lives outside the scan root anyway.
  const fixturePrimordialsPath = findLocalPrimordials(scanDir)
  const surfacePath = fixturePrimordialsPath ?? LIB_PRIMORDIALS
  const surface = loadPrimordialsSurface(targetRoot, surfacePath)
  const localPrimordialsPath = fixturePrimordialsPath
  let importStyle: Parameters<typeof applyCodemod>[0]['importStyle']
  if (localPrimordialsPath && isSplitPrimordials(localPrimordialsPath)) {
    importStyle = {
      kind: 'esm',
      specifier: (): string => '',
      splitByLeaf: {
        exportToLeaf: surface.exportToLeaf,
        leafSpecifier: (absFile: string, leaf: string): string => {
          const fileDir = path.dirname(absFile)
          let rel = path.relative(
            fileDir,
            path.join(localPrimordialsPath, leaf),
          )
          rel = rel.replace(/\.(?:cjs|cts|js|mjs|mts|ts|tsx)$/, '')
          if (!rel.startsWith('.')) {
            rel = './' + rel
          }
          return rel
        },
      },
    }
  }
  const result = await applyCodemod({
    aiDisambiguate: false,
    apply: true,
    exported: surface.exports,
    ...(importStyle ? { importStyle } : {}),
    includeGuessed: true,
    ...(localPrimordialsPath ? { localPrimordialsPath } : {}),
    nullable: surface.nullable,
    scanDir,
    targetRoot,
    validate: true,
  })
  return {
    scanDir,
    targetRoot,
    result,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  }
}

/**
 * Walk fixtures/. Each subdirectory with an `input/` + `expected.json` is a
 * scenario. Returns a list of `{ name, dir, expected }` records ready for
 * `node:test`'s describe/test wiring.
 */
function discoverFixtures(): ReadonlyArray<{
  readonly name: string
  readonly dir: string
  readonly expected: Expected
}> {
  if (!existsSync(FIXTURES_DIR)) {
    return []
  }
  const entries = readdirSync(FIXTURES_DIR)
  const out: Array<{ name: string; dir: string; expected: Expected }> = []
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const name = entries[i]!
    const dir = path.join(FIXTURES_DIR, name)
    if (!statSync(dir).isDirectory()) {
      continue
    }
    const expectedPath = path.join(dir, 'expected.json')
    if (!existsSync(expectedPath)) {
      continue
    }
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as Expected
    out.push({ name, dir, expected })
  }
  return out
}

describe('prim mod fixture corpus', () => {
  const fixtures = discoverFixtures()
  if (fixtures.length === 0) {
    test('fixtures/ has at least one scenario', () => {
      assert.fail(
        'no fixtures discovered; add directories under tools/prim/test/fixtures/',
      )
    })
    return
  }
  for (let i = 0, { length } = fixtures; i < length; i += 1) {
    const fixture = fixtures[i]!
    test(fixture.name, async () => {
      const { result, cleanup, targetRoot } = await runFixture(fixture.dir)
      try {
        if (fixture.expected.ok) {
          assert.notEqual(
            result.validationFailed,
            true,
            `expected ok: true; got validationFailed with ${JSON.stringify(result.validationFindings, null, 2)}`,
          )
        } else {
          assert.equal(
            result.validationFailed,
            true,
            'expected ok: false; got a successful run',
          )
          const expectedFindings = fixture.expected.findings ?? []
          for (let j = 0, { length: el } = expectedFindings; j < el; j += 1) {
            const want = expectedFindings[j]!
            const match = (result.validationFindings ?? []).find(
              f =>
                f.kind === want.kind &&
                (want.fileMatches === undefined ||
                  new RegExp(want.fileMatches).test(f.file)),
            )
            assert.ok(
              match,
              `expected a finding with kind=${want.kind} fileMatches=${want.fileMatches}; got ${JSON.stringify(result.validationFindings, null, 2)}`,
            )
          }
        }
        const expectedFiles = fixture.expected.files ?? {}
        for (const [relPath, fileExpected] of Object.entries(expectedFiles)) {
          const absPath = path.join(targetRoot, relPath)
          if (fileExpected.rewrites !== undefined) {
            const fileResult = result.files.find(f => f.file === relPath)
            assert.equal(
              fileResult?.rewrites ?? 0,
              fileExpected.rewrites,
              `expected ${relPath} to have ${fileExpected.rewrites} rewrite(s); got ${fileResult?.rewrites ?? 0}`,
            )
          }
          if (fileExpected.importAdded !== undefined) {
            const fileResult = result.files.find(f => f.file === relPath)
            assert.equal(
              fileResult?.importAdded ?? false,
              fileExpected.importAdded,
              `expected ${relPath} importAdded=${fileExpected.importAdded}; got ${fileResult?.importAdded ?? false}`,
            )
          }
          if (fileExpected.contentIncludes || fileExpected.contentExcludes) {
            const actual = readFileSync(absPath, 'utf8')
            for (const needle of fileExpected.contentIncludes ?? []) {
              assert.ok(
                actual.includes(needle),
                `expected ${relPath} to include "${needle}"; full content:\n${actual}`,
              )
            }
            for (const needle of fileExpected.contentExcludes ?? []) {
              assert.ok(
                !actual.includes(needle),
                `expected ${relPath} to NOT include "${needle}"; full content:\n${actual}`,
              )
            }
          }
        }
      } finally {
        cleanup()
      }
    })
  }
})
