/**
 * @file Unit tests for the codemod's classification pass. This decides which
 *   spans of a source file get REWRITTEN, so a wrong answer edits working code.
 *   A rewrite recorded for a primordial the surface does not export produces an
 *   import of a name that does not exist; a span off by a character corrupts
 *   the file it was meant to improve. Applying each collected rewrite to the
 *   source and asserting the RESULT is the only assertion that catches a bad
 *   span. Checking a `replacement` string in isolation cannot: the text can be
 *   right while the range it replaces is wrong. The primordial names in
 *   `exported` are written as the literals the convention specifies
 *   (`<Name>Ctor`, `ObjectKeys`, `JSONParse`) rather than read from the mapping
 *   modules, so a case cannot pass by agreeing with the code under test.
 */

import { describe, expect, it } from 'vitest'

import { parse } from '../src/acorn-wasm.mts'
import { PARSE_OPTIONS } from '../src/audit-helpers.mts'
import { collectRewrites } from '../src/collect-rewrites.mts'

import type { PendingAmbiguous, Rewrite } from '../src/ai-disambiguate-pass.mts'

interface CollectResult {
  pending: PendingAmbiguous[]
  rewrites: Rewrite[]
  rewritten: string
  skipped: number
  used: string[]
}

/**
 * Classify `src` and apply whatever it collected.
 *
 * `toChar` is the identity because every source here is ASCII, which is the
 * case the real caller also short-circuits.
 */
function collect(
  src: string,
  options?:
    | {
        aiDisambiguate?: boolean | undefined
        exported?: string[] | undefined
        includeGuessed?: boolean | undefined
        isTsFile?: boolean | undefined
        nullable?: string[] | undefined
        prefix?: string | undefined
      }
    | undefined,
): CollectResult {
  const rewrites: Rewrite[] = []
  const usedPrimordials = new Set<string>()
  const pendingAmbiguous: PendingAmbiguous[] = []
  const prefix = options?.prefix ?? ''
  const { skipped } = collectRewrites({
    aiDisambiguate: options?.aiDisambiguate ?? false,
    ast: parse(src, PARSE_OPTIONS),
    exported: new Set(options?.exported ?? []),
    includeGuessed: options?.includeGuessed ?? true,
    isTsFile: options?.isTsFile ?? false,
    localName: name => `${prefix}${name}`,
    nullable: options?.nullable ? new Set(options.nullable) : undefined,
    pendingAmbiguous,
    rewrites,
    src,
    toChar: off => off,
    usedPrimordials,
  })
  // Apply back-to-front so an earlier span's edit cannot shift a later one.
  let rewritten = src
  const descending = rewrites.toSorted((a, b) => b.start - a.start)
  for (let i = 0, { length } = descending; i < length; i += 1) {
    const r = descending[i]!
    rewritten =
      rewritten.slice(0, r.start) + r.replacement + rewritten.slice(r.end)
  }
  return {
    pending: pendingAmbiguous,
    rewrites,
    rewritten,
    skipped,
    used: [...usedPrimordials],
  }
}

describe('constructor calls', () => {
  it('rewrites the callee to the primordial', () => {
    const out = collect('const m = new Map()\n', { exported: ['MapCtor'] })
    expect(out.rewritten).toBe('const m = new MapCtor()\n')
    expect(out.used).toContain('MapCtor')
  })

  it('leaves the call alone when the surface does not export it', () => {
    // Rewriting to a name the surface lacks would emit an import of nothing.
    const out = collect('const m = new Map()\n')
    expect(out.rewrites).toEqual([])
    expect(out.rewritten).toBe('const m = new Map()\n')
  })

  it('leaves an untracked constructor alone', () => {
    const out = collect('const t = new MyThing()\n', {
      exported: ['MyThingCtor'],
    })
    expect(out.rewrites).toEqual([])
  })

  it('applies the local alias prefix', () => {
    // A file that imports the surface under a prefix has to reference it that
    // way, or the rewrite names an undefined local.
    const out = collect('const m = new Map()\n', {
      exported: ['MapCtor'],
      prefix: 'p_',
    })
    expect(out.rewritten).toBe('const m = new p_MapCtor()\n')
  })

  it('preserves the arguments', () => {
    const out = collect('const m = new Map([[1, 2]])\n', {
      exported: ['MapCtor'],
    })
    expect(out.rewritten).toBe('const m = new MapCtor([[1, 2]])\n')
  })

  it('rewrites every occurrence', () => {
    const out = collect('new Map()\nnew Map()\n', { exported: ['MapCtor'] })
    expect(out.rewritten).toBe('new MapCtor()\nnew MapCtor()\n')
  })
})

describe('static calls', () => {
  it('rewrites a static method to the primordial', () => {
    const out = collect('const k = Object.keys(o)\n', {
      exported: ['ObjectKeys'],
    })
    expect(out.rewritten).toBe('const k = ObjectKeys(o)\n')
    expect(out.used).toContain('ObjectKeys')
  })

  it('rewrites JSON.parse', () => {
    const out = collect('const v = JSON.parse(s)\n', {
      exported: ['JSONParse'],
    })
    expect(out.rewritten).toBe('const v = JSONParse(s)\n')
  })

  it('leaves it alone when the primordial is not exported', () => {
    const out = collect('const k = Object.keys(o)\n')
    expect(out.rewrites).toEqual([])
  })

  it('leaves an untracked receiver alone', () => {
    const out = collect('const v = myUtil.keys(o)\n', {
      exported: ['ObjectKeys'],
    })
    expect(out.rewritten).toBe('const v = myUtil.keys(o)\n')
  })
})

describe('nullable primordials in TypeScript sources', () => {
  it('asserts non-null so a possibly-undefined export still type-checks', () => {
    const out = collect('const m = new Map()\n', {
      exported: ['MapCtor'],
      isTsFile: true,
      nullable: ['MapCtor'],
    })
    expect(out.rewritten).toContain('MapCtor!')
  })

  it('adds no assertion when the primordial is not nullable', () => {
    const out = collect('const m = new Map()\n', {
      exported: ['MapCtor'],
      isTsFile: true,
      nullable: [],
    })
    expect(out.rewritten).toBe('const m = new MapCtor()\n')
  })

  it('adds no assertion in a JavaScript source', () => {
    // `!` is TypeScript syntax; emitting it into .mjs is a syntax error.
    const out = collect('const m = new Map()\n', {
      exported: ['MapCtor'],
      isTsFile: false,
      nullable: ['MapCtor'],
    })
    expect(out.rewritten).toBe('const m = new MapCtor()\n')
  })
})

describe('the ambiguous-method queue', () => {
  const source = 'const out = thing.then(next)\n'

  it('stays empty without the opt-in', () => {
    expect(collect(source).pending).toEqual([])
  })

  it('captures byte ranges up front when the opt-in is on', () => {
    // The AST is freed when the walk ends, so the post-walk pass gets spans by
    // value rather than node references.
    const { pending } = collect(source, { aiDisambiguate: true })
    expect(pending.length).toBe(1)
    expect(pending[0]!.methodName).toBe('then')
    expect(pending[0]!.receiverName).toBe('thing')
    expect(pending[0]!.objectEnd).toBeGreaterThan(pending[0]!.objectStart)
    expect(pending[0]!.calleeEnd).toBeGreaterThan(pending[0]!.calleeStart)
  })
})

describe('the collected spans', () => {
  it('never overlap, so applying them all is safe', () => {
    const out = collect(
      'const a = new Map()\nconst b = Object.keys(o)\nconst c = JSON.parse(s)\n',
      { exported: ['MapCtor', 'ObjectKeys', 'JSONParse'] },
    )
    const ordered = out.rewrites.toSorted((a, b) => a.start - b.start)
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.start).toBeGreaterThanOrEqual(ordered[i - 1]!.end)
    }
  })

  it('stay within the source bounds', () => {
    const src = 'const m = new Map()\n'
    const out = collect(src, { exported: ['MapCtor'] })
    for (const r of out.rewrites) {
      expect(r.start).toBeGreaterThanOrEqual(0)
      expect(r.end).toBeLessThanOrEqual(src.length)
      expect(r.end).toBeGreaterThan(r.start)
    }
  })

  it('records nothing for a source with no candidates', () => {
    const out = collect('const sum = 1 + 2\n', { exported: ['MapCtor'] })
    expect(out.rewrites).toEqual([])
    expect(out.used).toEqual([])
  })
})

describe('call shapes the classifier does not touch', () => {
  it('leaves a plain function call alone', () => {
    const out = collect('const v = keys(o)\n', { exported: ['ObjectKeys'] })
    expect(out.rewrites).toEqual([])
  })

  it('leaves a computed member call alone', () => {
    // The property is a literal, not an identifier, so there is no method
    // name to look up.
    const out = collect("const c = s['charAt'](0)\n", {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewrites).toEqual([])
  })

  it('leaves a nested member call alone', () => {
    // The receiver is itself a member expression, so its type is not a name
    // the guesser can read.
    const out = collect('const c = a.b.charAt(0)\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewrites).toEqual([])
  })
})

describe('statics the classifier refuses on purpose', () => {
  it('leaves a non-callable static alone', () => {
    // Error.prepareStackTrace is a V8 setter, so calling the primordial
    // would call something that is not a function.
    const out = collect('Error.prepareStackTrace(err, frames)\n', {
      exported: ['ErrorPrepareStackTrace'],
    })
    expect(out.rewrites).toEqual([])
  })

  it('leaves a static whose return type narrows on the call site alone', () => {
    // Symbol.for returns a unique symbol at the literal call site; through an
    // alias it collapses to plain symbol and breaks computed class keys.
    const out = collect("const s = Symbol.for('tag')\n", {
      exported: ['SymbolFor'],
    })
    expect(out.rewrites).toEqual([])
  })

  it('leaves a node built-in module static alone', () => {
    // basename is a path method, not a prototype method of a global.
    const out = collect('const b = path.basename(p)\n', {
      exported: ['StringPrototypeBasename'],
    })
    expect(out.rewrites).toEqual([])
  })

  it('asserts non-null on a nullable static in a TypeScript source', () => {
    const out = collect('const k = Object.keys(o)\n', {
      exported: ['ObjectKeys'],
      isTsFile: true,
      nullable: ['ObjectKeys'],
    })
    expect(out.rewritten).toBe('const k = ObjectKeys!(o)\n')
  })
})

describe('prototype calls', () => {
  it('moves the receiver into the first argument slot', () => {
    const out = collect('const c = s.charAt(0)\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewritten).toBe('const c = StringPrototypeCharAt(s, 0)\n')
    expect(out.used).toContain('StringPrototypeCharAt')
  })

  it('keeps every argument, in order', () => {
    const out = collect('const p = s.padStart(4, "0")\n', {
      exported: ['StringPrototypePadStart'],
    })
    expect(out.rewritten).toBe('const p = StringPrototypePadStart(s, 4, "0")\n')
  })

  it('emits the receiver alone when the call takes no arguments', () => {
    const out = collect('const c = s.charAt()\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewritten).toBe('const c = StringPrototypeCharAt(s)\n')
  })

  it('spans the whole no-argument call, including its parens', () => {
    // The span has to reach past the `)`, or the rewrite leaves a stray pair
    // of parens behind it.
    const out = collect('s.charAt()\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewrites).toHaveLength(1)
    expect(out.rewrites[0]!.end).toBe('s.charAt()'.length)
  })

  it('tolerates a comment between the callee and its empty argument list', () => {
    const out = collect('const c = s.charAt /* why */ ()\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewritten).toBe('const c = StringPrototypeCharAt(s)\n')
  })

  it('leaves an optional call alone, whose span it cannot place', () => {
    // `s.charAt?.()` short-circuits when `charAt` is nullish, and the
    // primordial form has no way to express that, so declining is correct.
    // The paren scan reports no span because `?.` sits where `(` would.
    const out = collect('const c = s.charAt?.()\n', {
      exported: ['StringPrototypeCharAt'],
    })
    expect(out.rewrites).toEqual([])
    expect(out.rewritten).toBe('const c = s.charAt?.()\n')
  })

  it('asserts non-null on a nullable primordial in a TypeScript source', () => {
    const out = collect('const c = s.charAt(0)\n', {
      exported: ['StringPrototypeCharAt'],
      isTsFile: true,
      nullable: ['StringPrototypeCharAt'],
    })
    expect(out.rewritten).toBe('const c = StringPrototypeCharAt!(s, 0)\n')
  })

  it('leaves the call alone when the surface does not export the primordial', () => {
    const out = collect('const c = s.charAt(0)\n')
    expect(out.rewrites).toEqual([])
  })
})

describe('receivers the classifier only guesses at', () => {
  it('rewrites an ambiguous method when the receiver name gives it away', () => {
    // `re` reads as a RegExp, which is the whole of the static signal.
    const out = collect('if (re.test(value)) {}\n', {
      exported: ['RegExpPrototypeTest'],
    })
    expect(out.rewritten).toBe('if (RegExpPrototypeTest(re, value)) {}\n')
  })

  it('skips an ambiguous guess when guessed receivers are opted out', () => {
    const out = collect('if (re.test(value)) {}\n', {
      exported: ['RegExpPrototypeTest'],
      includeGuessed: false,
    })
    expect(out.rewrites).toEqual([])
    expect(out.skipped).toBe(1)
  })

  it('skips an unambiguous method on a guessed receiver when opted out', () => {
    const out = collect('const v = re.someMethod(value)\n', {
      exported: ['RegExpPrototypeSomeMethod'],
      includeGuessed: false,
    })
    expect(out.rewrites).toEqual([])
    expect(out.skipped).toBe(1)
  })

  it('records the whole call span for a no-argument ambiguous site', () => {
    // With no arguments the queue has no last argument to end at, so it
    // records the position just past the call's own `(`. Recording the end of
    // the callee instead put the drain pass's paren scan on that paren, which
    // it refuses to start on, and the deferred rewrite was dropped.
    const source = 'const out = thing.then()\n'
    const { pending } = collect(source, { aiDisambiguate: true })
    expect(pending).toHaveLength(1)
    expect(pending[0]!.firstArgStart).toBe(-1)
    expect(pending[0]!.lastArgEnd).toBe(source.indexOf('()') + 1)
  })
})
