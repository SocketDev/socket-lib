/**
 * @file Integrity specification helpers for downloads and file verification.
 *   Used by `dlx/binary-download` and external-tools resolvers; safe to consume
 *   from any module that needs to verify bytes against an expected hash. Single
 *   supported format per flavor:
 *
 *   - integrity: SRI with sha512 only (what npm registry returns)
 *   - checksum: sha256 hex (what `shasum -a 256` produces; common for binary
 *     release assets on GitHub) Callers may pass a {@link HashSpec} as a bare
 *     string (sniffed via format) or as an explicit `{ type, value }` object.
 *     The normalized form carried around internally is always the object.
 */

import crypto from 'node:crypto'

import { hash as computeHash } from './crypto/hash'

import { BufferFrom } from './primordials/buffer'

import { TypeErrorCtor } from './primordials/error'

import { hexToSsri, ssriToHex } from './ssri/convert'
import { parseSsri } from './ssri/parse'
/**
 * Tagged union representing an expected hash.
 *
 * @example
 *   // Bare SRI (sniffed as integrity):
 *   'sha512-abc...'
 *
 * @example
 *   // Bare sha256 hex (sniffed as checksum):
 *   'a1b2c3...'
 *
 * @example
 *   // Explicit:
 *   { type: 'integrity', value: 'sha512-abc...' }
 *   { type: 'checksum', value: 'a1b2c3...' }
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
 * Both hash formats for the same bytes. Returned from downloads so callers can
 * record whichever format their config uses.
 */
export interface ComputedHashes {
  /**
   * SRI integrity: `sha512-<base64>`. Matches what the npm registry returns.
   */
  integrity: string
  /**
   * SHA-256 hex (64 chars). Matches `shasum -a 256`.
   */
  checksum: string
}

// SRI accepts sha256 / sha384 / sha512 by spec — the algorithm prefix is
// part of the wire format, not a fleet convention. Restrict to those three
// (the W3C-blessed set) rather than parsing arbitrary `<algo>-<base64>`.
const INTEGRITY_RE = /^sha(?:256|384|512)-[A-Za-z0-9+/]+=*$/
const CHECKSUM_RE = /^[a-f0-9]{64}$/i

/**
 * Compute both integrity (sha512 SRI) and checksum (sha256 hex) for a buffer of
 * bytes.
 */
export function computeHashes(bytes: Buffer): ComputedHashes {
  const integrity = `sha512-${computeHash('sha512', bytes, 'base64')}`
  const checksum = computeHash('sha256', bytes, 'hex')
  return { integrity, checksum }
}

export function isChecksumString(s: string): boolean {
  return CHECKSUM_RE.test(s)
}

export function isIntegrityString(s: string): boolean {
  return INTEGRITY_RE.test(s)
}

/**
 * Normalize a {@link HashSpec} to its canonical `{ type, value }` form.
 *
 * - Object form is trusted (its `value` is validated for shape).
 * - Bare string matching sha512 SRI → integrity.
 * - Bare string of 64 hex chars → checksum.
 * - Anything else throws TypeError.
 *
 * @throws TypeError if the string is not a recognized format, or if an explicit
 *   object's value doesn't match its declared type.
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
 * Convert a {@link HashSpec} to hex checksum form (`<64 hex chars>`).
 *
 * - Hex input is returned as-is (idempotent).
 * - SRI input is unwrapped via {@link ssriToHex}. Only `sha256-` produces a
 *   64-hex-char output that fits {@link isChecksumString}; `sha384`/`sha512`
 *   SRI will throw — checksums are sha256-by-convention in the fleet.
 *
 * @example
 *   ;```typescript
 *   toChecksum('sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=')
 *   // '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b'
 *
 *   toChecksum('3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b')
 *   // '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b' (idempotent)
 *   ```
 *
 * @throws TypeError when the input is neither a valid SRI nor a valid hex
 *   checksum, or when an SRI input uses a non-sha256 algorithm.
 */
export function toChecksum(spec: HashSpec): string {
  const n = normalizeHash(spec)
  if (n.type === 'checksum') {
    return n.value
  }
  const { algorithm } = parseSsri(n.value)
  if (algorithm !== 'sha256') {
    throw new TypeErrorCtor(
      `Cannot convert ${algorithm} integrity to a 64-hex-char checksum — checksums are sha256-only by fleet convention.`,
    )
  }
  return ssriToHex(n.value)
}

/**
 * Convert a {@link HashSpec} to SRI integrity form
 * (`sha(256|384|512)-<base64>`).
 *
 * - SRI input is returned as-is (idempotent — call this on user-supplied data
 *   without first sniffing the format).
 * - Hex checksum input is wrapped via {@link hexToSsri} using `algorithm`
 *   (defaults to `sha256` — the most common release-asset shape).
 * - Object form is unwrapped first so `{ type: 'checksum', value: '<hex>' }`
 *   converts the same way.
 *
 * @example
 *   ;```typescript
 *   toIntegrity(
 *     '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b',
 *   )
 *   // 'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs='
 *
 *   toIntegrity('sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=')
 *   // 'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=' (idempotent)
 *   ```
 *
 * @throws TypeError when the input is neither a valid SRI nor a valid hex
 *   checksum, or when an explicit object's value doesn't match its declared
 *   type.
 */
export function toIntegrity(spec: HashSpec, algorithm = 'sha256'): string {
  const n = normalizeHash(spec)
  if (n.type === 'integrity') {
    return n.value
  }
  return hexToSsri(n.value, algorithm)
}

/**
 * Verify computed hashes against an expected {@link NormalizedHash}. Uses
 * `crypto.timingSafeEqual` for constant-time comparison.
 *
 * @throws DlxHashMismatchError when the hash of the matching type doesn't match
 *   the expected value.
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
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
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
