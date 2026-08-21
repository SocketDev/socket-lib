/**
 * @file Unit tests for the audit walk's pure helpers: file classification,
 *   line/column math, and the AST-shape predicates that recognize bundler
 *   boilerplate. These decide what the primordials audit REPORTS, so a wrong
 *   answer is expensive in both directions. A predicate that fires too little
 *   buries a real migration candidate in generated plumbing; one that fires too
 *   much marks hand-written code as machine-generated and it never gets
 *   migrated. The AST predicates read only `type` / `computed` / `object` /
 *   `property`, so the cases below are built as literal node shapes rather than
 *   parsed source. That keeps each case's shape visible at the assertion
 *   instead of implied by a snippet, and it costs no parser. Expectations are
 *   literals, never derived from the module's own constants - building an
 *   expected value from the module under test proves only that a constant
 *   equals itself.
 */

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildLineStarts,
  isBundlerHelperAssignment,
  isDeclarationFile,
  isExportsInteropGlue,
  isObjectPrototypeIdiom,
  isSourceFile,
  JS_EXTENSIONS,
  lineColumnAt,
  PARSE_OPTIONS,
  TS_EXTENSIONS,
} from '../src/audit-helpers.mts'

import type { AstNode } from '../src/source-text.mts'

// The predicates read a handful of fields, so a literal shape is a complete
// stand-in for a parsed node.
function node(shape: unknown): AstNode {
  return shape as AstNode
}

function identifier(name: string): unknown {
  return { type: 'Identifier', name }
}

function member(object: unknown, property: string, computed = false): unknown {
  return {
    type: 'MemberExpression',
    computed,
    object,
    property: identifier(property),
  }
}

describe('buildLineStarts', () => {
  it('starts every source at offset 0', () => {
    expect(buildLineStarts('')).toEqual([0])
    expect(buildLineStarts('no newline here')).toEqual([0])
  })

  it('records the offset after each newline', () => {
    // 'a\nbb\nc' — line starts at 0, then after each \n.
    expect(buildLineStarts('a\nbb\nc')).toEqual([0, 2, 5])
  })

  it('records a start after a trailing newline', () => {
    // The position after the final \n is a real line start: an offset there
    // belongs to the empty last line, not the line before it.
    expect(buildLineStarts('a\n')).toEqual([0, 2])
  })

  it('counts each newline of a blank run', () => {
    expect(buildLineStarts('\n\n')).toEqual([0, 1, 2])
  })

  it('treats CRLF as one line break, keyed on the newline', () => {
    // The \r stays on the previous line, so the next line starts after \n.
    expect(buildLineStarts('a\r\nb')).toEqual([0, 3])
  })
})

describe('lineColumnAt', () => {
  const source = 'const a = 1\nconst bb = 2\nconst c = 3'
  const starts = buildLineStarts(source)

  it('reports 1-based line and column', () => {
    // Both are 1-based, so the very first character is 1:1 rather than 0:0.
    expect(lineColumnAt(starts, 0)).toEqual({ line: 1, column: 1 })
  })

  it('reports a position mid-line', () => {
    expect(lineColumnAt(starts, 6)).toEqual({ line: 1, column: 7 })
  })

  it('reports the first column of a later line', () => {
    expect(lineColumnAt(starts, source.indexOf('const bb'))).toEqual({
      line: 2,
      column: 1,
    })
  })

  it('reports a position on the last line', () => {
    expect(lineColumnAt(starts, source.indexOf('const c') + 6)).toEqual({
      line: 3,
      column: 7,
    })
  })

  it('attributes a newline offset to the line it ends', () => {
    // The \n itself is the last character of line 1, not the first of line 2.
    expect(lineColumnAt(starts, source.indexOf('\n'))).toEqual({
      line: 1,
      column: 12,
    })
  })

  it('clamps an offset past the end to the last line', () => {
    // A stale or out-of-range offset must not read off the end of the table.
    expect(lineColumnAt(starts, source.length + 500).line).toBe(3)
  })

  it('handles a single-line source', () => {
    expect(lineColumnAt(buildLineStarts('abc'), 2)).toEqual({
      line: 1,
      column: 3,
    })
  })
})

describe('isDeclarationFile', () => {
  it('recognizes the three declaration suffixes', () => {
    // path.extname yields just `.ts` for `foo.d.ts`, so this has to read the
    // basename's secondary suffix rather than the extension.
    expect(isDeclarationFile('/project/foo.d.ts')).toBe(true)
    expect(isDeclarationFile('/project/foo.d.mts')).toBe(true)
    expect(isDeclarationFile('/project/foo.d.cts')).toBe(true)
  })

  it('does not treat ordinary sources as declarations', () => {
    expect(isDeclarationFile('/project/foo.ts')).toBe(false)
    expect(isDeclarationFile('/project/foo.mts')).toBe(false)
    expect(isDeclarationFile('/project/foo.d.tsx')).toBe(false)
  })

  it('reads the basename, not the directory', () => {
    // A directory called `x.d.ts` must not make every file inside it look like
    // a declaration.
    expect(
      isDeclarationFile(path.join('/project/declarations.d.ts', 'real.mts')),
    ).toBe(false)
  })

  it('is false for a name that merely contains .d.', () => {
    expect(isDeclarationFile('/project/foo.d.ts.map')).toBe(false)
  })
})

describe('isSourceFile', () => {
  it('walks TypeScript sources', () => {
    for (const ext of ['.cts', '.mts', '.ts', '.tsx']) {
      expect(isSourceFile(`/p/file${ext}`)).toBe(true)
    }
  })

  it('walks JavaScript sources', () => {
    for (const ext of ['.cjs', '.js', '.jsx', '.mjs']) {
      expect(isSourceFile(`/p/file${ext}`)).toBe(true)
    }
  })

  it('skips a declaration file even though its extension is walked', () => {
    // A `.d.ts` has no runtime code, so it can never hold a call site. The
    // declaration check has to win over the extension check.
    expect(isSourceFile('/project/types.d.ts')).toBe(false)
  })

  it('skips everything else', () => {
    expect(isSourceFile('/project/data.json')).toBe(false)
    expect(isSourceFile('/project/README.md')).toBe(false)
    expect(isSourceFile('/project/Makefile')).toBe(false)
  })
})

describe('isObjectPrototypeIdiom', () => {
  it('recognizes Object.prototype.<method>', () => {
    // Already-correct hardening, so reporting it would be noise.
    expect(
      isObjectPrototypeIdiom(
        node(
          member(member(identifier('Object'), 'prototype'), 'hasOwnProperty'),
        ),
      ),
    ).toBe(true)
  })

  it('recognizes it for any prototype method, not a fixed list', () => {
    expect(
      isObjectPrototypeIdiom(
        node(member(member(identifier('Object'), 'prototype'), 'toString')),
      ),
    ).toBe(true)
  })

  it('rejects a different constructor', () => {
    expect(
      isObjectPrototypeIdiom(
        node(member(member(identifier('Array'), 'prototype'), 'slice')),
      ),
    ).toBe(false)
  })

  it('rejects a non-prototype property', () => {
    expect(
      isObjectPrototypeIdiom(
        node(member(member(identifier('Object'), 'keys'), 'call')),
      ),
    ).toBe(false)
  })

  it('rejects a computed access, which could be anything at runtime', () => {
    expect(
      isObjectPrototypeIdiom(
        node(
          member(
            member(identifier('Object'), 'prototype'),
            'hasOwnProperty',
            true,
          ),
        ),
      ),
    ).toBe(false)
  })

  it('rejects a plain identifier', () => {
    expect(isObjectPrototypeIdiom(node(identifier('Object')))).toBe(false)
  })
})

describe('isExportsInteropGlue', () => {
  function defineProperty(firstArg: unknown): AstNode {
    return node({
      type: 'CallExpression',
      callee: member(identifier('Object'), 'defineProperty'),
      arguments: [firstArg],
    })
  }

  it('recognizes Object.defineProperty(exports, …)', () => {
    expect(isExportsInteropGlue(defineProperty(identifier('exports')))).toBe(
      true,
    )
  })

  it('recognizes Object.defineProperty(module.exports, …)', () => {
    expect(
      isExportsInteropGlue(
        defineProperty(member(identifier('module'), 'exports')),
      ),
    ).toBe(true)
  })

  it('rejects a defineProperty on anything else', () => {
    // Only the exports target is generated plumbing; a defineProperty on a
    // real object is user code worth reporting.
    expect(isExportsInteropGlue(defineProperty(identifier('target')))).toBe(
      false,
    )
  })

  it('rejects a computed module[exports]', () => {
    expect(
      isExportsInteropGlue(
        defineProperty(member(identifier('module'), 'exports', true)),
      ),
    ).toBe(false)
  })

  it('rejects a different Object method', () => {
    expect(
      isExportsInteropGlue(
        node({
          type: 'CallExpression',
          callee: member(identifier('Object'), 'keys'),
          arguments: [identifier('exports')],
        }),
      ),
    ).toBe(false)
  })

  it('rejects a call with no arguments', () => {
    expect(
      isExportsInteropGlue(
        node({
          type: 'CallExpression',
          callee: member(identifier('Object'), 'defineProperty'),
          arguments: [],
        }),
      ),
    ).toBe(false)
  })

  it('rejects a bare callee', () => {
    expect(
      isExportsInteropGlue(
        node({
          type: 'CallExpression',
          callee: identifier('defineProperty'),
          arguments: [identifier('exports')],
        }),
      ),
    ).toBe(false)
  })
})

describe('isBundlerHelperAssignment', () => {
  const declarator = (name: string): unknown => ({
    type: 'VariableDeclarator',
    id: identifier(name),
  })

  it('recognizes an assignment to a __-prefixed local', () => {
    // esbuild's CJS preamble assigns Object.defineProperty and friends to
    // __-prefixed locals. The helpers use the locals, so there is nothing to
    // migrate at the assignment.
    expect(
      isBundlerHelperAssignment([
        node({ type: 'Program' }),
        node(declarator('__defProp')),
      ]),
    ).toBe(true)
  })

  it('rejects an assignment to an ordinary local', () => {
    expect(
      isBundlerHelperAssignment([
        node({ type: 'Program' }),
        node(declarator('defineProp')),
      ]),
    ).toBe(false)
  })

  it('reads the NEAREST declarator, ancestors being root-first', () => {
    // A `__`-named outer declarator must not excuse an inner one.
    expect(
      isBundlerHelperAssignment([
        node(declarator('__outer')),
        node(declarator('inner')),
      ]),
    ).toBe(false)
  })

  it('stops at a function boundary', () => {
    // Inside a function body the enclosing declarator is a different scope, so
    // its name says nothing about this call site.
    expect(
      isBundlerHelperAssignment([
        node(declarator('__defProp')),
        node({ type: 'FunctionDeclaration' }),
      ]),
    ).toBe(false)
  })

  it('stops at an arrow-function boundary', () => {
    expect(
      isBundlerHelperAssignment([
        node(declarator('__defProp')),
        node({ type: 'ArrowFunctionExpression' }),
      ]),
    ).toBe(false)
  })

  it('stops at the program boundary', () => {
    expect(isBundlerHelperAssignment([node({ type: 'Program' })])).toBe(false)
  })

  it('is false with no ancestors', () => {
    expect(isBundlerHelperAssignment([])).toBe(false)
  })

  it('rejects a declarator whose id is destructured', () => {
    // `var { defineProperty: __defProp } = Object` has an ObjectPattern id, so
    // there is no single name to test.
    expect(
      isBundlerHelperAssignment([
        node({ type: 'VariableDeclarator', id: { type: 'ObjectPattern' } }),
      ]),
    ).toBe(false)
  })
})

describe('the walked extension sets', () => {
  it('cover the TypeScript extensions', () => {
    for (const ext of ['.cts', '.mts', '.ts', '.tsx']) {
      expect(TS_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  it('cover the JavaScript extensions', () => {
    for (const ext of ['.cjs', '.js', '.jsx', '.mjs']) {
      expect(JS_EXTENSIONS.has(ext)).toBe(true)
    }
  })

  it('keeps the two sets disjoint', () => {
    // An extension in both would make the union check ambiguous about which
    // dialect the walker is parsing.
    for (const ext of TS_EXTENSIONS) {
      expect(JS_EXTENSIONS.has(ext)).toBe(false)
    }
  })
})

describe('PARSE_OPTIONS', () => {
  it('parses modern module source with a hashbang', () => {
    // The audit walks published bundles and CLI entry points, so a hashbang or
    // a top-level await must not abort the parse and drop the whole file.
    expect(PARSE_OPTIONS.sourceType).toBe('module')
    expect(PARSE_OPTIONS.ecmaVersion).toBe('latest')
    expect(PARSE_OPTIONS.allowHashBang).toBe(true)
    expect(PARSE_OPTIONS.allowAwaitOutsideFunction).toBe(true)
    expect(PARSE_OPTIONS.allowImportExportEverywhere).toBe(true)
  })
})
