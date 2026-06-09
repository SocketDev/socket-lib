/**
 * @file Integrity + checksum helpers. The fleet uses two named hash flavors:
 *
 *   - **integrity** — W3C Subresource Integrity string:
 *     `sha(256|384|512)-<base64>`. The same shape the npm registry returns and
 *     the `<script integrity>` HTML attribute accepts. Algorithm is embedded.
 *   - **checksum** — sha256 hex digest, exactly 64 lowercase chars. The shape
 *     produced by `shasum -a 256` and used in GitHub-release SHA256SUMS files.
 *     Conversion is direction-specific so the names read in English:
 *     `checksumToIntegrity(hex)` and `integrityToChecksum(sri)`. Both are
 *     idempotent on the destination format (pass an SRI to
 *     `checksumToIntegrity`, get the same SRI back) so callers can apply them
 *     without first sniffing the input shape. "SSRI" is just another name for
 *     Subresource Integrity — this module is the only one that should mention
 *     it, and only inside `parseIntegrity` to extract the embedded algorithm +
 *     body.
 */
import crypto from 'node:crypto'

import { hash as computeHash } from './crypto/hash'

import { BufferFrom, BufferPrototypeToString } from './primordials/buffer'

import { ErrorCtor, TypeErrorCtor } from './primordials/error'

/**
 * Tagged union representing an expected hash.
 *
 * @example
 *   // Bare SRI (sniffed as integrity):
 *   'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs='
 *
 * @example
 *   // Bare sha256 hex (sniffed as checksum):
 *   'a1b2c3...'
 *
 * @example
 *   // Explicit:
 *   { type: 'integrity', value: 'sha512-...' }
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
   * Sha256 hex (64 chars). Matches `shasum -a 256`.
   */
  checksum: string
}

/**
 * Parsed components of an integrity string.
 */
export interface ParsedIntegrity {
  /**
   * SRI algorithm: `'sha256' | 'sha384' | 'sha512'`.
   */
  algorithm: string
  /**
   * Base64-encoded digest body (everything after the `-`).
   */
  body: string
}

// SRI accepts sha256 / sha384 / sha512 by spec — the algorithm prefix is
// part of the wire format, not a fleet convention. Restrict to those three
// (the W3C-blessed set) rather than parsing arbitrary `<algo>-<base64>`.
const INTEGRITY_RE = /^(sha(?:256|384|512))-([A-Za-z0-9+/]+=*)$/
const CHECKSUM_RE = /^[a-f0-9]{64}$/i

/**
 * Convert a sha256 hex checksum to its SRI integrity form (`sha256-<base64>`).
 * Idempotent on integrity input — call this on user-supplied data without first
 * sniffing the format.
 *
 * The default algorithm is `'sha256'` because this converts a _checksum_, and
 * checksums are sha256 by fleet convention (the GitHub-SHA256SUMS interop shape
 * its only caller, `checksum-file.ts`, parses). Do NOT flip this default to
 * sha512: this function only relabels the hex bytes, it does not re-hash, so a
 * sha512 label on a 256-bit digest would be a lie. The canonical algorithm for
 * OUR-side integrity values is sha512 — emitted by `computeHashes` as the
 * `integrity` (`sha512-<base64>`) field; sha256 is reserved for
 * upstream-SHASUMS interop and content addressing. Pass an explicit algorithm
 * if you have a hex digest from `sha384` or `sha512` (the function does not
 * verify hex length against the algorithm — caller's responsibility).
 *
 * @example
 *   ;```typescript
 *   checksumToIntegrity(
 *     '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b',
 *   )
 *   // 'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs='
 *
 *   checksumToIntegrity('sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=')
 *   // 'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=' (idempotent)
 *   ```
 *
 * @throws TypeError when the input is neither a recognized SRI nor a hex
 *   digest.
 */
export function checksumToIntegrity(
  input: string,
  algorithm = 'sha256',
): string {
  if (isIntegrity(input)) {
    return input
  }
  if (!/^[a-f0-9]+$/i.test(input)) {
    throw new TypeErrorCtor(
      `checksumToIntegrity: expected a hex digest or SRI string, got: ${input}`,
    )
  }
  const body = BufferPrototypeToString!(BufferFrom!(input, 'hex'), 'base64')
  return `${algorithm}-${body}`
}

/**
 * Compute both integrity (sha512 SRI) and checksum (sha256 hex) for a buffer of
 * bytes.
 */
export function computeHashes(bytes: Buffer): ComputedHashes {
  const integrity = `sha512-${computeHash('sha512', bytes, 'base64')}`
  const checksum = computeHash('sha256', bytes, 'hex')
  return { integrity, checksum }
}

/**
 * Convert a sha256 SRI integrity string to its hex checksum form (64 lowercase
 * chars). Idempotent on checksum input.
 *
 * Throws on `sha384` and `sha512` SRI — checksums are sha256-only by fleet
 * convention. Callers that need a hex digest for those algorithms can call
 * `parseIntegrity(sri)` and decode `.body` manually.
 *
 * @example
 *   ;```typescript
 *   integrityToChecksum('sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=')
 *   // '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b'
 *
 *   integrityToChecksum(
 *     '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b',
 *   )
 *   // '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b' (idempotent)
 *   ```
 *
 * @throws TypeError when the input is neither a recognized SRI nor a hex
 *   checksum, or when the input is a non-sha256 SRI.
 */
export function integrityToChecksum(input: string): string {
  if (isChecksum(input)) {
    return input
  }
  const parsed = parseIntegrity(input)
  if (parsed.algorithm !== 'sha256') {
    throw new TypeErrorCtor(
      `integrityToChecksum: ${parsed.algorithm} integrity has no 64-hex-char checksum form — checksums are sha256-only by fleet convention.`,
    )
  }
  return BufferPrototypeToString!(BufferFrom!(parsed.body, 'base64'), 'hex')
}

/**
 * True when `s` is a sha256 hex checksum (exactly 64 hex chars).
 */
export function isChecksum(s: string): boolean {
  return CHECKSUM_RE.test(s)
}

/**
 * True when `s` is a W3C SRI integrity string: `sha(256|384|512)-<base64>`.
 */
export function isIntegrity(s: string): boolean {
  return INTEGRITY_RE.test(s)
}

/**
 * Normalize a {@link HashSpec} to its canonical `{ type, value }` form.
 *
 * - Object form is trusted (its `value` is validated for shape).
 * - Bare string matching SRI → integrity.
 * - Bare string of 64 hex chars → checksum.
 * - Anything else throws TypeError.
 *
 * @throws TypeError if the string is not a recognized format, or if an explicit
 *   object's value doesn't match its declared type.
 */
export function normalizeHash(spec: HashSpec): NormalizedHash {
  if (typeof spec === 'object' && spec !== null) {
    if (spec.type === 'integrity') {
      if (!isIntegrity(spec.value)) {
        throw new TypeErrorCtor(
          `normalizeHash: expected SRI integrity "sha(256|384|512)-<base64>", got: ${spec.value}`,
        )
      }
      return { type: 'integrity', value: spec.value }
    }
    if (spec.type === 'checksum') {
      if (!isChecksum(spec.value)) {
        throw new TypeErrorCtor(
          `normalizeHash: expected sha256 hex checksum (64 hex chars), got: ${spec.value}`,
        )
      }
      return { type: 'checksum', value: spec.value }
    }
    throw new TypeErrorCtor(
      `normalizeHash: unknown hash type: ${(spec as { type: unknown }).type}`,
    )
  }
  if (typeof spec !== 'string') {
    throw new TypeErrorCtor(
      `normalizeHash: expected string or { type, value }, got: ${typeof spec}`,
    )
  }
  if (isIntegrity(spec)) {
    return { type: 'integrity', value: spec }
  }
  if (isChecksum(spec)) {
    return { type: 'checksum', value: spec }
  }
  throw new TypeErrorCtor(
    `normalizeHash: unrecognized hash format. Expected SRI integrity ("sha(256|384|512)-<base64>") or sha256 hex checksum (64 hex chars), got: ${spec}`,
  )
}

/**
 * Split an integrity string into its `{ algorithm, body }` components. `body`
 * is the base64-encoded digest (everything after the algorithm + dash).
 *
 * @example
 *   ;```typescript
 *   parseIntegrity('sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=')
 *   // { algorithm: 'sha256', body: 'NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=' }
 *   ```
 *
 * @throws Error when the input is not a valid SRI integrity string.
 */
export function parseIntegrity(sri: string): ParsedIntegrity {
  const m = INTEGRITY_RE.exec(sri)
  if (!m) {
    throw new ErrorCtor(`parseIntegrity: invalid SRI format: ${sri}`)
  }
  return { algorithm: m[1]!, body: m[2]! }
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
