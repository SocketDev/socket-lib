/**
 * @file User-Agent header generation for socket-lib's outbound HTTP requests.
 *   Three-token format aligned with socket-cli's `getCliUserAgent` and
 *   coana-tech-cli's `configureAxiosUserAgent`: `<slug>/<version>
 *   node/<node-version> <platform>/<arch>` e.g. `socketsecurity-lib/6.0.0
 *   node/v22.10.0 darwin/arm64` Downstream callers (sdxgen SEA binary, fleet
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

/**
 * Compose a three-token User-Agent string from a `{ name, version }` pair,
 * optionally appending a caller-supplied identifier.
 *
 * Used directly by socket-lib's own outbound requests (via
 * `getSocketCallerUserAgent`) and exported for sibling packages (socket-cli,
 * socket-sdk-js) so the fleet emits one canonical UA shape.
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
  return caller ? `${base} ${caller}` : base
}

let cachedBaseUserAgent: string | undefined

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
  const caller = getEnvValue('SOCKET_CALLER_USER_AGENT')
  return caller?.trim()
    ? `${cachedBaseUserAgent} ${caller}`
    : cachedBaseUserAgent
}
