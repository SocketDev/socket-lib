import { Value } from '@sinclair/typebox/value'

import {
  OidcConnectionSchema,
  resolveOidcPermissionAction,
} from '../../access-context-schema.mts'
import type { OidcConnection } from '../../access-context-schema.mts'
import { isCloudflareChallenge } from '../../staged-browser-parse.mts'

export type AccessPageState =
  | 'auth'
  | 'challenge'
  | 'configured'
  | 'error'
  | 'reconcile-required'
  | 'step-up'
  | 'unconfigured'

function hasConfiguredPublisherMarkers(body: string): boolean {
  if (parseOidcConnection(body)) {
    return true
  }
  if (/id="github-repoInfo"/.test(body)) {
    return true
  }
  return (
    /\\?"trustedPublisher\\?"\s*:/.test(body) ||
    /\\?"trustedPublisherConfigured\\?"\s*:\s*true/.test(body)
  )
}

function hasPublishingAccessMarkers(body: string): boolean {
  return (
    /Trusted [Pp]ublish(?:er|ing)/.test(body) ||
    /Publishing access/i.test(body) ||
    /publishingAccess/.test(body)
  )
}

/**
 * Classify an access-page fetch by body + status. Challenge markup wins over
 * everything (a challenge can arrive as a 200, 403, or 503, and treating it
 * as auth/error would abort a batch that only needed a cooldown); a plain
 * 401/403 or a signed-out page is `auth`; any other non-2xx is `error`; a
 * readable page is `configured` when the trusted-publisher summary markers
 * are present, `unconfigured` when only the access-settings shell renders.
 * Pure — exported for tests.
 */
export function classifyAccessPage(config: {
  body?: string | undefined
  status: number
}): AccessPageState {
  const cfg = { __proto__: null, ...config } as typeof config
  const body = cfg.body ?? ''
  if (isCloudflareChallenge(body)) {
    return 'challenge'
  }
  if (cfg.status === 401 || cfg.status === 403) {
    return 'auth'
  }
  if (/sign in to npm/i.test(body) && !/Trusted [Pp]ublish/.test(body)) {
    return 'auth'
  }
  // npm's 2FA step-up: the session IS signed in, but npm serves its /escalate
  // wall instead of the access page (observed 2026-08-06: the payload carries
  // escalateType + action:"/escalate" + the originalUrl it is guarding, and
  // NO oidcConnections — so before this branch, a live configured row read as
  // "unconfigured" and a caller would plan a create over it).
  if (
    /\\?"escalateType\\?"\s*:/.test(body) &&
    /\\?"action\\?"\s*:\s*\\?"\/escalate\\?"/.test(body)
  ) {
    return 'step-up'
  }
  if (cfg.status < 200 || cfg.status >= 400) {
    return 'error'
  }
  if (hasConfiguredPublisherMarkers(body)) {
    return 'configured'
  }
  if (hasPublishingAccessMarkers(body)) {
    return 'unconfigured'
  }
  // An HTML body with NONE of the known access-page signatures is an unknown
  // shape, and unknown must read as error, never as "unconfigured". A
  // wrong-but-confident verdict is what makes npm markup drift dangerous:
  // a caller would plan a create over a row it could not see.
  return 'error'
}

/**
 * The Trusted Publisher form's CURRENT values as read off the access page.
 * `allowedActions` holds the rendered permission strings (`npm publish`,
 * `npm stage publish`) in page order. `unmappedPermissions` holds the grant
 * tokens npm sent that nothing maps — kept BY NAME rather than dropped, so a
 * grant this reader does not understand is something the operator sees instead
 * of a package that quietly reads as narrowed.
 */
export interface TrustedPublisherCurrent {
  allowedActions: string[]
  environmentName: string | undefined
  repositoryName: string | undefined
  repositoryOwner: string | undefined
  unmappedClaims?: string[] | undefined
  unmappedPermissions: string[]
  workflowFilename: string | undefined
}

export interface TrustedPublisherBridgeRead {
  bindings: TrustedPublisherCurrent[]
  current: TrustedPublisherCurrent | undefined
  state: 'configured' | 'reconcile-required' | 'unconfigured'
}

export interface TrustedPublisherBridgeBinding {
  allowNpmPublish: boolean
  environmentName: string
  repositoryName: string
  repositoryOwner: string
  workflowFilename: string
}

function hasExactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === expected.length &&
    expected.every(key => Object.hasOwn(value, key))
  )
}

export function parseTrustedPublisherBridgeResult(
  result: Record<string, unknown>,
): TrustedPublisherBridgeRead {
  const state = result['state']
  if (state === 'unconfigured') {
    if (!hasExactObjectKeys(result, ['state'])) {
      throw new Error(
        'npm trusted-publisher read returned an invalid unconfigured state',
      )
    }
    return { bindings: [], current: undefined, state }
  }
  const collection = state === 'reconcile-required'
  if (state !== 'configured' && !collection) {
    throw new Error(
      `npm trusted-publisher read did not produce a settings state: ${String(state)}`,
    )
  }
  const expectedKeys = collection ? ['bindings', 'state'] : ['current', 'state']
  if (!hasExactObjectKeys(result, expectedKeys)) {
    throw new Error('npm trusted-publisher read returned an invalid state')
  }
  const rawBindings = collection ? result['bindings'] : [result['current']]
  if (!Array.isArray(rawBindings) || rawBindings.length === 0) {
    throw new Error('npm trusted-publisher read returned invalid bindings')
  }
  const bindings = rawBindings.map(parseTrustedPublisherBridgeBinding)
  return {
    bindings,
    current: collection ? undefined : bindings[0],
    state,
  }
}

function parseTrustedPublisherBridgeBinding(
  current: unknown,
): TrustedPublisherCurrent {
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error('npm trusted-publisher read returned an invalid binding')
  }
  const fields = current as Record<string, unknown>
  const fieldNames = [
    'allowNpmPublish',
    'environmentName',
    'repositoryName',
    'repositoryOwner',
    'workflowFilename',
  ] as const
  if (
    !hasExactObjectKeys(fields, fieldNames) ||
    typeof fields['allowNpmPublish'] !== 'boolean' ||
    !fieldNames.slice(1).every(name => typeof fields[name] === 'string')
  ) {
    throw new Error('npm trusted-publisher read returned an invalid binding')
  }
  const allowedActions = ['npm stage publish']
  if (fields['allowNpmPublish']) {
    allowedActions.push('npm publish')
  }
  return {
    allowedActions,
    environmentName: fields['environmentName'] as string,
    repositoryName: fields['repositoryName'] as string,
    repositoryOwner: fields['repositoryOwner'] as string,
    unmappedPermissions: [],
    workflowFilename: fields['workflowFilename'] as string,
  }
}

export function trustedPublisherBridgeBinding(
  current: TrustedPublisherCurrent | undefined,
): TrustedPublisherBridgeBinding | null {
  if (!current) {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- wire schema
    return null
  }
  return {
    allowNpmPublish: allowsAction(current.allowedActions, 'publish'),
    environmentName: current.environmentName ?? '',
    repositoryName: current.repositoryName ?? '',
    repositoryOwner: current.repositoryOwner ?? '',
    workflowFilename: current.workflowFilename ?? '',
  }
}

/**
 * The index of the `]` that closes the array opening at `open`, or -1 when the
 * body never closes it. STRING-AWARE: a `]` inside a JSON string (a workflow
 * filename, an environment name) is content, not structure — counting it would
 * truncate the slice and make a live row read as unconfigured.
 */
function oidcConnectionsArrayEnd(body: string, open: number): number {
  let depth = 0
  let inString = false
  for (let i = open, { length } = body; i < length; i += 1) {
    const ch = body[i]
    if (inString) {
      if (ch === '\\') {
        i += 1
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '[') {
      depth += 1
    } else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

function splitOidcPermissionTokens(permissions: readonly unknown[]): {
  allowedActions: string[]
  unmappedPermissions: string[]
} {
  const allowedActions: string[] = []
  const unmappedPermissions: string[] = []
  for (let i = 0, { length } = permissions; i < length; i += 1) {
    const token = permissions[i]
    if (typeof token !== 'string' || token === '') {
      continue
    }
    const action = resolveOidcPermissionAction(token)
    if (!action) {
      if (!unmappedPermissions.includes(token)) {
        unmappedPermissions.push(token)
      }
      continue
    }
    if (!allowedActions.includes(action)) {
      allowedActions.push(action)
    }
  }
  return { allowedActions, unmappedPermissions }
}

/**
 * The access page's `window.__context__` payload carries the configured
 * trusted publisher as DATA — `oidcConnections[]` with the repo, workflow,
 * environment, and permission tokens — while the rendered markers this module
 * also reads are a view of it. Reading the data is exact: a page whose markers
 * are absent (a React shell, a restyled summary) still reports its real
 * configuration, where marker-scraping alone reported "unconfigured" and a
 * caller then planned a create over an existing row.
 *
 * Returns undefined when no connection is present, which is a genuinely
 * unconfigured package. Pure — exported for tests.
 */
export function parseOidcConnection(
  body: string,
): TrustedPublisherCurrent | undefined {
  const marker = body.indexOf('"oidcConnections"')
  if (marker === -1) {
    return undefined
  }
  const open = body.indexOf('[', marker)
  if (open === -1) {
    return undefined
  }
  const end = oidcConnectionsArrayEnd(body, open)
  if (end === -1) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(open, end + 1))
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) {
    return undefined
  }
  const connections = parsed.filter((c): c is OidcConnection =>
    Value.Check(OidcConnectionSchema, c),
  )
  const live = connections.find(c => !c.deleted)
  if (!live) {
    return undefined
  }
  const { config } = live
  const unmappedClaims = Object.keys(config).filter(
    key =>
      ![
        'durable_ids',
        'environment_name',
        'repository_name',
        'repository_owner',
        'workflow',
      ].includes(key),
  )
  if (connections.filter(connection => !connection.deleted).length !== 1) {
    unmappedClaims.push('multiple-connections')
  }
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined
  const { allowedActions, unmappedPermissions } = splitOidcPermissionTokens(
    live.permissions ?? [],
  )
  return {
    allowedActions,
    ...(unmappedClaims.length ? { unmappedClaims } : {}),
    environmentName: str(config.environment_name),
    repositoryName: str(config.repository_name),
    repositoryOwner: str(config.repository_owner),
    unmappedPermissions,
    workflowFilename: str(config.workflow),
  }
}

/**
 * Split the `github-repoInfo` marker's `owner/name` text. A marker carrying no
 * slash is an owner with no repository name; an empty half reads as undefined
 * rather than an empty string a caller would diff against.
 */
function splitRepositoryInfo(repoInfo: string): {
  repositoryName: string | undefined
  repositoryOwner: string | undefined
} {
  const slashIdx = repoInfo.indexOf('/')
  if (slashIdx === -1) {
    return {
      repositoryName: undefined,
      repositoryOwner: repoInfo || undefined,
    }
  }
  return {
    repositoryName: repoInfo.slice(slashIdx + 1) || undefined,
    repositoryOwner: repoInfo.slice(0, slashIdx) || undefined,
  }
}

/**
 * The configured environment name: the marker span, else the React
 * initial-data JSON key — whose quotes may be escaped (\") when the JSON sits
 * inside another string. An absent or empty value reads as undefined.
 */
function readEnvironmentNameMarker(html: string): string | undefined {
  const env =
    html.match(/id="github-environmentName"[^>]*>([^<]+)</) ??
    html.match(/\\?"githubEnvironmentName\\?"\s*:\s*\\?"([^"\\]+)\\?"/)
  const envName = (env?.[1] ?? '').trim()
  return envName === '' ? undefined : envName
}

/**
 * Parse the configured trusted-publisher summary out of the access page:
 * repo (the `github-repoInfo` marker, `owner/name`), workflow filename,
 * environment name (marker or JSON fallback; absent/empty reads as
 * undefined), and the allowed-action permission strings. Returns undefined
 * when not even the repo marker is present — callers classify first, so
 * that means an unconfigured page. Pure — exported for tests.
 */
export function parseTrustedPublisherForm(
  html: string,
): TrustedPublisherCurrent | undefined {
  // Data before markup: the payload is the page's own state, and it survives a
  // restyle that would break every marker below. Anchored on the
  // `oidcConnections` key, never on markup, chunk names, or integrity hashes —
  // those carry content digests that rotate on every deploy.
  const fromData = parseOidcConnection(html)
  if (fromData) {
    return fromData
  }
  const repo = html.match(/id="github-repoInfo"[^>]*>([^<]+)</)
  const wf = html.match(/id="github-workflowName"[^>]*>([^<]+)</)
  if (!repo && !wf) {
    return undefined
  }
  const { repositoryName, repositoryOwner } = splitRepositoryInfo(
    (repo?.[1] ?? '').trim(),
  )
  return {
    allowedActions: extractAllowedActions(html),
    environmentName: readEnvironmentNameMarker(html),
    repositoryName,
    repositoryOwner,
    // The rendered chips carry no grant tokens — only the two action strings
    // the extractor already recognizes — so this path has nothing to report.
    unmappedPermissions: [],
    workflowFilename: (wf?.[1] ?? '').trim() || undefined,
  }
}

/**
 * The allowed-action permission strings on the page, normalized to lowercase
 * single-spaced (`npm publish`, `npm stage publish`). Two page shapes count:
 * the configured summary's `Permissions:` block (spans/codes inside that
 * block ONLY — a page-wide scan would catch unrelated code tags), and the
 * edit form's `oidc-allow-publish` checkbox. npm stage publish is implicit on
 * that form. Pure — exported for tests.
 */
export function extractAllowedActions(html: string): string[] {
  const actions = new Set<string>()
  // The block between the literal `Permissions:` label's closing span and the
  // next closing div — the region the permission chips render inside.
  const permsBlock = html.match(/Permissions:\s*<\/span>([\s\S]*?)<\/div>/)
  if (permsBlock) {
    const region = permsBlock[1] ?? ''
    // One rendered permission chip: an opening <code …> or <span …> tag, its
    // trimmed text content (captured), then the matching close tag.
    const parts = [
      ...region.matchAll(
        /<(?:code|span)[^>]*>\s*([^<]+?)\s*<\/(?:code|span)>/g,
      ),
    ]
    for (let i = 0, { length } = parts; i < length; i += 1) {
      const t = (parts[i]![1] ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
      if (/^npm (?:stage )?publish$/.test(t)) {
        actions.add(t)
      }
    }
  }
  const directPublish = /<input[^>]*\bid="oidc-allow-publish"[^>]*>/i.exec(html)
  if (directPublish) {
    actions.add('npm stage publish')
    if (/\bchecked\b/i.test(directPublish[0])) {
      actions.add('npm publish')
    }
  }
  return [...actions]
}

export function allowsAction(
  actions: readonly string[],
  action: 'publish' | 'stage-publish',
): boolean {
  for (let i = 0, { length } = actions; i < length; i += 1) {
    const a = actions[i]!.toLowerCase()
    const isStage = /\bnpm\s+stage\s+publish\b/.test(a)
    if (action === 'stage-publish' && isStage) {
      return true
    }
    if (action === 'publish' && !isStage && /\bnpm\s+publish\b/.test(a)) {
      return true
    }
    // npm's raw grant token for the plain-publish action: `createPackage`.
    // Without this mapping the grant reads as unknown and a row that must
    // LOSE plain publish looks clean.
    if (action === 'publish' && /\bcreatepackage\b/.test(a)) {
      return true
    }
  }
  return false
}
