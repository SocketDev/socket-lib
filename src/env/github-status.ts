/**
 * @file Probe githubstatus.com to detect platform degradation before making
 *   GitHub API calls. Useful in scripts, release tooling, and CI pre-flight
 *   checks where a cryptic "operation was canceled" error would otherwise mask
 *   an upstream GitHub outage. Component IDs are stable GitHub-assigned
 *   identifiers from githubstatus.com/api/v2/components.json. The probe adds at
 *   most 8 seconds to startup (configurable timeout) and fails open on network
 *   error so a down status page never blocks a healthy workflow.
 */

// oxlint-disable-next-line socket/no-platform-specific-import -- server-only module; node platform is intentional.
import { httpJson } from '../http-request/node'

export type GitHubComponentStatus =
  | 'degraded_performance'
  | 'major_outage'
  | 'operational'
  | 'partial_outage'
  | 'under_maintenance'

export type GitHubStatusResult = {
  /**
   * Worst-case status across all monitored components.
   */
  status: GitHubComponentStatus | 'unknown'
  /**
   * Whether any monitored component is not fully operational.
   */
  degraded: boolean
  /**
   * Human-readable summary, e.g. "Actions: degraded_performance".
   */
  summary: string
  /**
   * Per-component breakdown for the monitored set.
   */
  components: Array<{
    id: string
    name: string
    status: GitHubComponentStatus
  }>
}

// Component IDs that matter for CI / GitHub API call workflows.
// Stable identifiers from githubstatus.com; the names are display-only.
const MONITORED_COMPONENT_IDS: ReadonlyMap<string, string> = new Map([
  ['br0l2tvcx85d', 'Actions'],
  ['8l4ygp009s5s', 'Git Operations'],
  ['brv1bkgrwx7q', 'API Requests'],
])

const SEVERITY: ReadonlyMap<string, number> = new Map([
  ['major_outage', 4],
  ['partial_outage', 3],
  ['degraded_performance', 2],
  ['under_maintenance', 1],
  ['operational', 0],
])

const STATUS_API_URL = 'https://www.githubstatus.com/api/v2/components.json'

/**
 * Probe githubstatus.com and return the health of GitHub Actions, Git
 * Operations, and API Requests. Fails open (returns `{ status: 'unknown' }`)
 * when the probe itself fails — so a down status page never blocks a healthy
 * workflow.
 *
 * @example
 *   ;```typescript
 *   import { probeGitHubStatus } from '@socketsecurity/lib/env/github-status'
 *
 *   const health = await probeGitHubStatus()
 *   if (health.degraded) {
 *   console.warn(`GitHub degraded: ${health.summary}`)
 *   }
 *   ```
 *
 * @param timeoutMs - Maximum milliseconds to wait for the probe. Default 8000.
 */
export async function probeGitHubStatus(
  timeoutMs = 8000,
): Promise<GitHubStatusResult> {
  let body: unknown
  try {
    body = await httpJson(STATUS_API_URL, {
      timeout: timeoutMs,
    })
  } catch {
    return {
      status: 'unknown',
      degraded: false,
      summary: 'githubstatus.com unreachable — cannot confirm GitHub health',
      components: [],
    }
  }

  const raw = body as {
    components?: Array<{ id: string; name: string; status: string }> | undefined
  }
  const allComponents = raw.components ?? []

  const monitored: GitHubStatusResult['components'] = []
  let worstSeverity = 0
  let worstStatus: GitHubComponentStatus = 'operational'

  for (const c of allComponents) {
    const name = MONITORED_COMPONENT_IDS.get(c.id)
    if (!name) {
      continue
    }
    const status = c.status as GitHubComponentStatus
    const sev = SEVERITY.get(status) ?? 0
    if (sev > worstSeverity) {
      worstSeverity = sev
      worstStatus = status
    }
    monitored.push({ id: c.id, name, status })
  }

  const degradedComponents = monitored.filter(c => c.status !== 'operational')
  const degraded = degradedComponents.length > 0
  const summary = degraded
    ? degradedComponents.map(c => `${c.name}: ${c.status}`).join(', ')
    : 'All monitored GitHub components operational'

  return {
    status: worstStatus,
    degraded,
    summary,
    components: monitored,
  }
}
