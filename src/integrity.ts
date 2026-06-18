/**
 * @file Integrity + checksum helpers. One concept — a {@link Hash} (algorithm +
 *   digest) — in two encodings:
 *
 *   - **hex** — lowercase hex digest (`shasum -a 256` / GitHub `SHA256SUMS`).
 *   - **sri** — W3C Subresource Integrity `sha(256|384|512)-<base64>` (npm
 *     `dist.integrity`, the `<script integrity>` attribute). Both are views of
 *     the same digest. The algorithm is EXPLICIT on every `Hash` — never
 *     inferred from which function produced it or sniffed from a string's
 *     shape. `verifyHash(bytes, expected)` honors whatever algorithm the
 *     expected hash declares, so a sha256 `SHA256SUMS` digest and a sha512 npm
 *     integrity both "just verify" with no manual conversion. Role split (see
 *     `docs/hash-algorithms.md`, unchanged): we PIN sha512 (`computeHash`
 *     default, `computeHashes().integrity`); sha256 is the upstream-interop
 *     shape (`fetchChecksumFile`, `computeHashes().checksum`). The two only
 *     meet at verify-upstream-256 → pin-512. Algorithms are never flipped —
 *     relabeling a 256-bit digest as sha512 would be a lie, and you can't
 *     re-hash without the bytes. "SSRI" is just another name for Subresource
 *     Integrity — only this module should mention it, inside `parseIntegrity`.
 */
import crypto from 'node:crypto'

import { hash as computeDigest } from './crypto/hash'

import { BufferFrom, BufferPrototypeToString } from './primordials/buffer'

import { ErrorCtor, TypeErrorCtor } from './primordials/error'

import { ObjectFreeze } from './primordials/object'

import { StringPrototypeToLowerCase } from './primordials/string'

/**
 * SRI-blessed hash algorithms. The W3C set; the prefix is part of the wire
 * format, not a fleet convention.
 */
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512'

/**
 * A cryptographic hash: an algorithm plus the digest in both encodings. Frozen,
 * plain, self-describing — `h.algorithm` removes every "is this 256 or 512?"
 * guess, and `h.hex` / `h.sri` are precomputed views (cheap transcodes of the
 * digest, eager so the value stays serializable and structurally comparable).
 */
export interface Hash {
  readonly algorithm: HashAlgorithm
  /**
   * Lowercase hex digest (64 chars sha256, 96 sha384, 128 sha512).
   */
  readonly hex: string
  /**
   * W3C SRI string: `<algorithm>-<base64>`.
   */
  readonly sri: string
}

/**
 * Anything a caller can hand verify/convert as "the expected hash": a parsed
 * {@link Hash}, an SRI string, or a bare hex digest (algorithm inferred by
 * length).
 */
export type HashInput = string | Hash

/**
 * Tagged union representing an expected hash.
 *
 * @deprecated Prefer {@link HashInput} + {@link parseHash}. Kept for the
 *   `integrity?: HashSpec` option fields across dlx / external-tools.
 */
export type HashSpec =
  | string
  | { type: 'integrity'; value: string }
  | { type: 'checksum'; value: string }

/**
 * Normalized internal form of a {@link HashSpec}. Always an object.
 */
export interface NormalizedHash {
  type: 'integrity' | 'checksum'
  value: string
}

/**
 * Both pinned hash formats for the same bytes: the sha512 SRI we pin against
 * and the sha256 hex upstream tools emit. Returned from downloads so callers
 * record whichever their config uses.
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
 * Parsed components of an SRI integrity string.
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

// SRI: sha256/384/512 + base64 body. The algorithm lives in the prefix, so it
// is read, never inferred.
const INTEGRITY_RE = /^(sha(?:256|384|512))-([A-Za-z0-9+/]+=*)$/
// Bare lowercase-or-upper hex digest of any length; the length picks the algo.
const HEX_RE = /^[a-f0-9]+$/i
// Exactly 64 hex chars — the sha256 checksum shape, by fleet convention.
const CHECKSUM_RE = /^[a-f0-9]{64}$/i

// Hex-digest length (chars) per algorithm, and the reverse map for inferring an
// algorithm from a bare hex digest. The lengths are distinct, so the inference
// is unambiguous.
const ALGORITHM_HEX_LENGTH: Record<HashAlgorithm, number> = {
  sha256: 64,
  sha384: 96,
  sha512: 128,
}
const HEX_LENGTH_TO_ALGORITHM: { [length: number]: HashAlgorithm | undefined } =
  {
    64: 'sha256',
    96: 'sha384',
    128: 'sha512',
  }

/**
 * Convert a hex checksum to its SRI integrity form.
 *
 * @deprecated Prefer `parseHash(x).sri`, which is total across all algorithms
 *   and infers the algorithm from a bare hex digest. This shim defaults to
 *   `'sha256'` because it only relabels the hex bytes — it does NOT re-hash, so
 *   a sha512 label on a 256-bit digest would be a lie. Idempotent on SRI input.
 *
 * @throws TypeError when the input is neither a recognized SRI nor a hex
 *   digest.
 */
export function checksumToIntegrity(
  input: string,
  algorithm: HashAlgorithm = 'sha256',
): string {
  if (isIntegrity(input)) {
    return input
  }
  if (!HEX_RE.test(input)) {
    throw new TypeErrorCtor(
      `checksumToIntegrity: expected a hex digest or SRI string, got: ${input}`,
    )
  }
  return makeHash(algorithm, input).sri
}

/**
 * Compute a single {@link Hash} of `bytes`. Defaults to sha512 — the canonical
 * trust string we pin against. Pass `'sha256'` for the upstream-interop digest.
 *
 * @example
 *   ;```typescript
 *   computeHash(bytes).sri        // 'sha512-…'  (pin this)
 *   computeHash(bytes, 'sha256').hex  // '3620a0…' (compare to SHA256SUMS)
 *   ```
 */
export function computeHash(
  bytes: NodeJS.ArrayBufferView,
  algorithm: HashAlgorithm = 'sha512',
): Hash {
  return makeHash(algorithm, computeDigest(algorithm, bytes, 'hex'))
}

/**
 * Compute both pinned formats for `bytes`: the sha512 SRI integrity and the
 * sha256 hex checksum. Use when a config records both (e.g.
 * `external-tools.json`, dlx lockfiles).
 */
export function computeHashes(bytes: Buffer): ComputedHashes {
  return {
    integrity: computeHash(bytes, 'sha512').sri,
    checksum: computeHash(bytes, 'sha256').hex,
  }
}

/**
 * Compare two hashes for equality, ENCODING-agnostically. Parses both and —
 * only when they share an algorithm — timing-safe compares the digests.
 *
 * Returns false when the algorithms differ. A sha512 and a sha256 are different
 * functions of the same bytes: their digests are unrelated values, so they can
 * never be "equal", and you CANNOT derive or check one against the other
 * without the original bytes. To confirm a sha256 and a sha512 describe the
 * same content, hash the bytes both ways (`computeHashes`) or `verifyHash` the
 * bytes against each — there is no hash-to-hash shortcut across algorithms.
 *
 * What this DOES solve is the cross-ENCODING case that bites string `===`: a
 * sha256 SRI and the same sha256 hex compare equal here.
 *
 * @example
 *   ;```typescript
 *   equalHashes('sha256-NiCg…', '3620a0fc…')  // true  (same digest, SRI vs hex)
 *   equalHashes('sha512-…', '3620a0fc…')       // false (different algorithms)
 *   ```
 *
 * @throws TypeError when either input is not a recognized hash.
 */
export function equalHashes(a: HashInput, b: HashInput): boolean {
  const aHash = parseHash(a)
  const bHash = parseHash(b)
  if (aHash.algorithm !== bHash.algorithm) {
    return false
  }
  const aBuf = BufferFrom!(aHash.hex, 'hex')
  const bBuf = BufferFrom!(bHash.hex, 'hex')
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Convert an SRI integrity string to its hex checksum form.
 *
 * @deprecated Prefer `parseHash(x).hex`, which is total across all algorithms.
 *   This shim is sha256-only (throws on sha384 / sha512) to preserve its
 *   historical "checksums are sha256" contract. Idempotent on hex input.
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
      `integrityToChecksum: ${parsed.algorithm} integrity has no 64-hex-char checksum form — checksums are sha256-only by fleet convention. Use parseHash(x).hex for any algorithm.`,
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
 * True when `s` is a bare hex digest of a recognized length (sha256 / sha384 /
 * sha512).
 */
export function isHex(s: string): boolean {
  return HEX_RE.test(s) && HEX_LENGTH_TO_ALGORITHM[s.length] !== undefined
}

/**
 * True when `s` is a W3C SRI integrity string: `sha(256|384|512)-<base64>`.
 */
export function isIntegrity(s: string): boolean {
  return INTEGRITY_RE.test(s)
}

/**
 * Build a frozen {@link Hash} from an algorithm and a hex digest. The internal
 * constructor — trusts its inputs (lowercases the hex, computes the SRI view);
 * use {@link parseHash} for untrusted strings, which validates first.
 */
export function makeHash(algorithm: HashAlgorithm, hex: string): Hash {
  const lowerHex = StringPrototypeToLowerCase(hex)
  const base64 = BufferPrototypeToString!(
    BufferFrom!(lowerHex, 'hex'),
    'base64',
  )
  return ObjectFreeze({
    algorithm,
    hex: lowerHex,
    sri: `${algorithm}-${base64}`,
  })
}

/**
 * Normalize a {@link HashSpec} to its canonical `{ type, value }` form.
 *
 * @deprecated Prefer {@link parseHash}, which returns an algorithm-tagged
 *   {@link Hash}. Kept for callers that branch on integrity-vs-checksum type.
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
 * Parse any {@link HashInput} into a canonical {@link Hash}. The one entry
 * point for untrusted input — validates shape + length, then freezes.
 *
 * - A {@link Hash} object is re-canonicalized from its `algorithm` + `hex`.
 * - An SRI string carries its algorithm in the prefix (the body length is checked
 *   against it).
 * - A bare hex digest infers the algorithm from its length (64 / 96 / 128).
 *
 * @throws TypeError when the input is not a recognized SRI or hex digest, or
 *   when an SRI body's length doesn't match its declared algorithm.
 */
export function parseHash(input: HashInput): Hash {
  if (typeof input === 'object' && input !== null) {
    return makeHash(input.algorithm, input.hex)
  }
  const sriMatch = INTEGRITY_RE.exec(input)
  if (sriMatch) {
    const algorithm = sriMatch[1] as HashAlgorithm
    const hex = BufferPrototypeToString!(
      BufferFrom!(sriMatch[2]!, 'base64'),
      'hex',
    )
    const expectedLength = ALGORITHM_HEX_LENGTH[algorithm]
    if (hex.length !== expectedLength) {
      throw new TypeErrorCtor(
        `parseHash: ${algorithm} SRI body decodes to ${hex.length} hex chars, expected ${expectedLength}: ${input}`,
      )
    }
    return makeHash(algorithm, hex)
  }
  if (HEX_RE.test(input)) {
    const algorithm = HEX_LENGTH_TO_ALGORITHM[input.length]
    if (algorithm === undefined) {
      throw new TypeErrorCtor(
        `parseHash: hex digest is ${input.length} chars; expected 64 (sha256), 96 (sha384), or 128 (sha512): ${input}`,
      )
    }
    return makeHash(algorithm, input)
  }
  throw new TypeErrorCtor(
    `parseHash: expected an SRI string ("sha(256|384|512)-<base64>") or a hex digest, got: ${input}`,
  )
}

/**
 * Split an SRI integrity string into its `{ algorithm, body }` components.
 * `body` is the base64-encoded digest.
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
 * Verify `bytes` against an expected hash. Reads the algorithm the expected
 * hash declares, computes only that digest, and compares with
 * `crypto.timingSafeEqual` — so any encoding (hex / SRI / {@link Hash}) and any
 * algorithm (sha256 / sha384 / sha512) verifies without the caller reconciling
 * formats first.
 *
 * @throws HashMismatchError when the recomputed digest doesn't match.
 * @throws TypeError when `expected` is not a recognized hash.
 */
export function verifyHash(
  bytes: NodeJS.ArrayBufferView,
  expected: HashInput,
): void {
  const expectedHash = parseHash(expected)
  const actualHash = computeHash(bytes, expectedHash.algorithm)
  const expectedBuf = BufferFrom!(expectedHash.hex, 'hex')
  const actualBuf = BufferFrom!(actualHash.hex, 'hex')
  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new HashMismatchError(expectedHash, actualHash)
  }
}

/**
 * Thrown when an expected hash doesn't match the computed hash of the verified
 * bytes. Carries both sides (as {@link Hash}) for diagnostics.
 */
export class HashMismatchError extends Error {
  readonly expected: Hash
  readonly actual: Hash

  constructor(expected: Hash, actual: Hash) {
    super(
      `Hash mismatch (${expected.algorithm}): expected ${expected.sri}, got ${actual.sri}`,
    )
    this.name = 'HashMismatchError'
    this.expected = expected
    this.actual = actual
  }
}

/**
 * @deprecated Renamed to {@link HashMismatchError}. Alias kept for callers that
 *   catch the old name.
 */
export const DlxHashMismatchError = HashMismatchError
