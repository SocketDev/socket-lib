/**
 * @fileoverview Built-in JavaScript globals the audit tracks.
 *
 * Anything not in this set is treated as a user-defined identifier and
 * skipped. Keep alphabetical so additions are easy to spot.
 *
 * Source of truth: TC39 spec globals (https://tc39.es/ecma262/) plus
 * the WHATWG / Web-platform globals that Node ships
 * (`URL`, `URLSearchParams`, `Buffer`).
 */

export const TRACKED_GLOBALS = new Set([
  // ─── Fundamental constructors ──────────────────────────────────────
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'Buffer',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
  // ─── Spec namespaces (static-method only, no `new`) ────────────────
  'Atomics',
  'Intl',
  'JSON',
  'Math',
  'Reflect',
  // ─── Web-platform globals Node ships ────────────────────────────────
  'URL',
  'URLSearchParams',
])

/**
 * Bare global functions (not on a namespace). Tracked separately because
 * they can't be detected as `Foo.bar(...)` member-call patterns.
 */
export const TRACKED_GLOBAL_FUNCTIONS = new Set([
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  // `eval` and `escape`/`unescape` exist but are deprecated/dangerous;
  // not in scope for primordialization.
])

/**
 * Method names that are unambiguously prototype methods on a single
 * built-in type. Used as a stronger signal than name heuristics.
 *
 * If a method appears here, a `.method(...)` call on ANY identifier
 * is treated as a candidate for that type's primordial — provided
 * the method doesn't also appear on other built-ins. Methods that
 * collide across types (e.g. `.has` lives on Set, Map, WeakSet,
 * WeakMap, URLSearchParams; `.forEach` lives on Array, Map, Set,
 * NodeList, …) are intentionally excluded — they require type info
 * we don't have.
 */
export const UNAMBIGUOUS_PROTOTYPE_METHODS = new Map([
  // ─── String only ────────────────────────────────────────────────────
  ['charAt', 'String'],
  ['charCodeAt', 'String'],
  ['codePointAt', 'String'],
  ['endsWith', 'String'],
  ['localeCompare', 'String'],
  ['matchAll', 'String'],
  ['normalize', 'String'],
  ['padEnd', 'String'],
  ['padStart', 'String'],
  ['repeat', 'String'],
  ['replaceAll', 'String'],
  ['startsWith', 'String'],
  ['substring', 'String'],
  ['toLocaleLowerCase', 'String'],
  ['toLocaleUpperCase', 'String'],
  ['toLowerCase', 'String'],
  ['toUpperCase', 'String'],
  ['trim', 'String'],
  ['trimEnd', 'String'],
  ['trimStart', 'String'],

  // ─── Array only ─────────────────────────────────────────────────────
  ['copyWithin', 'Array'],
  ['fill', 'Array'],
  ['findLast', 'Array'],
  ['findLastIndex', 'Array'],
  ['flat', 'Array'],
  ['flatMap', 'Array'],
  ['toReversed', 'Array'],
  ['toSorted', 'Array'],
  ['unshift', 'Array'],

  // ─── Number only ────────────────────────────────────────────────────
  ['toExponential', 'Number'],
  ['toFixed', 'Number'],
  ['toPrecision', 'Number'],

  // ─── Date only ──────────────────────────────────────────────────────
  ['getDate', 'Date'],
  ['getDay', 'Date'],
  ['getFullYear', 'Date'],
  ['getHours', 'Date'],
  ['getMilliseconds', 'Date'],
  ['getMinutes', 'Date'],
  ['getMonth', 'Date'],
  ['getSeconds', 'Date'],
  ['getTime', 'Date'],
  ['getTimezoneOffset', 'Date'],
  ['getUTCDate', 'Date'],
  ['getUTCDay', 'Date'],
  ['getUTCFullYear', 'Date'],
  ['getUTCHours', 'Date'],
  ['getUTCMilliseconds', 'Date'],
  ['getUTCMinutes', 'Date'],
  ['getUTCMonth', 'Date'],
  ['getUTCSeconds', 'Date'],
  ['toDateString', 'Date'],
  ['toISOString', 'Date'],
  ['toJSON', 'Date'],
  ['toLocaleDateString', 'Date'],
  ['toLocaleTimeString', 'Date'],
  ['toTimeString', 'Date'],
  ['toUTCString', 'Date'],

  // ─── RegExp only ────────────────────────────────────────────────────
  ['exec', 'RegExp'],
  ['test', 'RegExp'],

  // ─── Promise only ───────────────────────────────────────────────────
  ['then', 'Promise'],
  ['catch', 'Promise'],
  ['finally', 'Promise'],

  // ─── Map only ───────────────────────────────────────────────────────
  // (Set has `entries` too but Map's is more common in our usage; on
  //  collision the audit reports both as candidates.)

  // ─── Buffer only (Node) ─────────────────────────────────────────────
  ['readUInt8', 'Buffer'],
  ['readUInt16BE', 'Buffer'],
  ['readUInt16LE', 'Buffer'],
  ['readUInt32BE', 'Buffer'],
  ['readUInt32LE', 'Buffer'],
  ['readBigUInt64BE', 'Buffer'],
  ['readBigUInt64LE', 'Buffer'],
  ['writeUInt8', 'Buffer'],
  ['writeUInt16BE', 'Buffer'],
  ['writeUInt16LE', 'Buffer'],
  ['writeUInt32BE', 'Buffer'],
  ['writeUInt32LE', 'Buffer'],
  ['writeBigUInt64BE', 'Buffer'],
  ['writeBigUInt64LE', 'Buffer'],
])

/**
 * Heuristic: when a method call's receiver isn't a known global AND the
 * method name isn't unambiguous, guess what built-in type it is from
 * the identifier name. Returns the global name (e.g. `'Array'`) or
 * `undefined` if no guess.
 *
 * Conservative — only fires on conventional names. False positives are
 * acceptable for an audit; they show up as `[guessed: …]` so the
 * reader can dismiss them.
 */
export function guessReceiverType(name) {
  // ─── Array hints ────────────────────────────────────────────────────
  if (
    /^(arr|array|list|items|results|entries|values|keys|nodes|elements|matches|parts|chunks|paths|files|args|argv|tokens|lines|cols|rows|deps|tags|specs|errors|warnings)$/.test(
      name,
    ) ||
    /^[a-z][a-zA-Z0-9]*s$/.test(name) // camelCase ending in 's'
  ) {
    return 'Array'
  }
  // ─── String hints ───────────────────────────────────────────────────
  if (
    /^(str|s|name|key|val|value|text|line|word|message|msg|input|output|content|body|header|path|url|ext|filename|prefix|suffix|substring|cmd|command|raw|label|title|description|version|hash|sha|tag|slug|spec|sourceCode|source|code)$/.test(
      name,
    )
  ) {
    return 'String'
  }
  // ─── Number hints ───────────────────────────────────────────────────
  if (
    /^(n|num|number|count|len|length|size|index|idx|i|j|k|offset|width|height|depth|score|ratio|percent|millis|seconds|minutes|hours|year|month|day)$/.test(
      name,
    )
  ) {
    return 'Number'
  }
  // ─── Date hints ─────────────────────────────────────────────────────
  if (
    /^(date|d|now|timestamp|created|updated|modified|start|end|expires|deadline|when)$/.test(
      name,
    ) ||
    /(Date|At|Time)$/.test(name)
  ) {
    return 'Date'
  }
  // ─── RegExp hints ───────────────────────────────────────────────────
  if (/^(re|regex|regexp|pattern)$/.test(name) || /Re(gex|gExp)?$/.test(name)) {
    return 'RegExp'
  }
  // ─── Promise hints ──────────────────────────────────────────────────
  if (/^(promise|p|pending)$/.test(name) || name.endsWith('Promise')) {
    return 'Promise'
  }
  // ─── Buffer hints ───────────────────────────────────────────────────
  if (/^(buf|buffer|bytes)$/.test(name) || name.endsWith('Buffer')) {
    return 'Buffer'
  }
  return undefined
}

/**
 * Map a tracked global + property name to the corresponding primordial
 * export name in `@socketsecurity/lib/primordials`.
 */
export function staticPrimordialName(global, member) {
  return global + member[0].toUpperCase() + member.slice(1)
}

export function ctorPrimordialName(global) {
  return global + 'Ctor'
}

export function prototypePrimordialName(global, method) {
  return global + 'Prototype' + method[0].toUpperCase() + method.slice(1)
}
