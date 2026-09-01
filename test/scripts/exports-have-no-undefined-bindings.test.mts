/**
 * @file Specs for scripts/repo/check/exports-have-no-undefined-bindings — the
 *   gate that IMPORTS the built code and asks whether a binding is undefined,
 *   rather than asking the graph whether one could be.
 *   The middle case is the negative control kept permanently: it plants a
 *   module graph whose cycle really does poison a binding and asserts the
 *   audit names it. A check nobody has watched fail is not evidence, and this
 *   file is where that evidence lives. The last case runs the audit over the
 *   built dist and expects nothing.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  auditUndefinedBindings,
  buildProbePlan,
  formatFinding,
  listPublicSubpathTargets,
} from '../../scripts/repo/check/exports-have-no-undefined-bindings.mts'
import {
  buildProbeSource,
  parseProbeOutput,
} from '../../scripts/repo/check/undefined-bindings-probe.mts'
import { listDistFiles } from '../../scripts/repo/check/reexports-have-no-import-cycles.mts'
import { REPO_ROOT } from '../../scripts/fleet/paths.mts'

const DIST_DIR = path.join(REPO_ROOT, 'dist')

/**
 * Write a throwaway CJS graph and return its directory. Keys are file names
 * relative to that directory, values are the file bodies.
 */
function writeGraph(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'undefined-bindings-spec-'))
  for (const { 0: name, 1: body } of Object.entries(files)) {
    const file = path.join(dir, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return dir
}

/**
 * A barrel that eagerly re-exports from a leaf that requires it back — the
 * exact topology rolldown emits and the exact one that poisons a binding when
 * the leaf is the entry point.
 */
function writePoisonedGraph(): string {
  return writeGraph({
    'barrel.js': [
      `"use strict";`,
      `const require_leaf = require('./leaf.js');`,
      `exports.leafFn = require_leaf.leafFn;`,
      '',
    ].join('\n'),
    'leaf.js': [
      `"use strict";`,
      `const require_barrel = require('./barrel.js');`,
      `function leafFn() { return require_barrel; }`,
      `exports.leafFn = leafFn;`,
      '',
    ].join('\n'),
  })
}

describe('listPublicSubpathTargets', () => {
  it('keeps a subpath whose default condition names a built .js file', () => {
    expect(
      listPublicSubpathTargets(
        { './paths/normalize': { default: './dist/paths/normalize.js' } },
        '/example/root',
      ),
    ).toEqual([
      {
        file: path.resolve('/example/root', './dist/paths/normalize.js'),
        subpath: './paths/normalize',
      },
    ])
  })

  it('drops a string-valued entry such as ./package.json', () => {
    expect(
      listPublicSubpathTargets({ './package.json': './package.json' }, '/r'),
    ).toEqual([])
  })

  it('drops a subpath whose default is not a .js file', () => {
    expect(
      listPublicSubpathTargets(
        { './data': { default: './data/extensions.json' } },
        '/r',
      ),
    ).toEqual([])
  })
})

describe('parseProbeOutput', () => {
  it('reads findings and the observed count', () => {
    expect(
      parseProbeOutput(
        JSON.stringify({
          findings: [
            {
              binding: 'exampleFn',
              file: '/path/to/barrel.js',
              source: '/path/to/leaf.js',
            },
          ],
          observed: 3,
        }),
      ),
    ).toEqual({
      findings: [
        {
          binding: 'exampleFn',
          file: '/path/to/barrel.js',
          source: '/path/to/leaf.js',
        },
      ],
      observed: 3,
    })
  })

  it('surfaces a probe that could not load its entry', () => {
    const parsed = parseProbeOutput(JSON.stringify({ error: 'boom' }))
    expect(parsed.error).toBe('boom')
    expect(parsed.findings).toEqual([])
  })

  it('treats unparseable output as an error, never as a clean run', () => {
    const parsed = parseProbeOutput('not json')
    expect(parsed.error).toMatch(/unparseable/)
    expect(parsed.findings).toEqual([])
    expect(parsed.observed).toBe(0)
  })
})

describe('buildProbeSource', () => {
  it('canonicalizes paths, because require.cache is keyed by realpath', () => {
    expect(buildProbeSource()).toContain('realpathSync')
  })
})

describe('buildProbePlan', () => {
  it('records the eager re-export a barrel performs', () => {
    const dir = writePoisonedGraph()
    const plan = buildProbePlan([
      path.join(dir, 'barrel.js'),
      path.join(dir, 'leaf.js'),
    ])
    expect(plan[path.join(dir, 'barrel.js')]).toEqual([
      {
        exported: 'leafFn',
        local: 'leafFn',
        target: path.join(dir, 'leaf.js'),
      },
    ])
  })

  it('omits a file that performs no eager re-export', () => {
    const dir = writeGraph({ 'solo.js': `"use strict";\nexports.a = 1;\n` })
    expect(buildProbePlan([path.join(dir, 'solo.js')])).toEqual({})
  })
})

describe('formatFinding', () => {
  it('names what, where, saw versus wanted, and the fix', () => {
    const text = formatFinding({
      binding: 'fromUnixPath',
      chain: ['paths/conversion.js', 'paths/normalize.js'],
      file: 'paths/normalize.js',
      source: 'paths/conversion.js',
      subpath: './paths/conversion',
    })
    expect(text).toContain('fromUnixPath is undefined at runtime.')
    expect(text).toContain('./paths/conversion')
    expect(text).toContain('paths/conversion.js -> paths/normalize.js')
    expect(text).toContain('Move the implementation of')
  })
})

describe('auditUndefinedBindings (negative control)', () => {
  it('names the binding a real cycle poisons', async () => {
    const dir = writePoisonedGraph()
    const files = [path.join(dir, 'barrel.js'), path.join(dir, 'leaf.js')]
    const plan = buildProbePlan(files)
    // Entering through the LEAF is what poisons the barrel: the barrel's eager
    // copy runs while the leaf is still on the require stack.
    const { findings, observed } = await auditUndefinedBindings(
      [{ file: path.join(dir, 'leaf.js'), subpath: './leaf' }],
      plan,
      { distDir: dir },
    )
    expect(observed).toBeGreaterThan(0)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.binding).toBe('leafFn')
    expect(findings[0]!.file).toBe('barrel.js')
    expect(findings[0]!.source).toBe('leaf.js')
    expect(findings[0]!.subpath).toBe('./leaf')
  })

  it('stays silent when the same graph is entered through the barrel', async () => {
    const dir = writePoisonedGraph()
    const plan = buildProbePlan([
      path.join(dir, 'barrel.js'),
      path.join(dir, 'leaf.js'),
    ])
    const { findings } = await auditUndefinedBindings(
      [{ file: path.join(dir, 'barrel.js'), subpath: './barrel' }],
      plan,
      { distDir: dir },
    )
    expect(findings).toEqual([])
  })

  it('does not flag a value that is simply undefined on both sides', async () => {
    const dir = writeGraph({
      'barrel.js': [
        `"use strict";`,
        `const require_leaf = require('./leaf.js');`,
        `exports.sentinel = require_leaf.sentinel;`,
        '',
      ].join('\n'),
      'leaf.js': [`"use strict";`, `exports.sentinel = void 0;`, ''].join('\n'),
    })
    const plan = buildProbePlan([
      path.join(dir, 'barrel.js'),
      path.join(dir, 'leaf.js'),
    ])
    const { findings } = await auditUndefinedBindings(
      [{ file: path.join(dir, 'barrel.js'), subpath: './barrel' }],
      plan,
      { distDir: dir },
    )
    expect(findings).toEqual([])
  })
})

describe('the built dist', () => {
  it.skipIf(!existsSync(DIST_DIR))(
    'exposes no undefined binding from any public subpath',
    async () => {
      const pkg = JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
      ) as { exports?: Record<string, unknown> | undefined }
      const targets = listPublicSubpathTargets(pkg.exports ?? {}, REPO_ROOT)
      const plan = buildProbePlan(listDistFiles(DIST_DIR))
      const { findings, observed } = await auditUndefinedBindings(targets, plan)
      expect(observed).toBeGreaterThan(0)
      expect(findings.map(f => `${f.subpath} ${f.file} ${f.binding}`)).toEqual(
        [],
      )
    },
    120_000,
  )
})
