/**
 * @file Deep redaction for payloads that carry live credentials beside state
 *   worth keeping (audit inventories, captured API responses, transcripts).
 *   `redactContext` strips credential-bearing fields as the payload is read,
 *   so no caller ever holds a secret it could log. Value-shape detection
 *   derives from the shared secret catalog (`secrets/patterns`) instead of a
 *   second copy, so a vendor shape added there is caught here for free.
 *   Pure by design: no network, no filesystem — unit-testable on its own.
 */

import { scanSecretValues } from './patterns.mjs'

/**
 * Written in place of a credential-bearing value.
 */
export const REDACTED = '[redacted]'

/**
 * Written in place of a bulky or unwalkable field (an over-deep subtree, a
 * cycle, or a key in the omit list).
 */
export const OMITTED = '[omitted]'

// Keys whose entire value is a credential. Matched whole rather than as a
// substring so `stagedPublishingEnabled` and `tokenCount` survive the walk.
const SECRET_KEY_EXACT =
  /^(?:apikey|csrftoken|password|secret|sessionid|token)$/i

// Keys whose NAME carries a credential marker anywhere in it. Vendors vary the
// spelling between payloads (`csrftoken`, `csrfToken`, `_csrf`), so this pass
// is substring-matched where the exact list is not.
const SECRET_KEY_PART = /bearer|cookie|csrf|linkstate|privatekey/i

// Bulky fields with no audit value: signed avatar URLs and a SPA's own asset
// manifest, which together dwarf the state worth keeping.
const OMITTED_KEYS = new Set(['avatars', 'chunks'])

// Deep enough for every payload these walks are expected to see. The cap is a
// backstop against pathological nesting, not a depth payloads should reach.
const MAX_DEPTH = 12

/**
 * A copy of `value` with every credential-bearing field replaced. Walks
 * objects and arrays; leaves other primitives alone.
 *
 * Two passes, because a secret can hide behind either its key or its shape: a
 * field NAMED like a credential is redacted whatever it holds, and a string
 * that MATCHES a known token shape is redacted whatever it is called. The
 * second pass is what catches a token a vendor moves to a field the key list
 * has never seen.
 *
 * @example
 *   ;```ts
 *   redactContext({ token: 'abc', count: 2 })
 *   // { token: '[redacted]', count: 2 }
 *   ```
 *
 * @param value - The payload to copy and redact.
 *
 * @returns A redacted copy of `value`.
 */
export function redactContext(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet())
}

// `ancestors` holds only the objects currently being walked, added on the way
// down and removed on the way back up. That makes it a cycle guard rather than
// a de-duplicator: the same object appearing twice as siblings is legitimate
// and must be kept, while an object containing itself must not recurse.
export function redactValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return scanSecretValues(value) ? REDACTED : value
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (depth >= MAX_DEPTH) {
    return OMITTED
  }
  const node = value as object
  if (ancestors.has(node)) {
    return OMITTED
  }
  ancestors.add(node)
  try {
    if (Array.isArray(value)) {
      return value.map(entry => redactValue(entry, depth + 1, ancestors))
    }
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const keys = Object.keys(source)
    for (let i = 0, { length } = keys; i < length; i += 1) {
      const key = keys[i]!
      if (OMITTED_KEYS.has(key)) {
        out[key] = OMITTED
      } else if (SECRET_KEY_EXACT.test(key) || SECRET_KEY_PART.test(key)) {
        out[key] = REDACTED
      } else {
        out[key] = redactValue(source[key], depth + 1, ancestors)
      }
    }
    return out
  } finally {
    ancestors.delete(node)
  }
}
