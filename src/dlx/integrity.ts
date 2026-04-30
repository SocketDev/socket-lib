/**
 * @fileoverview Integrity specification helpers for dlx downloads.
 *
 * Single supported format per flavor:
 *   - integrity: SRI with sha512 only (what npm registry returns)
 *   - checksum:  sha256 hex (what `shasum -a 256` produces; common for
 *                binary release assets on GitHub)
 *
 * Callers may pass a {@link HashSpec} as a bare string (sniffed via
 * format) or as an explicit `{ type, value }` object. The normalized
 * form carried around internally is always the object.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import {
  BufferFrom,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  TypeErrorCtor,
} from '../primordials'

/**
 * Tagged union representing an expected hash.
 *
 * @example
 * // Bare SRI (sniffed as integrity):
 * 'sha512-abc...'
 *
 * @example
 * // Bare sha256 hex (sniffed as checksum):
 * 'a1b2c3...'
 *
 * @example
 * // Explicit:
 * { type: 'integrity', value: 'sha512-abc...' }
 * { type: 'checksum', value: 'a1b2c3...' }
 */
export type HashSpec =
  | string
  | { type: 'integrity'; value: string }
  | { type: 'checksum'; value: string }

/**
 * Normalized internal form. Always an object.
 */
export interface NormalizedHash {
  type: 'integrity' | 'checksum'
  value: string
}

/**
 * Both hash formats for the same bytes. Returned from downloads so callers
 * can record whichever format their config uses.
 */
export interface ComputedHashes {
  /** SRI integrity: `sha512-<base64>`. Matches what the npm registry returns. */
  integrity: string
  /** SHA-256 hex (64 chars). Matches `shasum -a 256`. */
  checksum: string
}

const INTEGRITY_PREFIX = 'sha512-'
const INTEGRITY_BODY_RE = /^[A-Za-z0-9+/=]+$/
const CHECKSUM_RE = /^[a-f0-9]{64}$/i

function isIntegrityString(s: string): boolean {
  if (!StringPrototypeStartsWith(s, INTEGRITY_PREFIX)) {
    return false
  }
  const body = StringPrototypeSlice(s, INTEGRITY_PREFIX.length)
  return body.length > 0 && INTEGRITY_BODY_RE.test(body)
}

function isChecksumString(s: string): boolean {
  return CHECKSUM_RE.test(s)
}

/**
 * Normalize a {@link HashSpec} to its canonical `{ type, value }` form.
 *
 * - Object form is trusted (its `value` is validated for shape).
 * - Bare string matching sha512 SRI → integrity.
 * - Bare string of 64 hex chars → checksum.
 * - Anything else throws TypeError.
 *
 * @throws TypeError if the string is not a recognized format, or if an
 *   explicit object's value doesn't match its declared type.
 */
export function normalizeHash(spec: HashSpec): NormalizedHash {
  if (typeof spec === 'object' && spec !== null) {
    if (spec.type === 'integrity') {
      if (!isIntegrityString(spec.value)) {
        throw new TypeErrorCtor(
          `Expected SRI integrity string "sha512-<base64>", got: ${spec.value}`,
        )
      }
      return { type: 'integrity', value: spec.value }
    }
    if (spec.type === 'checksum') {
      if (!isChecksumString(spec.value)) {
        throw new TypeErrorCtor(
          `Expected sha256 hex string (64 hex chars), got: ${spec.value}`,
        )
      }
      return { type: 'checksum', value: spec.value }
    }
    throw new TypeErrorCtor(
      `Unknown hash type: ${(spec as { type: unknown }).type}`,
    )
  }
  if (typeof spec !== 'string') {
    throw new TypeErrorCtor(
      `HashSpec must be a string or { type, value } object, got: ${typeof spec}`,
    )
  }
  if (isIntegrityString(spec)) {
    return { type: 'integrity', value: spec }
  }
  if (isChecksumString(spec)) {
    return { type: 'checksum', value: spec }
  }
  throw new TypeErrorCtor(
    `Unrecognized hash format. Expected SRI integrity ("sha512-<base64>") or sha256 hex (64 hex chars), got: ${spec}`,
  )
}

/**
 * Compute both integrity (sha512 SRI) and checksum (sha256 hex) for a
 * buffer of bytes.
 */
export function computeHashes(bytes: Buffer): ComputedHashes {
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  const checksum = createHash('sha256').update(bytes).digest('hex')
  return { integrity, checksum }
}

/**
 * Verify computed hashes against an expected {@link NormalizedHash}.
 * Uses `crypto.timingSafeEqual` for constant-time comparison.
 *
 * @throws DlxHashMismatchError when the hash of the matching type
 *   doesn't match the expected value.
 */
export function verifyHash(
  expected: NormalizedHash,
  computed: ComputedHashes,
): void {
  const actual =
    expected.type === 'integrity' ? computed.integrity : computed.checksum
  const expectedBuf = BufferFrom!(expected.value)
  const actualBuf = BufferFrom!(actual)
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new DlxHashMismatchError(expected, computed)
  }
}

/**
 * Thrown when an expected hash doesn't match the computed hash of the
 * downloaded bytes. Carries both sides for diagnostics.
 */
export class DlxHashMismatchError extends Error {
  readonly expected: NormalizedHash
  readonly actual: ComputedHashes

  constructor(expected: NormalizedHash, actual: ComputedHashes) {
    const actualValue =
      expected.type === 'integrity' ? actual.integrity : actual.checksum
    super(
      `Hash mismatch (${expected.type}): expected ${expected.value}, got ${actualValue}`,
    )
    this.name = 'DlxHashMismatchError'
    this.expected = expected
    this.actual = actual
  }
}
