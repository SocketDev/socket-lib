/**
 * @file Unit tests for the primordial audit's visitor table.
 *   Driven through the real parser and walk over real source snippets, because
 *   the visitors' whole job is deciding which AST shapes are migration
 *   candidates. A hand-built node would let a shape pass that the parser never
 *   actually produces.
 *   The negative cases are the point. Every `return` in these visitors is a
 *   deliberate exemption - bundler boilerplate, CJS interop glue, Node module
 *   statics, accessor statics, type-narrowing calls - and an exemption that
 *   stops working turns generated plumbing into a wall of findings nobody
 *   reads, which is how the audit stops being run at all.
 *   Assertions are on the PATTERN string each finding carries, never on the
 *   primordial name. The name comes from the surface-mapping modules, so
 *   asserting it here would test those instead, and deriving an expected value
 *   from the module under test proves only that it agrees with itself.
 */

import { describe, expect, it } from 'vitest'

import { walk } from '../src/acorn-wasm.mts'
import { buildLineStarts, PARSE_OPTIONS } from '../src/audit-helpers.mts'
import { buildVisitors, nearestAncestor } from '../src/audit-visitors.mts'

import type { AuditPendingAmbiguous } from '../src/audit-visitors.mts'

interface Recorded {
  offset: number
  pattern: string
  primordial: string | undefined
}

interface Redeclared {
  name: string
  pattern: string
}

/**
 * Walk `src` and return everything the visitors recorded.
 *
 * `exported` seeds the surface the audit compares against; the redeclaration
 * check only fires for a name the surface already exports.
 */
function audit(
  src: string,
  options?:
    | { aiDisambiguate?: boolean | undefined; exported?: string[] | undefined }
    | undefined,
): {
  pending: AuditPendingAmbiguous[]
  recorded: Recorded[]
  redeclared: Redeclared[]
} {
  const recorded: Recorded[] = []
  const redeclared: Redeclared[] = []
  const pending: AuditPendingAmbiguous[] = []
  const visitors = buildVisitors({
    aiDisambiguate: options?.aiDisambiguate ?? false,
    currentFile: {
      lineStarts: buildLineStarts(src),
      relPath: 'src/sample.mts',
      src,
    },
    exported: new Set(options?.exported ?? []),
    pendingAmbiguous: pending,
    record: (_file, offset, pattern, primordial) => {
      recorded.push({ offset, pattern, primordial })
    },
    recordRedeclaration: (_file, _offset, name, pattern) => {
      redeclared.push({ name, pattern })
    },
  })
  walk(src, visitors, PARSE_OPTIONS)
  return { pending, recorded, redeclared }
}

const patterns = (
  src: string,
  options?: Parameters<typeof audit>[1] | undefined,
): string[] => audit(src, options).recorded.map(r => r.pattern)

describe('redeclaration of an exported primordial', () => {
  it('reports a bare identifier alias', () => {
    // The alias is technically "covered", but the real improvement is importing
    // the primordial instead of re-declaring it, so it gets its own kind.
    const { redeclared } = audit('const ErrorCtor = Error\n', {
      exported: ['ErrorCtor'],
    })
    expect(redeclared).toEqual([
      { name: 'ErrorCtor', pattern: 'const ErrorCtor = Error' },
    ])
  })

  it('reports a member-expression alias', () => {
    const { redeclared } = audit('const JSONParse = JSON.parse\n', {
      exported: ['JSONParse'],
    })
    expect(redeclared).toEqual([
      { name: 'JSONParse', pattern: 'const JSONParse = JSON.parse' },
    ])
  })

  it('ignores a name the surface does not export', () => {
    // Only a name already on the surface can be a redeclaration of it.
    expect(audit('const MyThing = Error\n').redeclared).toEqual([])
  })

  it('ignores a declarator with no initializer', () => {
    expect(
      audit('let ErrorCtor\n', { exported: ['ErrorCtor'] }).redeclared,
    ).toEqual([])
  })

  it('ignores a right-hand side that is not an alias', () => {
    // A call result is a value, not a primordial reference, however the
    // left-hand side is spelled.
    expect(
      audit('const ErrorCtor = makeError()\n', { exported: ['ErrorCtor'] })
        .redeclared,
    ).toEqual([])
  })

  it('ignores a computed member alias', () => {
    // `JSON['parse']` cannot be resolved to a name statically.
    expect(
      audit("const JSONParse = JSON['parse']\n", { exported: ['JSONParse'] })
        .redeclared,
    ).toEqual([])
  })

  it('ignores a destructured declarator', () => {
    expect(
      audit('const { parse: JSONParse } = JSON\n', { exported: ['JSONParse'] })
        .redeclared,
    ).toEqual([])
  })

  it('ignores a declaration inside a function, which is shadowing', () => {
    // Local shadowing is a different bug and out of scope, so the ancestor walk
    // has to stop at the function boundary.
    expect(
      audit('function f() {\n  const ErrorCtor = Error\n}\n', {
        exported: ['ErrorCtor'],
      }).redeclared,
    ).toEqual([])
  })

  it('ignores a declaration inside an arrow function', () => {
    expect(
      audit('const f = () => {\n  const ErrorCtor = Error\n}\n', {
        exported: ['ErrorCtor'],
      }).redeclared,
    ).toEqual([])
  })
})

describe('construction of a tracked global', () => {
  it('reports a new-expression', () => {
    expect(patterns('const m = new Map()\n')).toContain('new Map(...)')
  })

  it('ignores construction of an untracked class', () => {
    expect(patterns('const x = new MyThing()\n')).toEqual([])
  })

  it('ignores a computed callee', () => {
    expect(patterns('const x = new globals[name]()\n')).toEqual([])
  })
})

describe('static calls on a tracked global', () => {
  it('reports the call', () => {
    expect(patterns('Object.keys(o)\n')).toContain('Object.keys(...)')
  })

  it('ignores CJS interop glue on exports', () => {
    // Machine-generated by every bundler emitting CJS from ESM. Reporting it
    // buries the real findings.
    expect(
      patterns(
        "Object.defineProperty(exports, '__esModule', { value: true })\n",
      ),
    ).toEqual([])
  })

  it('ignores CJS interop glue on module.exports', () => {
    expect(
      patterns(
        "Object.defineProperty(module.exports, '__esModule', { value: true })\n",
      ),
    ).toEqual([])
  })

  it('ignores a plain function call', () => {
    expect(patterns('doThing(a, b)\n')).toEqual([])
  })
})

describe('prototype-method calls', () => {
  it('reports a method that maps to exactly one type', () => {
    // `.toUpperCase()` exists on String alone, so the receiver needs no guess.
    const found = patterns('const up = s.toUpperCase()\n')
    expect(found.some(p => p.includes('[method: String]'))).toBe(true)
  })

  it('ignores a Node module static', () => {
    // The receiver is a module object whatever the identifier looks like, so
    // guessing String or Array would be wrong.
    expect(patterns('path.isAbsolute(p)\n')).toEqual([])
  })

  it('reports an ambiguous method when the receiver name gives it away', () => {
    // `.test` is duck-typed everywhere, but a receiver named `re` is a regexp.
    const found = patterns('if (re.test(input)) {\n  go()\n}\n')
    expect(found.some(p => p.includes('[guessed:'))).toBe(true)
  })
})

describe('the ambiguous-method queue', () => {
  const source = 'const out = thing.then(next)\n'

  it('stays empty when AI disambiguation is off', () => {
    // Without the opt-in there is no post-walk pass to drain it, so queuing
    // would only grow memory.
    expect(audit(source).pending).toEqual([])
  })

  it('queues an unguessable receiver when the opt-in is on', () => {
    const { pending } = audit(source, { aiDisambiguate: true })
    expect(pending.length).toBe(1)
    expect(pending[0]!.methodName).toBe('then')
    expect(pending[0]!.receiverName).toBe('thing')
  })

  it('snapshots position and source by value', () => {
    // The AST is freed when the walk ends, so the disambiguator gets a copy
    // rather than a node reference.
    const { pending } = audit(`\n${source}`, { aiDisambiguate: true })
    expect(pending[0]!.line).toBe(2)
    expect(pending[0]!.column).toBeGreaterThan(0)
    expect(pending[0]!.snippet).toContain('thing.then')
  })
})

describe('bare member references to a tracked global', () => {
  it('reports the reference', () => {
    expect(patterns('const f = Object.keys\n')).toContain('Object.keys')
  })

  it('ignores the hardened Object.prototype idiom', () => {
    // Already correct, so reporting it is noise.
    expect(
      patterns('Object.prototype.hasOwnProperty.call(o, k)\n').filter(p =>
        p.startsWith('Object.prototype'),
      ),
    ).toEqual([])
  })

  it("ignores esbuild's __-prefixed helper assignment", () => {
    // The helpers use the local, so there is nothing to migrate at the
    // assignment itself.
    expect(patterns('var __defProp = Object.defineProperty\n')).toEqual([])
  })

  it('ignores a computed access', () => {
    expect(patterns('const v = Object[key]\n')).toEqual([])
  })

  it('ignores a capitalized property, which is not a method', () => {
    expect(patterns('const p = Math.PI\n')).toEqual([])
  })

  it('ignores an untracked receiver', () => {
    expect(patterns('const x = MyNamespace.helper\n')).toEqual([])
  })
})

describe('the recorded offset', () => {
  it('points at the node that produced the finding', () => {
    const src = 'const pad = "..."\nObject.keys(o)\n'
    const { recorded } = audit(src)
    const hit = recorded.find(r => r.pattern === 'Object.keys(...)')
    expect(hit?.offset).toBe(src.indexOf('Object.keys'))
  })
})

describe('the constructor name a finding names', () => {
  it('uses the Ctor suffix the surface exports', () => {
    const { recorded } = audit('new Set()\n', { exported: ['SetCtor'] })
    expect(recorded[0]?.primordial).toBe('SetCtor')
  })

  it('uses the bare global when that is what the surface exports', () => {
    // The Node bootstrap surface exports `Set`, not `SetCtor`.
    const { recorded } = audit('new Set()\n', { exported: ['Set'] })
    expect(recorded[0]?.primordial).toBe('Set')
  })

  it('names the Ctor form as the gap when the surface exports neither', () => {
    const { recorded } = audit('new Set()\n')
    expect(recorded[0]?.primordial).toBe('SetCtor')
  })
})

describe('the right-hand side a redeclaration reports', () => {
  it('marks an unreadable receiver rather than printing undefined', () => {
    // `a.b.parse` has a member expression where a global name would be, and
    // there is no name to print for it.
    const { redeclared } = audit('const JSONParse = a.b.parse\n', {
      exported: ['JSONParse'],
    })
    expect(redeclared[0]?.pattern).toBe('const JSONParse = ?.parse')
  })
})

describe('static calls the audit refuses on purpose', () => {
  it('ignores a computed method call', () => {
    expect(patterns("s['charAt'](0)\n")).toEqual([])
  })

  it('ignores a non-callable static', () => {
    expect(patterns('Error.prepareStackTrace(err, frames)\n')).toEqual([])
  })

  it('ignores a static whose return type narrows on the call site', () => {
    expect(patterns("Symbol.for('tag')\n")).toEqual([])
  })
})

describe('bare member references the audit refuses on purpose', () => {
  it('ignores a non-callable static', () => {
    expect(patterns('const f = Error.prepareStackTrace\n')).toEqual([])
  })

  it('ignores a static whose return type narrows on the call site', () => {
    expect(patterns('const f = Symbol.for\n')).toEqual([])
  })
})

describe('a method call on a guessed receiver', () => {
  it('reports it, marked as a guess', () => {
    // `re` reads as a RegExp, which is the whole of the static signal.
    expect(patterns('re.someMethod(value)\n')).toContain(
      're.someMethod(...)  [guessed: RegExp]',
    )
  })

  it('ignores a receiver whose name says nothing', () => {
    expect(patterns('thing.someMethod(value)\n')).toEqual([])
  })
})

describe('nearestAncestor', () => {
  it('skips the node itself', () => {
    const node = { start: 0, type: 'Identifier' }
    const parent = { start: 0, type: 'Program' }
    expect(nearestAncestor([parent, node], node)).toBe(parent)
  })

  it('reports nothing when the node is the only entry', () => {
    const node = { start: 0, type: 'Program' }
    expect(nearestAncestor([node], node)).toBeUndefined()
  })
})
