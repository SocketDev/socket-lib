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
 * Property names we know are static methods on Node built-in modules,
 * NOT prototype methods on a builtin type. When the called member name
 * is one of these, the type-guess heuristic should skip — the receiver
 * is a module object regardless of what its identifier name suggests.
 *
 * Without this set, `path.isAbsolute(...)` gets classified as
 * "String.prototype.isAbsolute" because `path` matches the String hint
 * regex. Same for `path.join`, `path.dirname`, etc.
 */
export const NODE_MODULE_STATIC_METHODS = new Set([
  // path
  'isAbsolute',
  'join',
  'dirname',
  'basename',
  'extname',
  'relative',
  'resolve',
  'normalize',
  'format',
  // url
  'fileURLToPath',
  'pathToFileURL',
  'urlToHttpOptions',
  'domainToASCII',
  'domainToUnicode',
  // os
  'homedir',
  'tmpdir',
  'platform',
  'arch',
  'cpus',
  'hostname',
  'userInfo',
  'networkInterfaces',
  'release',
  // process / cwd-style
  'cwd',
  'chdir',
  'memoryUsage',
  // fs (sync + async — both are statics on the fs module)
  'readFile',
  'writeFile',
  'appendFile',
  'readdir',
  'readlink',
  'realpath',
  'mkdir',
  'rmdir',
  'unlink',
  'rename',
  'stat',
  'lstat',
  'fstat',
  'access',
  'chmod',
  'chown',
  'open',
  'close',
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
  // Explicit known-array names only. We previously matched any camelCase
  // identifier ending in 's' as Array, but that misclassifies object
  // collections like `smolHandlers`, `http2Refs`, `eventListeners`,
  // `subscribers` — names that happen to end in 's' but hold objects
  // keyed by name, not array elements. False positives drowned out
  // real array gaps in TypeScript projects.
  //
  // To stay useful on plurals, require either:
  //   1. Exact match against a known-array list, OR
  //   2. A clearly array-ish suffix that's unlikely to be a hash/object
  //      collection (Array, List, Vec, Tuple).
  if (
    /^(arr|array|list|items|results|entries|values|keys|nodes|elements|matches|parts|chunks|paths|files|args|argv|tokens|lines|cols|rows|deps|tags|specs|errors|warnings|ancestors|children|siblings|tasks|jobs|requests|responses|messages|events|records|rows)$/.test(
      name,
    ) ||
    /(Array|List|Vec|Tuple)$/.test(name)
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
  // `pattern` deliberately excluded — it's just as commonly a string
  // (a regex *source*, not a compiled RegExp) and the false-positives
  // from classifying string `.includes` / `.replace` / `.match` calls
  // as RegExp prototype methods drown out the rare real RegExp guess.
  if (/^(re|regex|regexp)$/.test(name) || /Re(gex|gExp)$/.test(name)) {
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
