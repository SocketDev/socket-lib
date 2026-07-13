/**
 * @file User-Agent header generation for socket-lib's outbound HTTP requests.
 *   Three-token format aligned with socket-cli's `getCliUserAgent` and
 *   coana-tech-cli's `configureAxiosUserAgent`: `<slug>/<version>
 *   node/<node-version> <platform>/<arch>` e.g. `socketsecurity-lib/6.0.0
 *   node/v22.10.0 darwin/arm64` Downstream callers (sdxgen SEA binary, Socket
 *   CLIs, etc.) can identify themselves via the `SOCKET_CALLER_USER_AGENT` env
 *   var, which is appended to the lib's own UA so the server still sees the lib
 *   identifier. @example import { getSocketCallerUserAgent } from
 *   '@socketsecurity/lib/http-request/user-agent'
 *   request.setHeader('User-Agent', getSocketCallerUserAgent())
 */

import process from 'node:process'

import { SOCKET_LIB_NAME, SOCKET_LIB_VERSION } from '../constants/socket'
import { getEnvValue } from '../env/rewire'
import { pkgNameToSlug } from '../packages/specs'
import { ArrayPrototypeJoin, ArrayPrototypePush } from '../primordials/array'
import {
  StringPrototypeCharAt,
  StringPrototypeCharCodeAt,
  StringPrototypeReplace,
  StringPrototypeSlice,
  StringPrototypeTrim,
} from '../primordials/string'

// Cap for a single UA fragment. A caller-supplied identifier (or a UA a proxy
// forwards on behalf of its client) can be arbitrarily long; bound it so a
// hostile or buggy caller can't inflate the header. Generous enough for any
// `slug/version node/x platform/arch` token plus a breadcrumb hop.
const MAX_USER_AGENT_LENGTH = 256

let cachedBaseUserAgent: string | undefined

/**
 * Compose a three-token User-Agent string from a `{ name, version }` pair,
 * optionally appending a caller-supplied identifier.
 *
 * Used directly by socket-lib's own outbound requests (via
 * `getSocketCallerUserAgent`) and exported for sibling packages (socket-cli,
 * socket-sdk-js) so Socket emits one canonical UA shape.
 *
 * @example
 *   ;```typescript
 *   buildUserAgent({ name: '@socketsecurity/lib', version: '6.0.0' })
 *   // 'socketsecurity-lib/6.0.0 node/v22.10.0 darwin/arm64'
 *
 *   buildUserAgent({ name: 'sdxgen', version: '0.5.0' }, 'embedded-by-foo/1')
 *   // 'sdxgen/0.5.0 node/v22.10.0 darwin/arm64 embedded-by-foo/1'
 *   ```
 */
export function buildUserAgent(
  pkg: { name: string; version: string },
  caller?: string | undefined,
): string {
  const base =
    `${pkgNameToSlug(pkg.name)}/${pkg.version} ` +
    `node/${process.version} ` +
    `${process.platform}/${process.arch}`
  // Chain so the caller fragment is sanitized (untrusted) and an empty/blank
  // caller is dropped rather than leaving a trailing space.
  return caller ? chainUserAgents([base, caller]) : base
}

/**
 * Chain User-Agent fragments into a breadcrumb trail, ordered identity → hop
 * (the immediate agent first, each forwarded caller after) so it reads
 * left-to-right and a server's UA parser buckets by the immediate agent. Each
 * fragment is sanitized; empties are dropped; an immediately-repeated fragment
 * is collapsed so re-proxying doesn't stutter the same hop twice.
 *
 * @example
 *   chainUserAgents(['socketsecurity-firewall-api-proxy/0.0.0', 'vlt/1.2.3'])
 *   // 'socketsecurity-firewall-api-proxy/0.0.0 vlt/1.2.3'
 */
export function chainUserAgents(
  parts: ReadonlyArray<string | undefined>,
): string {
  const trail: string[] = []
  for (let i = 0, { length } = parts; i < length; i += 1) {
    const clean = sanitizeUserAgent(parts[i])
    if (clean && trail[trail.length - 1] !== clean) {
      ArrayPrototypePush(trail, clean)
    }
  }
  return ArrayPrototypeJoin(trail, ' ')
}

/**
 * User-Agent header for socket-lib's own outbound HTTP requests.
 *
 * Composes the lib's base UA (lazily cached — name, lib version, node version,
 * platform, and arch are stable for the process lifetime) with the
 * caller-supplied identifier from `SOCKET_CALLER_USER_AGENT` (re-read every
 * call so child-process / test-stub changes propagate).
 *
 * Empty or whitespace-only env values are treated as unset.
 *
 * @example
 *   ;```typescript
 *   // No env override:
 *   getSocketCallerUserAgent()
 *   // 'socketsecurity-lib/6.0.0 node/v22.10.0 darwin/arm64'
 *
 *   // With SOCKET_CALLER_USER_AGENT='sdxgen/0.5.0':
 *   getSocketCallerUserAgent()
 *   // 'socketsecurity-lib/6.0.0 node/v22.10.0 darwin/arm64 sdxgen/0.5.0'
 *   ```
 */
export function getSocketCallerUserAgent(): string {
  if (cachedBaseUserAgent === undefined) {
    cachedBaseUserAgent = buildUserAgent({
      name: SOCKET_LIB_NAME,
      version: SOCKET_LIB_VERSION,
    })
  }
  // Sanitize + drop blank via the chainer — SOCKET_CALLER_USER_AGENT is
  // attacker-influenceable (set by a parent process), so it must not be able to
  // inject header bytes.
  const caller = getEnvValue('SOCKET_CALLER_USER_AGENT')
  return chainUserAgents([cachedBaseUserAgent, caller])
}

/**
 * Sanitize a single User-Agent fragment for safe inclusion in an outgoing HTTP
 * header. A caller identifier (`SOCKET_CALLER_USER_AGENT`, or a UA a proxy
 * forwards on behalf of its client) is untrusted, so strip control chars (C0
 * incl. CR/LF — the header- and log-injection vector — DEL, and C1), collapse
 * internal whitespace to one space, trim, and cap length. Returns '' for
 * nullish / blank / all-control input.
 */
export function sanitizeUserAgent(value: string | undefined): string {
  if (!value) {
    return ''
  }
  // Built without a control-char regex literal (which trips no-control-regex);
  // counted code-unit loop (primordials, no iterator). Control chars are all
  // single code units, so code-unit iteration is correct here.
  let cleaned = ''
  for (let i = 0, { length } = value; i < length; i += 1) {
    const code = StringPrototypeCharCodeAt(value, i)
    cleaned +=
      code < 0x20 || (code >= 0x7f && code <= 0x9f)
        ? ' '
        : StringPrototypeCharAt(value, i)
  }
  cleaned = StringPrototypeTrim(StringPrototypeReplace(cleaned, /\s+/g, ' '))
  return cleaned.length > MAX_USER_AGENT_LENGTH
    ? StringPrototypeTrim(
        StringPrototypeSlice(cleaned, 0, MAX_USER_AGENT_LENGTH),
      )
    : cleaned
}
