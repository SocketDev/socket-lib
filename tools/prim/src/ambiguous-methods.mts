/**
 * @fileoverview Ambiguous prototype methods — the hard cases the
 * static analyzer can't classify reliably.
 *
 * `UNAMBIGUOUS_PROTOTYPE_METHODS` (in `globals.mts`) maps a method
 * name to one built-in type if and only if no real-world library
 * defines a method by the same name with an incompatible signature.
 * That bar is low for `.charAt`, `.getTime`, `.toFixed` — high for
 * `.test`, `.exec`, `.then`, `.catch`, `.finally`.
 *
 * Methods listed here are RegExp/Promise-shaped names that would be
 * unambiguous in pure spec-land but get duck-typed in the wild:
 *
 *   - semver Range.prototype.test(version) — not a RegExp
 *   - validator Foo.prototype.test(input) — not a RegExp
 *   - PromiseLike thenables (jest matchers, Bluebird, p-* libs) — not native Promise
 *   - jest expect(x).then(...) — not a Promise
 *
 * Treating these as "unambiguously RegExp / Promise" caused the
 * codemod to rewrite `range.test(version)` →
 * `RegExpPrototypeTest(range, version)` and explode at runtime with
 * "RegExp.prototype.test called on incompatible receiver".
 *
 * The table feeds two consumers:
 *   1. The static fallback path (`guessReceiverType`) still tries to
 *      classify via the receiver identifier name (`re`/`regex` →
 *      RegExp; `promise`/`p` → Promise).
 *   2. The AI-defer path (`disambiguate.mts`) feeds the surrounding
 *      source slice to Claude with a strict tools allowlist and asks
 *      "what type is the receiver?", caching the answer to disk.
 *
 * Adding a new entry here:
 *   - Add the method name → AmbiguousCase mapping below.
 *   - List every type the spec method maps to in `candidates`.
 *   - Write a short `hint` describing the duck-typed shapes so the
 *     AI prompt can avoid common false-positives.
 */

/**
 * @typedef {Object} AmbiguousCase
 * @property {string[]} candidates  Built-in types the spec method
 *   could legitimately resolve to (e.g. ['RegExp']).
 * @property {string} hint  One-line description of the duck-typed
 *   shapes the analyzer encounters in the wild. Surfaced into the
 *   AI prompt so Claude knows what false-positives to guard against.
 */

export const AMBIGUOUS_PROTOTYPE_METHODS = new Map([
  // ─── RegExp ─────────────────────────────────────────────────────────
  [
    'exec',
    {
      candidates: ['RegExp'],
      hint: 'Also: ChildProcess.prototype is `kill`/`disconnect`/etc., not `exec` — but custom CLI/test libraries occasionally name a method `.exec(...)`.',
    },
  ],
  [
    'test',
    {
      candidates: ['RegExp'],
      hint: 'Most common false-positive: semver `Range.prototype.test(version)`. Also: validator predicates (`schema.test(value)`), benchmark suites, custom assertion APIs.',
    },
  ],

  // ─── Promise ────────────────────────────────────────────────────────
  [
    'then',
    {
      candidates: ['Promise'],
      hint: 'PromiseLike / thenable wrappers (Bluebird, p-* libs, jest assertions, observable bridges). Native Promise has the most-restrictive contract, so rewrites only when the receiver is provably a native Promise are safe.',
    },
  ],
  [
    'catch',
    {
      candidates: ['Promise'],
      hint: 'Same as `then`. Also: array `.catch` does not exist, but some EventEmitter shims expose `.catch(handler)` as alias for an error listener.',
    },
  ],
  [
    'finally',
    {
      candidates: ['Promise'],
      hint: 'Same as `then`. Also: some test frameworks expose `.finally(fn)` on test descriptors (similar to `afterEach`).',
    },
  ],
])

/**
 * Verdict shape returned by the disambiguation layer (static guess
 * OR AI-deferred). Consumers use the `verdict.type` to drive the
 * same code path as `guessReceiverType()` — a string built-in name
 * (e.g. 'RegExp', 'Promise') or `undefined` for "skip this site".
 *
 * @typedef {Object} DisambiguationVerdict
 * @property {string|undefined} type  Resolved built-in type name
 *   (e.g. 'RegExp', 'Promise'), or undefined if the call site is
 *   not a primordial candidate.
 * @property {'static'|'ai'|'cache'} source  Where the answer came
 *   from. 'static' = `guessReceiverType()`. 'ai' = called Claude.
 *   'cache' = disk cache hit (was an AI call previously).
 * @property {string} [reason]  Short human-readable rationale.
 *   Surfaced to audit output for the operator to spot-check.
 */

/**
 * Returns true if the property name is in the ambiguous table.
 * Caller decides whether to invoke the static guess path, the AI
 * defer path, or both.
 *
 * @param {string} methodName
 * @returns {boolean}
 */
export function isAmbiguousMethod(methodName) {
  return AMBIGUOUS_PROTOTYPE_METHODS.has(methodName)
}

/**
 * Returns the candidates list and hint for an ambiguous method,
 * or `undefined` if the name isn't ambiguous.
 *
 * @param {string} methodName
 * @returns {{candidates: string[], hint: string}|undefined}
 */
export function getAmbiguousCase(methodName) {
  return AMBIGUOUS_PROTOTYPE_METHODS.get(methodName)
}
