/**
 * @file Vitiate coverage-guided fuzz target (Tier 2) for src/json/parse — the
 *   untrusted-input JSON boundary. Complements the fast-check property tests in
 *   parse.fuzz.test.mts: fast-check checks correctness on generated values;
 *   vitiate feeds SWC-coverage-guided mutated BYTES to reach deep parser paths
 *   a spec-based test never hits, with the prototypePollution detector watching
 *   for a `__proto__` leak. Run via `pnpm run test:fuzz`.
 */

import { fuzz } from '@vitiate/core'

import { parseJson, parseJsonSafe } from '../../../src/json/parse'

// `parseJson(content, { throws: false })` promises to NEVER throw — any thrown
// error on arbitrary bytes is a crash.
fuzz('parseJson({ throws: false }) never throws on arbitrary bytes', data => {
  parseJson(data.toString('utf8'), { throws: false })
})

// `parseJsonSafe` throws its intended validation errors (SyntaxError, maxSize,
// prototype-pollution); it must never crash uncontrollably, and the
// prototypePollution detector flags any `__proto__` that actually reaches the
// returned object.
fuzz('parseJsonSafe never corrupts / crashes on arbitrary bytes', data => {
  try {
    parseJsonSafe(data.toString('utf8'))
  } catch {
    // Intended validation throws are the contract; only an uncontrolled crash
    // (or a detector hit) fails the fuzz.
  }
})
