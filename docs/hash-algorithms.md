# Hash algorithms — which digest, where, and why

The fleet uses three hash algorithms, each for a distinct job. The rule of thumb:

> **SHA-512 is the trust boundary. SHA-256 is the interop/checksum shape. Truncated hashes are addressing, never trust.**

If you're adding a hash, find the matching row below and reuse that helper — don't
introduce a fourth flavor or flip an existing one without reading the "Why a flip
isn't free" section.

## The two named flavors (`src/integrity.ts`)

| flavor        | shape                       | algorithm | produced by                 | role                                                         |
| ------------- | --------------------------- | --------- | --------------------------- | ------------------------------------------------------------ |
| **integrity** | `sha512-<base64>` (W3C SRI) | SHA-512   | `computeHashes().integrity` | the canonical trust string — what we pin + verify against    |
| **checksum**  | 64-char lowercase hex       | SHA-256   | `computeHashes().checksum`  | upstream-interop shape: `shasum -a 256`, GitHub `SHA256SUMS` |

`integrity.ts` is the only module that should mention "SSRI". Convert between the
two with `checksumToIntegrity(hex)` / `integrityToChecksum(sri)` (both idempotent
on their destination format). Verify with `verifyHash()`, which uses
`crypto.timingSafeEqual` — never a plain `===` on a digest.

## Every hash site, by role

### Content integrity / trust verification — SHA-512 (load-bearing)

The security boundary. A mismatch here MUST fail closed.

- `src/dlx/binary-download.ts` — freshly-downloaded binary verified + SRI recomputed
  for future pinning (`hash('sha512', …, 'base64')`).
- `src/integrity.ts:141` — `computeHashes().integrity` (the canonical `sha512-…`).
- `src/dlx/lockfile.ts` — npm tarball integrity at pin-resolution time.

### Interop checksum — SHA-256 hex (load-bearing, but a SHAPE not a stronger gate)

SHA-256 here is not a weaker security choice — it is the shape upstream tools
emit, so we can compare against `SHA256SUMS` / `shasum -a 256` without reformatting.

- `src/integrity.ts:142` — `computeHashes().checksum`.
- `src/http-request/checksum-file.ts` — parse BSD/GNU `SHA256SUMS` → SRI.
- `src/http-request/download.ts` — post-download checksum verify (timing-safe).
- `src/dlx/binary-download.ts` — verify a caller-PINNED sha256 (trust-on-first-use
  defense: the caller supplies the expected hash up front).

### Content addressing — SHA-256 base64url (load-bearing for the blob scheme)

- `src/crypto/hash.ts` — Socket's content-addressed blob hash (`Q` + base64url(sha256)),
  kept in sync with depscan upstream; `verifyBlobHash` throws on mismatch.

### Cache keys / directory addressing — truncated SHA-512 (NOT trust)

A cache key needs collision resistance enough to keep two specs out of the same
directory — it is never verified as integrity. Truncation is fine.

- `src/dlx/cache.ts:41` — `hash('sha512', spec, 'hex').slice(0, 16)` (64 bits;
  matches npm/npx, Windows MAX_PATH-safe). Hashes the FULL spec
  (`npm:prettier@3.0.0`), not the name alone.
- `src/dlx/binary-download.ts` — binary cache key over `${url}:${binaryName}`.

## Why a flip isn't free

- **Flipping a checksum (sha256→sha512) breaks interop.** The sha256 hex is the
  shape `SHA256SUMS` / `shasum -a 256` produce. Change it and the parse/compare
  against upstream artifacts no longer matches — for zero security gain (integrity
  is already sha512).
- **Flipping a cache key invalidates every existing cache once** and buys nothing
  (it is addressing, not trust).
- **The `integrity` default cannot drop below sha512** — it is the trust string the
  whole fleet pins against.

Net: integrity = SHA-512. checksum = SHA-256 hex, because that is what upstream
speaks. Cache keys = truncated, because they only address.

See also: socket-btm `docs/references/hash-algorithms.md` for the C/C++ side (SEA
stub footer, cacache index-v5, build cache keys) — it follows the same rule.
