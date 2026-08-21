/**
 * @file Unit tests for `prim lint` — the ctor-rename rule and the source
 *   classification around it.
 *   The rule exists because a destructure like `const { Array } = primordials`
 *   SHADOWS the global inside that module. Every later `Array` in the file then
 *   resolves to the primordial, which is usually what was wanted and
 *   occasionally catastrophic, and nothing in the file says so. Requiring the
 *   `<Name>Ctor` alias makes the shadowing impossible to write by accident.
 *   `lintSource` walks a real directory, so these drive real temp trees rather
 *   than a scripted filesystem: the skip lists, the extension filter and the
 *   recursion are the behavior under test, and only a real tree exercises them.
 *   Expectations are literals rather than values read back from the module, so
 *   a case cannot pass by agreeing with itself.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildLineStarts,
  classifySource,
  describeSource,
  formatLintFindings,
  lineColumnAt,
  lintSource,
} from '../src/lint.mts'

import type { AstNode, LintFinding } from '../src/lint.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * A temp tree with the given `relPath -> contents` files written into it.
 */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-lint-'))
  tmpDirs.push(root)
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, contents, 'utf8')
  }
  return root
}

function lint(
  files: Record<string, string>,
  options?: {
    primordialSources?: string[]
    skipDirs?: string[]
    skipFiles?: string[]
  },
): LintFinding[] {
  const root = tree(files)
  return lintSource({
    scanDir: root,
    targetRoot: root,
    ...(options?.primordialSources
      ? { primordialSources: options.primordialSources }
      : {}),
    ...(options?.skipDirs ? { skipDirs: options.skipDirs } : {}),
    ...(options?.skipFiles ? { skipFiles: options.skipFiles } : {}),
  })
}

function node(shape: unknown): AstNode {
  return shape as AstNode
}

describe('the ctor-rename rule', () => {
  it('flags a shorthand destructure, which shadows the global', () => {
    const findings = lint({ 'a.mjs': 'const { Array } = primordials\n' })
    expect(findings.length).toBe(1)
    expect(findings[0]!.rule).toBe('ctor-rename')
    expect(findings[0]!.name).toBe('Array')
    expect(findings[0]!.expected).toBe('ArrayCtor')
    expect(findings[0]!.source).toBe('primordials')
  })

  it('accepts the <Name>Ctor alias', () => {
    expect(
      lint({ 'a.mjs': 'const { Array: ArrayCtor } = primordials\n' }),
    ).toEqual([])
  })

  it('flags an alias that is not <Name>Ctor', () => {
    // `Array: A` avoids the shadow but loses the convention that makes the
    // alias recognizable at every call site.
    const findings = lint({ 'a.mjs': 'const { Array: A } = primordials\n' })
    expect(findings.length).toBe(1)
    expect(findings[0]!.name).toBe('Array')
  })

  it('ignores a destructured name that is not constructor-shaped', () => {
    // A non-constructor cannot shadow a global constructor, so the alias
    // convention does not apply.
    expect(lint({ 'a.mjs': 'const { keys } = primordials\n' })).toEqual([])
  })

  it('ignores a destructure from an unrelated module', () => {
    expect(lint({ 'a.mjs': 'const { Array } = myHelpers\n' })).toEqual([])
  })

  it('flags the require form', () => {
    const findings = lint({
      'a.cjs': "const { Array } = require('primordials')\n",
    })
    expect(findings.length).toBe(1)
    expect(findings[0]!.source).toBe("require('primordials')")
  })

  it('ignores a non-destructuring declarator', () => {
    expect(lint({ 'a.mjs': 'const p = primordials\n' })).toEqual([])
  })

  it('reports one finding per offending name', () => {
    const findings = lint({
      'a.mjs': 'const { Array, Set: SetCtor, Map } = primordials\n',
    })
    expect(findings.map(f => f.name)).toEqual(['Array', 'Map'])
  })

  it('reports the line and column of the offending key', () => {
    const findings = lint({
      'a.mjs': '// leading comment\nconst { Array } = primordials\n',
    })
    expect(findings[0]!.line).toBe(2)
    expect(findings[0]!.column).toBe('const { '.length + 1)
  })

  it('honours a custom primordial source list', () => {
    const findings = lint(
      { 'a.mjs': 'const { Array } = mySafeRefs\n' },
      { primordialSources: ['mySafeRefs'] },
    )
    expect(findings.length).toBe(1)
  })
})

describe('the directory walk', () => {
  it('finds files in nested directories', () => {
    const findings = lint({
      'deep/nested/a.mjs': 'const { Array } = primordials\n',
    })
    expect(findings.length).toBe(1)
    expect(findings[0]!.file).toBe(path.join('deep', 'nested', 'a.mjs'))
  })

  it('reports paths relative to the target root', () => {
    const findings = lint({ 'pkg/a.mjs': 'const { Array } = primordials\n' })
    expect(path.isAbsolute(findings[0]!.file)).toBe(false)
  })

  it('skips the default vendored and cache directories', () => {
    // These hold code the project does not own, so a finding there is not
    // actionable.
    expect(
      lint({
        'node_modules/p/a.mjs': 'const { Array } = primordials\n',
        'external/a.mjs': 'const { Array } = primordials\n',
        '.cache/a.mjs': 'const { Array } = primordials\n',
      }),
    ).toEqual([])
  })

  it('honours a custom skipDirs list', () => {
    expect(
      lint(
        { 'vendor/a.mjs': 'const { Array } = primordials\n' },
        { skipDirs: ['vendor'] },
      ),
    ).toEqual([])
  })

  it('honours a skipFiles list', () => {
    expect(
      lint(
        { 'generated.mjs': 'const { Array } = primordials\n' },
        { skipFiles: ['generated.mjs'] },
      ),
    ).toEqual([])
  })

  it('ignores files whose extension is not source', () => {
    expect(lint({ 'notes.txt': 'const { Array } = primordials\n' })).toEqual([])
  })

  it('strips types before parsing a TypeScript file', () => {
    // Without the strip the annotation is a parse error and the whole file is
    // skipped, so the rule would silently not apply to any .mts source.
    const findings = lint({
      'a.mts': 'const { Array } = primordials\nconst n: number = 1\n',
    })
    expect(findings.length).toBe(1)
  })

  it('skips a file it cannot parse rather than throwing', () => {
    const findings = lint({
      'broken.mjs': 'const { = = =\n',
      'good.mjs': 'const { Array } = primordials\n',
    })
    expect(findings.map(f => f.file)).toEqual(['good.mjs'])
  })
})

describe('classifySource', () => {
  const sources = new Set(['primordials', 'safe-references'])

  it('accepts a bare identifier that names a source', () => {
    expect(
      classifySource(
        node({ type: 'Identifier', name: 'primordials' }),
        sources,
      ),
    ).toBe('primordials')
  })

  it('rejects an identifier that does not', () => {
    expect(
      classifySource(node({ type: 'Identifier', name: 'other' }), sources),
    ).toBe(undefined)
  })

  it('accepts a require of a named source', () => {
    expect(
      classifySource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [{ type: 'Literal', value: 'primordials' }],
        }),
        sources,
      ),
    ).toBe('primordials')
  })

  it('accepts a require whose trailing segment names a source', () => {
    // Paths reach the same module from different roots, so matching the tail
    // avoids forcing every prefix into the config.
    expect(
      classifySource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [
            { type: 'Literal', value: 'internal/foo/safe-references' },
          ],
        }),
        sources,
      ),
    ).toBe('internal/foo/safe-references')
  })

  it('rejects a require of an unrelated module', () => {
    expect(
      classifySource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [{ type: 'Literal', value: 'node:path' }],
        }),
        sources,
      ),
    ).toBe(undefined)
  })

  it('rejects a require with a non-literal specifier', () => {
    // A computed specifier cannot be resolved statically.
    expect(
      classifySource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [{ type: 'Identifier', name: 'spec' }],
        }),
        sources,
      ),
    ).toBe(undefined)
  })

  it('rejects a call that is not require', () => {
    expect(
      classifySource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'load' },
          arguments: [{ type: 'Literal', value: 'primordials' }],
        }),
        sources,
      ),
    ).toBe(undefined)
  })

  it('rejects an absent node', () => {
    expect(classifySource(undefined, sources)).toBe(undefined)
  })
})

describe('describeSource', () => {
  it('prints an identifier by name', () => {
    expect(
      describeSource(node({ type: 'Identifier', name: 'primordials' })),
    ).toBe('primordials')
  })

  it('prints a require call with its specifier', () => {
    expect(
      describeSource(
        node({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'require' },
          arguments: [{ type: 'Literal', value: 'primordials' }],
        }),
      ),
    ).toBe("require('primordials')")
  })

  it('falls back to the node type for any other shape', () => {
    expect(describeSource(node({ type: 'MemberExpression' }))).toBe(
      'MemberExpression',
    )
  })

  it('reports an absent node rather than throwing', () => {
    expect(describeSource(undefined)).toBe('<unknown>')
  })
})

describe('formatLintFindings', () => {
  const finding: LintFinding = {
    column: 9,
    expected: 'ArrayCtor',
    file: 'src/a.mjs',
    line: 2,
    name: 'Array',
    rule: 'ctor-rename',
    source: 'primordials',
  }

  it('says so when there is nothing to report', () => {
    expect(formatLintFindings([], { targetName: 'pkg' })).toBe(
      'pkg: no lint violations.\n',
    )
  })

  it('heads the report with the count', () => {
    const out = formatLintFindings([finding], { targetName: 'pkg' })
    expect(out).toContain('pkg (lint): 1 violation(s)')
  })

  it('gives each finding a file:line:column and the expected alias', () => {
    const out = formatLintFindings([finding], { targetName: 'pkg' })
    expect(out).toContain('[ctor-rename] src/a.mjs:2:9')
    expect(out).toContain('expected `Array: ArrayCtor`')
  })

  it('lists every finding', () => {
    const out = formatLintFindings([finding, finding], { targetName: 'pkg' })
    expect(out).toContain('2 violation(s)')
    expect(out.split('[ctor-rename]').length - 1).toBe(2)
  })
})

describe('line and column math', () => {
  it('starts a source at offset 0', () => {
    expect(buildLineStarts('')).toEqual([0])
  })

  it('records the offset after each newline', () => {
    expect(buildLineStarts('a\nbb\nc')).toEqual([0, 2, 5])
  })

  it('reports 1-based line and column', () => {
    const starts = buildLineStarts('ab\ncd')
    expect(lineColumnAt(starts, 0)).toEqual({ line: 1, column: 1 })
    expect(lineColumnAt(starts, 3)).toEqual({ line: 2, column: 1 })
    expect(lineColumnAt(starts, 4)).toEqual({ line: 2, column: 2 })
  })
})
