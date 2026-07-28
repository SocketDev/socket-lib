/**
 * @file Socket Firewall integration for dlx installs.
 *
 *   - `npmPurl` — build a PURL string for an npm package
 *   - `checkFirewallPurls` — scan an Arborist ideal tree against the public
 *     Socket Firewall API; throws if any dep is critical/high Split out of
 *     `dlx/package.ts` so the firewall logic + PURL helper can be reused by
 *     other dlx flows without dragging in the install orchestrator.
 */

import type Arborist from '../external/@npmcli/arborist'
// oxlint-disable-next-line socket/no-platform-specific-import -- the relative barrel '../http-request' has no index.ts and exports-map resolution only applies to the bare package name, so only the explicit /node path resolves here (the rule's autofix produces an unresolvable import — verified TS2307).
import { httpJson } from '../http-request/node'
import { getSocketCallerUserAgent } from '../http-request/user-agent'

import { ErrorCtor } from '../primordials/error'

import { SetCtor } from '../primordials/map-set'

import { PromiseAllSettled } from '../primordials/promise'

import {
  StringPrototypeReplace,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string'

const FIREWALL_API_URL = 'https://firewall-api.socket.dev/purl'
const FIREWALL_TIMEOUT = 10_000
const FIREWALL_BLOCK_SEVERITIES: ReadonlySet<string> = new SetCtor([
  'critical',
  'high',
])

export interface FirewallAlert {
  severity?: string | undefined
  type?: string | undefined
  key?: string | undefined
}

export interface FirewallResponse {
  alerts?: FirewallAlert[] | undefined
}

/**
 * Check all resolved packages in an Arborist ideal tree against the Socket
 * Firewall API (public, no auth required). Throws if any dependency has
 * critical or high severity alerts.
 *
 * @private
 *
 * @param arb - Arborist instance with populated idealTree.
 * @param requestedPackage - Top-level package name (for error messages)
 */
export async function checkFirewallPurls(
  arb: InstanceType<typeof Arborist>,
  requestedPackage: string,
): Promise<void> {
  const idealTree = arb.idealTree
  if (!idealTree) {
    return
  }

  // Collect PURLs for all non-root resolved nodes.
  const purls: Array<{ purl: string; name: string; version: string }> = []
  for (const node of idealTree.inventory.values()) {
    if (node.isProjectRoot) {
      continue
    }
    const { name, version } = node.package
    if (!name || !version) {
      continue
    }
    purls.push({ purl: npmPurl(name, version), name, version })
  }
  if (purls.length === 0) {
    return
  }

  const blocked: Array<{
    name: string
    version: string
    alerts: string[]
  }> = []

  // Check all PURLs against the public firewall API in parallel.
  await PromiseAllSettled(
    purls.map(async ({ name, purl, version }) => {
      try {
        const data = await httpJson<FirewallResponse>(
          `${FIREWALL_API_URL}/${encodeURIComponent(purl)}`,
          {
            headers: { 'User-Agent': getSocketCallerUserAgent() },
            timeout: FIREWALL_TIMEOUT,
            retries: 1,
            retryDelay: 500,
          },
        )
        const blocking = (data.alerts ?? []).filter(
          a => a.severity && FIREWALL_BLOCK_SEVERITIES.has(a.severity),
        )
        if (blocking.length > 0) {
          blocked.push({
            name,
            version,
            alerts: blocking.map(
              a => `${a.severity}: ${a.type ?? a.key ?? 'unknown'}`,
            ),
          })
        }
      } catch {
        // Firewall API errors are non-fatal — allow install to proceed.
      }
    }),
  )

  if (blocked.length > 0) {
    const details = blocked
      .map(b => `  ${b.name}@${b.version}: ${b.alerts.join(', ')}`)
      .join('\n')
    throw new ErrorCtor(
      `Socket Firewall blocked installation of "${requestedPackage}".\n` +
        `The following dependencies have security alerts:\n${details}\n\n` +
        'Visit https://socket.dev for more information.',
    )
  }
}

/**
 * Build a PURL string for an npm package. Follows the PURL spec for the npm
 * type: - Scoped: `@scope/pkg` → `pkg:npm/%40scope/pkg@version` - Unscoped:
 * `pkg` → `pkg:npm/pkg@version`
 */
export function npmPurl(name: string, version: string): string {
  const encoded = StringPrototypeStartsWith(name, '@')
    ? `%40${StringPrototypeSlice(name, 1)}`
    : name
  // PURL spec: '+' in version must be encoded as %2B
  const encodedVersion = StringPrototypeReplace(version, /\+/g, '%2B')
  return `pkg:npm/${encoded}@${encodedVersion}`
}
