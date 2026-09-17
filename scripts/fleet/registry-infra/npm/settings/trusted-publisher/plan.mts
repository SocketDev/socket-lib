/**
 * @file Pure planners for the npm Trusted Publisher settings driver — the
 *   canonical desired config (law as data), the desired-vs-current diffing, the
 *   re-read-based save verify, and the human-readable renderers. No browser
 *   automation, no network — every page
 *   value arrives already parsed by `trusted-publisher/parse.mts`, so all of
 *   this is unit-testable from fixtures. The browser side uses bounded bridge
 *   operations from `trusted-publisher/browser.mts`.
 */

import { PUBLISH_FIRST } from '../migrations.mts'
import { allowsAction } from './parse.mts'
import type { AccessPageState, TrustedPublisherCurrent } from './parse.mts'

export const CANONICAL_WORKFLOW_FILENAME =
  PUBLISH_FIRST.workflows['npm-publish.yml']!
export const CANONICAL_ENVIRONMENT_NAME =
  PUBLISH_FIRST.environments['npm-publish']!
// Staged-only: direct `npm publish` stays UNCHECKED on every trusted
// publisher, so the only path to a public version is a staged publish
// promoted by a human. The approve/promote step is an account action by the
// approver, not an OIDC workflow action, so the workflow never needs the
// plain-publish grant.
export const CANONICAL_ALLOW_NPM_PUBLISH = false

// Two workflows publish npm packages, so the desired workflow filename is not
// one constant. A napi repo builds its native `.node` addons in a SEPARATE
// workflow (`publish-npm-addons.yml`) and its per-platform packages —
// `@owner/<name>-<napi-target>`, e.g. `@stuie/core-darwin-arm64` — publish from
// THAT workflow; the js/meta packages still publish from `publish-npm.yml`. A
// platform package's OIDC claim names its real workflow, so pointing it at the
// js workflow makes npm reject the publish on a workflow-claim mismatch.
// `desiredTrustedPublisher` picks `publish-npm-addons.yml` for a package whose
// name ends with `-<platform>` for a platform in the repo's `napi.platforms`,
// and `publish-npm.yml` for everything else.
export const CANONICAL_NAPI_WORKFLOW_FILENAME =
  PUBLISH_FIRST.workflows['npm-publish-napi.yml']!

// A third workflow, for the same reason as the napi one. The drop-in family
// under `@socketregistry/*` is staged by socket-registry's own
// `publish-npm-packages.yml`, not by the repo's `publish-npm.yml`, which
// publishes the `@socketsecurity/registry` package itself. npm matches the OIDC
// claim on the workflow filename, so a family package bound to the wrong one
// gets a 401 at stage time with nothing in the message naming the cause
// (observed 2026-08-05 across nine packages).
export const CANONICAL_FAMILY_WORKFLOW_FILENAME =
  PUBLISH_FIRST.workflows['npm-publish-packages.yml']!

export const LEGACY_WORKFLOW_FILENAMES: readonly string[] = [
  ...Object.keys(PUBLISH_FIRST.workflows),
  '_local-not-for-reuse-provenance.yml',
]

// Every @socketregistry/* package publishes from the socket-registry monorepo.
export const SOCKET_REGISTRY_SCOPE = '@socketregistry/'
export const SOCKET_REGISTRY_REPO_OWNER = 'SocketDev'
export const SOCKET_REGISTRY_REPO_NAME = 'socket-registry'

/**
 * The Trusted Publisher shape a package SHOULD have — one row of the law.
 */
export interface TrustedPublisherDesired {
  allowNpmPublish: boolean
  environmentName: string
  repositoryName: string
  repositoryOwner: string
  workflowFilename: string
}

/**
 * Whether `pkg` is a napi PLATFORM package: its name ends with `-<platform>`
 * for some platform in `napiPlatforms` (the repo's `napi.platforms` tokens,
 * napi-rs vocabulary — `darwin-arm64`, `linux-x64-gnu`, `win32-x64-msvc` — the
 * same tokens that tail a per-platform package name, e.g.
 * `@stuie/core-linux-x64-gnu`). The base/meta package (`@stuie/core`) and any
 * js package are NOT platform packages. A near-miss on a shorter suffix does
 * not count: `@stuie/core-darwin` against platform `darwin-arm64` is false,
 * because `-darwin` is not the `-darwin-arm64` tail. Pure — exported for tests.
 */
export function isNapiPlatformPackage(
  pkg: string,
  napiPlatforms: readonly string[],
): boolean {
  for (let i = 0, { length } = napiPlatforms; i < length; i += 1) {
    const platform = napiPlatforms[i]!
    if (platform && pkg.endsWith(`-${platform}`)) {
      return true
    }
  }
  return false
}

function inferredWorkflowFilename(config: {
  napiPlatforms: readonly string[]
  packageName: string
  repositoryName: string
  repositoryOwner: string
}): string {
  const cfg = { __proto__: null, ...config } as typeof config
  if (
    cfg.napiPlatforms.length &&
    isNapiPlatformPackage(cfg.packageName, cfg.napiPlatforms)
  ) {
    return CANONICAL_NAPI_WORKFLOW_FILENAME
  }
  if (
    cfg.packageName.startsWith(SOCKET_REGISTRY_SCOPE) &&
    cfg.repositoryOwner.toLowerCase() ===
      SOCKET_REGISTRY_REPO_OWNER.toLowerCase() &&
    cfg.repositoryName.toLowerCase() === SOCKET_REGISTRY_REPO_NAME.toLowerCase()
  ) {
    return CANONICAL_FAMILY_WORKFLOW_FILENAME
  }
  return CANONICAL_WORKFLOW_FILENAME
}

/**
 * The desired config for `pkg`, or undefined when no repo can be derived.
 * Repo resolution, in precedence order: the verified `repoOverride`
 * (`owner/name`), then the package's own currently configured repository.
 * A package namespace is not ownership evidence. The family workflow applies
 * only when the resolved repository is socket-registry. The workflow
 * filename is the js workflow
 * (`publish-npm.yml`) for a js/meta package and the napi workflow
 * (`publish-npm-addons.yml`) for a napi platform package, decided by
 * `isNapiPlatformPackage` against the repo's `napiPlatforms`. Everything else
 * is fixed by the canonical law consts. Pure — exported for tests.
 */
export function desiredTrustedPublisher(config: {
  current?: TrustedPublisherCurrent | undefined
  environmentOverride?: string | undefined
  napiPlatforms?: readonly string[] | undefined
  pkg: string
  repoOverride?: string | undefined
  workflowOverride?: string | undefined
}): TrustedPublisherDesired | undefined {
  const cfg = { __proto__: null, ...config } as typeof config
  let owner: string | undefined
  let name: string | undefined
  if (cfg.repoOverride) {
    const slashIdx = cfg.repoOverride.indexOf('/')
    if (slashIdx > 0) {
      owner = cfg.repoOverride.slice(0, slashIdx)
      name = cfg.repoOverride.slice(slashIdx + 1) || undefined
    }
  } else if (cfg.current?.repositoryOwner && cfg.current.repositoryName) {
    owner = cfg.current.repositoryOwner
    name = cfg.current.repositoryName
  }
  if (!owner || !name) {
    return undefined
  }
  const workflowFilename =
    cfg.workflowOverride ??
    inferredWorkflowFilename({
      napiPlatforms: cfg.napiPlatforms ?? [],
      packageName: cfg.pkg,
      repositoryName: name,
      repositoryOwner: owner,
    })
  return {
    allowNpmPublish: CANONICAL_ALLOW_NPM_PUBLISH,
    environmentName: cfg.environmentOverride ?? CANONICAL_ENVIRONMENT_NAME,
    repositoryName: name,
    repositoryOwner: owner,
    workflowFilename,
  }
}

/**
 * One planned form edit, keyed by npm's form field name (the wire contract:
 * `repositoryOwner`, `repositoryName`, `workflowName`,
 * `githubEnvironmentName`, `oidc-allow-publish`).
 */
export interface FormEdit {
  field: string
  from: string
  to: string
}

/**
 * The exact form edits that take `current` to `desired` — empty means the
 * config already conforms. An unconfigured package (undefined `current`)
 * yields the full field set. An EMPTY environment is a mismatch, never a
 * wildcard: the fleet's branch-restricted `publish-npm` environment only
 * engages when the config names it, so a blank field is exactly the staleness
 * this driver exists to fix. A legacy workflow filename likewise never
 * conforms. Pure — exported for tests.
 */
export function diffTrustedPublisher(config: {
  current?: TrustedPublisherCurrent | undefined
  desired: TrustedPublisherDesired
}): FormEdit[] {
  const cfg = { __proto__: null, ...config } as typeof config
  const { current, desired } = cfg
  const edits: FormEdit[] = []
  const push = (field: string, from: string | undefined, to: string) => {
    const have = from ?? ''
    if (have !== to) {
      edits.push({ field, from: have === '' ? '(empty)' : have, to })
    }
  }
  push('repositoryOwner', current?.repositoryOwner, desired.repositoryOwner)
  push('repositoryName', current?.repositoryName, desired.repositoryName)
  push('workflowName', current?.workflowFilename, desired.workflowFilename)
  push(
    'githubEnvironmentName',
    current?.environmentName,
    desired.environmentName,
  )
  const actions = current?.allowedActions ?? []
  const allowPublish = allowsAction(actions, 'publish')
  if (allowPublish !== desired.allowNpmPublish) {
    edits.push({
      field: 'oidc-allow-publish',
      from: allowPublish ? 'checked' : 'unchecked',
      to: desired.allowNpmPublish ? 'checked' : 'unchecked',
    })
  }
  return edits
}

/**
 * The verdict after a Save: did the RE-READ page land on `desired`? Success
 * is the page's answer, never the click — a `reread` of undefined (the page
 * would not re-read, or came back unconfigured) FAILS, because a click whose
 * outcome cannot be observed proves nothing. Pure — exported for tests.
 */
export function verifySavedState(config: {
  desired: TrustedPublisherDesired
  reread: TrustedPublisherCurrent | undefined
}): { mismatches: string[]; ok: boolean } {
  const cfg = { __proto__: null, ...config } as typeof config
  if (!cfg.reread) {
    return {
      mismatches: ['form not readable after save — saved state unproven'],
      ok: false,
    }
  }
  const edits = diffTrustedPublisher({
    current: cfg.reread,
    desired: cfg.desired,
  })
  const mismatches: string[] = []
  for (let i = 0, { length } = edits; i < length; i += 1) {
    const e = edits[i]!
    mismatches.push(`${e.field}: saved ${e.from}, wanted ${e.to}`)
  }
  return { mismatches, ok: mismatches.length === 0 }
}

/**
 * The per-package failure detail after a fresh read failed to verify. It says
 * the live row may be partially saved (the save
 * click landed, so some fields can already be live while others are not),
 * names each mismatched field with its saved-vs-wanted values, and points at
 * the page to hand-correct. Pure — exported for tests.
 */
export function formatPartialSaveFailure(config: {
  mismatches: readonly string[]
  url: string
}): string {
  const cfg = { __proto__: null, ...config } as typeof config
  return (
    'saved state did not verify after a fresh read - the live row may be ' +
    `PARTIALLY saved. Fields off desired: ${cfg.mismatches.join('; ')}. ` +
    `Fix: open ${cfg.url} and correct those fields by hand.`
  )
}

/**
 * One package's read-mode outcome, ready for the table renderer.
 */
export interface AccessReadRow {
  current?: TrustedPublisherCurrent | undefined
  detail?: string | undefined
  pkg: string
  state: AccessPageState
}

/**
 * The allowed-action cell for one read row, with any grant token npm sent that
 * nothing maps NAMED beside the recognized actions.
 *
 * An unmapped token is never folded into a count or dropped. A live audit found
 * a package carrying a 13-character grant token nobody could identify, and
 * because the reader discarded what it could not map, the row rendered as a
 * clean stage-only grant — the one shape that is allowed to be skipped. Pure —
 * exported for tests.
 */
export function describeReadActions(
  current: TrustedPublisherCurrent | undefined,
): string {
  const actions = current?.allowedActions ?? []
  const unmapped = current?.unmappedPermissions ?? []
  const parts: string[] = []
  if (actions.length) {
    parts.push(actions.join(' + '))
  }
  if (unmapped.length) {
    parts.push(`unmapped: ${unmapped.join(', ')}`)
  }
  return parts.length ? parts.join(' | ') : '-'
}

// The read-mode verdict for one row: conforming, stale (with the stale form
// fields named), or the non-configured state. An unmapped grant token is
// appended by name to whatever the verdict is, because a row carrying a grant
// nobody can read is not a row anyone should act on unexamined.
function readVerdict(row: AccessReadRow): string {
  const base = readStateVerdict(row)
  const unmapped = row.current?.unmappedPermissions ?? []
  return unmapped.length
    ? `${base}; unmapped grant: ${unmapped.join(', ')}`
    : base
}

function readStateVerdict(row: AccessReadRow): string {
  if (row.state !== 'configured') {
    return row.detail ? `${row.state}: ${row.detail}` : row.state
  }
  const desired = desiredTrustedPublisher({
    current: row.current,
    pkg: row.pkg,
  })
  if (!desired) {
    return 'configured (no repo readable)'
  }
  const edits = diffTrustedPublisher({ current: row.current, desired })
  if (edits.length === 0) {
    return 'conforms'
  }
  const fields: string[] = []
  for (let i = 0, { length } = edits; i < length; i += 1) {
    fields.push(edits[i]!.field)
  }
  return `stale: ${fields.join(', ')}`
}

/**
 * Render read-mode rows as an aligned table: package, repo, workflow,
 * environment, allowed actions, verdict. Pure — exported for tests.
 */
const READ_TABLE_HEADER = [
  'package',
  'repo',
  'workflow',
  'environment',
  'allowed actions',
  'verdict',
]

// One cell row per package, header first, every absent registry field spelled
// as a placeholder so a column never collapses.
function readTableCells(rows: readonly AccessReadRow[]): string[][] {
  const lines: string[][] = [READ_TABLE_HEADER]
  for (let i = 0, { length } = rows; i < length; i += 1) {
    const row = rows[i]!
    const c = row.current
    const repo =
      c?.repositoryOwner && c.repositoryName
        ? `${c.repositoryOwner}/${c.repositoryName}`
        : '-'
    lines.push([
      row.pkg,
      repo,
      c?.workflowFilename ?? '-',
      c?.environmentName ?? '(empty)',
      describeReadActions(c),
      readVerdict(row),
    ])
  }
  return lines
}

// Widest cell per column, header included.
function tableColumnWidths(lines: readonly string[][]): number[] {
  const widths: number[] = []
  for (let col = 0, cols = lines[0]?.length ?? 0; col < cols; col += 1) {
    let w = 0
    for (let i = 0, { length } = lines; i < length; i += 1) {
      const cell = lines[i]![col] ?? ''
      if (cell.length > w) {
        w = cell.length
      }
    }
    widths.push(w)
  }
  return widths
}

// Pad each cell to its column width, two spaces between columns, no trailing
// run on a short last cell.
function alignTableRows(
  lines: readonly string[][],
  widths: readonly number[],
): string {
  const rendered: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const cells = lines[i]!
    const padded: string[] = []
    for (let col = 0, cols = cells.length; col < cols; col += 1) {
      padded.push((cells[col] ?? '').padEnd(widths[col]!))
    }
    rendered.push(padded.join('  ').trimEnd())
  }
  return rendered.join('\n')
}

export function renderReadTable(rows: readonly AccessReadRow[]): string {
  const lines = readTableCells(rows)
  return alignTableRows(lines, tableColumnWidths(lines))
}

/**
 * Render one package's planned form edits for the apply dry-run. Pure —
 * exported for tests.
 */
export function renderPlannedEdits(
  pkg: string,
  edits: readonly FormEdit[],
): string {
  if (edits.length === 0) {
    return `${pkg}: conforms — no edits`
  }
  const lines = [`${pkg}:`]
  for (let i = 0, { length } = edits; i < length; i += 1) {
    const e = edits[i]!
    lines.push(`    ${e.field}: ${e.from} -> ${e.to}`)
  }
  return lines.join('\n')
}

export type ApplyStatus =
  | 'applied'
  | 'conforms'
  | 'failed'
  | 'planned'
  | 'skipped'

export interface ApplyResult {
  detail?: string | undefined
  pkg: string
  status: ApplyStatus
}

/**
 * One-line human summary of an apply run: counts by status, tagged with the
 * mode. Pure — exported for tests.
 */
export function formatApplySummary(
  results: readonly ApplyResult[],
  config: { drive: boolean },
): string {
  const cfg = { __proto__: null, ...config } as { drive: boolean }
  const count = (status: ApplyStatus): number => {
    let n = 0
    for (let i = 0, { length } = results; i < length; i += 1) {
      if (results[i]!.status === status) {
        n += 1
      }
    }
    return n
  }
  return (
    `Trusted-publisher ${cfg.drive ? 'drive' : 'dry-run'} summary: ` +
    `${count('applied')} applied, ${count('planned')} planned, ` +
    `${count('conforms')} conforming, ${count('skipped')} skipped, ` +
    `${count('failed')} failed.`
  )
}
