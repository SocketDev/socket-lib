/**
 * @file `--approve` mode: list the user's staged packages, run the pre-approve
 *   integrity gate over every eligible entry FIRST (staging is one-shot per
 *   version, so verification must complete successfully before the human
 *   approve step is even offered), then multi-select over the verified entries,
 *   then batch-approve through pnpm's browser 2FA. `--yes` replaces the
 *   interactive selection for agent/scripted runs. The registry challenge
 *   opens npmjs.com in the existing browser session for attended approval.
 */

import process from 'node:process'

import { checkbox } from '@socketsecurity/lib-stable/stdio/prompts'

import { logger, rootPath } from '../shared.mts'
import type { runInheritTty } from '../shared.mts'
import { isAlreadyPublished } from './registry.mts'
import type { StageListEntry } from './shared.mts'
import {
  fetchPriorProvenanceMap,
  formatPriorProvenance,
  listStagedPackages,
  readPackageJson,
} from './shared.mts'
import { ensureNpmIdentity } from './auth-identity.mts'
import { runNativeNpmOperation } from './settings/trust.mts'
import { preflightSocketScanAuth, scanStagedEntry } from './scan.mts'
import { verifyNpmRemoteScanRun } from './remote-scan-receipt.mts'
import {
  browserStagedRequested,
  openStagedBrowserSession,
} from './staged-browser-read.mts'
import { threatScanRequested } from './threat-scan.mts'
import type { StagedBrowserSession } from './staged-browser-read.mts'
import {
  composeTarballProviders,
  defaultDownloadStagedTarball,
  verifyStagedEntry,
} from './staged.mts'
import type { TarballProvider } from './staged.mts'
import { verifyStagedPlatformEntry } from './staged-workspace.mts'
import { hasMachineBuiltPayload } from './workspace-plan.mts'
import {
  findWorkspacePackageByName,
  resolveNpmWorkspaceLayout,
} from './workspace.mts'
import type { NpmWorkspaceLayout } from './workspace.mts'

export interface ApproveChoice {
  checked: boolean
  name: string
  value: string
}

/**
 * Build the checkbox choices for the approve multi-select: one row per eligible
 * staged entry, labelled `name@version` with the prior-provenance annotation,
 * valued by its stageId, pre-checked so the default is "approve all". Pure over
 * the eligible list + the prior-provenance map.
 */
export function buildApproveChoices(
  eligible: readonly StageListEntry[],
  priorProvenance: ReadonlyMap<string, boolean>,
): ApproveChoice[] {
  return eligible.map(e => ({
    __proto__: null,
    checked: true,
    name: `${e.name}@${e.version}${formatPriorProvenance(priorProvenance.get(e.name!))}`,
    value: e.stageId!,
  }))
}

/**
 * `--approve` mode: list the user's staged packages, multi-select, batch
 * approve through attended browser 2FA. Staged entries already public are
 * filtered out; an empty selection is a no-op.
 */
export interface ApproveConfig {
  dryRun: boolean
  scanRunId?: number | undefined
  yes: boolean
  // ── Injected collaborators, dependency injection. Every field
  // defaults to the real import below, so omitting them leaves prod behavior
  // unchanged; tests pass fakes to drive each decision path without spawning
  // npm/pnpm/git/gh, prompting a TTY, or touching the registry. Typed as
  // `typeof <realFn>` so a signature drift on the collaborator is a compile
  // error here. ──
  browserRequested?: typeof browserStagedRequested | undefined
  checkbox?: typeof checkbox | undefined
  ensureIdentity?: typeof ensureNpmIdentity | undefined
  fetchPriorProvenance?: typeof fetchPriorProvenanceMap | undefined
  isPublished?: typeof isAlreadyPublished | undefined
  listStaged?: typeof listStagedPackages | undefined
  openStagedSession?: typeof openStagedBrowserSession | undefined
  readPkg?: typeof readPackageJson | undefined
  resolveLayout?: typeof resolveNpmWorkspaceLayout | undefined
  runInheritTty?: typeof runInheritTty | undefined
  scanAuth?: typeof preflightSocketScanAuth | undefined
  scanEntry?: typeof scanStagedEntry | undefined
  verifyRemoteScan?: typeof verifyNpmRemoteScanRun | undefined
  threatRequested?: typeof threatScanRequested | undefined
  verifyEntry?: typeof verifyStagedEntry | undefined
}

/**
 * The read/select half of the injected collaborators, every field resolved to
 * its real implementation. Held apart from the gate half so each resolver stays
 * a flat list of defaults rather than one wall of fallbacks.
 */
interface ApproveStageCollaborators {
  ensureIdentity: typeof ensureNpmIdentity
  fetchPriorProvenance: typeof fetchPriorProvenanceMap
  isPublished: typeof isAlreadyPublished
  listStaged: typeof listStagedPackages
  promptCheckbox: typeof checkbox
  readPkg: typeof readPackageJson
  resolveLayout: typeof resolveNpmWorkspaceLayout
  verifyEntry: typeof verifyStagedEntry
}

/**
 * The gate/write half of the injected collaborators: the scan gate, the browser
 * passback, the approve spawn.
 */
interface ApproveGateCollaborators {
  browserRequested: typeof browserStagedRequested
  openStagedSession: typeof openStagedBrowserSession
  runTty: typeof runInheritTty
  scanAuth: typeof preflightSocketScanAuth
  scanEntry: typeof scanStagedEntry
  verifyRemoteScan: typeof verifyNpmRemoteScanRun
  threatRequested: typeof threatScanRequested
}

async function runNativeStageApproval(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<number> {
  return (await runNativeNpmOperation(command, args, cwd)).code
}

function resolveApproveStageCollaborators(
  config: ApproveConfig,
): ApproveStageCollaborators {
  return {
    ensureIdentity: config.ensureIdentity ?? ensureNpmIdentity,
    fetchPriorProvenance:
      config.fetchPriorProvenance ?? fetchPriorProvenanceMap,
    isPublished: config.isPublished ?? isAlreadyPublished,
    listStaged: config.listStaged ?? listStagedPackages,
    promptCheckbox: config.checkbox ?? checkbox,
    readPkg: config.readPkg ?? readPackageJson,
    resolveLayout: config.resolveLayout ?? resolveNpmWorkspaceLayout,
    verifyEntry: config.verifyEntry ?? verifyStagedEntry,
  }
}

function resolveApproveGateCollaborators(
  config: ApproveConfig,
): ApproveGateCollaborators {
  return {
    browserRequested: config.browserRequested ?? browserStagedRequested,
    openStagedSession: config.openStagedSession ?? openStagedBrowserSession,
    runTty: config.runInheritTty ?? runNativeStageApproval,
    scanAuth: config.scanAuth ?? preflightSocketScanAuth,
    scanEntry: config.scanEntry ?? scanStagedEntry,
    verifyRemoteScan: config.verifyRemoteScan ?? verifyNpmRemoteScanRun,
    threatRequested: config.threatRequested ?? threatScanRequested,
  }
}

/**
 * Split the account-scoped stage list into THIS repo's entries and the rest.
 * The stage list is account-scoped, so entries this account staged from other
 * repos show up here; each one is reported and dropped, because the verify gate
 * can only ever pack this checkout's packages.
 */
function selectRepoStagedEntries(
  staged: readonly StageListEntry[],
  config: {
    layout: NpmWorkspaceLayout
    readPkg: typeof readPackageJson
  },
): { localLabel: string; ours: StageListEntry[] } {
  const { layout, readPkg } = config
  const localNames =
    layout.kind === 'multi'
      ? new Set(layout.packages.map(pkg => pkg.name))
      : new Set([readPkg().name])
  const localLabel = [...localNames].toSorted().join(', ')
  const ours: StageListEntry[] = []
  for (let i = 0, { length } = staged; i < length; i += 1) {
    const entry = staged[i]!
    if (entry.name && localNames.has(entry.name)) {
      ours.push(entry)
    } else {
      logger.log(
        `Skipping ${entry.name}@${entry.version} — staged by this account but ` +
          `not this repo's package (${localLabel}). Run --approve from its own repo.`,
      )
    }
  }
  return { localLabel, ours }
}

/**
 * Drop staged entries whose version is already public. A stage upload approved
 * earlier can linger in the stage list, and re-offering it would read as work
 * left to do.
 */
async function selectUnpublishedStagedEntries(
  entries: readonly StageListEntry[],
  isPublished: typeof isAlreadyPublished,
): Promise<StageListEntry[]> {
  const eligible: StageListEntry[] = []
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    // eslint-disable-next-line no-await-in-loop
    if (
      entry.name &&
      entry.version &&
      !(await isPublished(entry.name, entry.version))
    ) {
      eligible.push(entry)
    }
  }
  return eligible
}

/**
 * Run the pre-approve integrity gate over every eligible entry and keep the
 * ones that passed. Generated PLATFORM packages verify structurally on the
 * staged bytes (their CI-built payload has no local twin to byte-compare);
 * everything else keeps the local-pack byte-compare gate.
 */
async function verifyStagedEntriesForApprove(
  eligible: readonly StageListEntry[],
  config: {
    layout: NpmWorkspaceLayout
    verifyEntry: typeof verifyStagedEntry
  },
): Promise<StageListEntry[]> {
  const { layout, verifyEntry } = config
  const verifiedEntries: StageListEntry[] = []
  for (let i = 0, { length } = eligible; i < length; i += 1) {
    const entry = eligible[i]!
    const member = entry.name
      ? findWorkspacePackageByName(layout, entry.name)
      : undefined
    // eslint-disable-next-line no-await-in-loop
    const verified =
      member && (member.platform || hasMachineBuiltPayload(member.manifest))
        ? await verifyStagedPlatformEntry(entry, member, {
            downloadStagedTarball: defaultDownloadStagedTarball,
          })
        : await verifyEntry(entry)
    if (verified) {
      verifiedEntries.push(entry)
    }
  }
  return verifiedEntries
}

/**
 * Everything between "what is staged" and "what may be offered": this repo's
 * entries, minus the already-public ones, minus whatever failed the pre-approve
 * verify. Returns undefined when the run has nothing to offer — the reason is
 * already logged and `process.exitCode` already set where the outcome is a
 * failure rather than a no-op.
 *
 * Staging is one-shot per version (a staged-then-published version can never
 * re-stage), so verification completes BEFORE the approve step is offered: a
 * divergent or unverifiable artifact never reaches the multi-select, the 2FA
 * prompt, or `pnpm stage approve`.
 */
async function collectVerifiedApproveEntries(config: {
  scanRunId?: number | undefined
  layout: NpmWorkspaceLayout
  stage: ApproveStageCollaborators
  verifyRemoteScan: typeof verifyNpmRemoteScanRun
}): Promise<
  | {
      entries: StageListEntry[]
      remoteScanned: string[] | undefined
    }
  | undefined
> {
  const { layout, stage } = config
  const staged = await stage.listStaged()
  if (staged.length === 0) {
    logger.log('No packages currently staged.')
    return undefined
  }
  const { localLabel, ours } = selectRepoStagedEntries(staged, {
    layout,
    readPkg: stage.readPkg,
  })
  if (ours.length === 0) {
    logger.log(`No staged entries for ${localLabel}; nothing to approve here.`)
    return undefined
  }
  const eligible = await selectUnpublishedStagedEntries(ours, stage.isPublished)
  if (eligible.length === 0) {
    logger.log('All staged entries are already published; nothing to approve.')
    return undefined
  }
  if (config.scanRunId !== undefined) {
    const stageIds = eligible.flatMap(entry =>
      entry.stageId ? [entry.stageId] : [],
    )
    try {
      const remoteScanned = await config.verifyRemoteScan(
        config.scanRunId,
        stageIds,
        eligible,
      )
      if (
        stageIds.length !== eligible.length ||
        !remoteScanned ||
        remoteScanned.length !== stageIds.length ||
        stageIds.some(stageId => !remoteScanned.includes(stageId))
      ) {
        throw new Error('Remote npm scan receipt did not verify every stage.')
      }
      return { entries: eligible, remoteScanned }
    } catch (error) {
      logger.fail(String(error))
      process.exitCode = 1
      return undefined
    }
  }
  const verifiedEntries = await verifyStagedEntriesForApprove(eligible, {
    layout,
    verifyEntry: stage.verifyEntry,
  })
  if (verifiedEntries.length === 0) {
    logger.fail(
      'No staged package passed pre-approve verification; nothing offered for approve.',
    )
    process.exitCode = 1
    return undefined
  }
  if (verifiedEntries.length < eligible.length) {
    logger.fail(
      `${eligible.length - verifiedEntries.length}/${eligible.length} failed pre-approve verify; ` +
        `refusing the whole batch. Reject the failed stage (node scripts/fleet/npm-auth.mts stage reject <id>).`,
    )
    process.exitCode = 1
    return undefined
  }
  return { entries: verifiedEntries, remoteScanned: undefined }
}

/**
 * The stage ids to approve: every row under `assume-yes` (agent / scripted
 * runs, no TTY), the operator's checkbox picks otherwise. The rows still print
 * under `assume-yes` so the prior-provenance annotations stay visible.
 */
async function selectApproveTargets(config: {
  choices: readonly ApproveChoice[]
  promptCheckbox: typeof checkbox
  promptMode: 'assume-yes' | 'interactive'
}): Promise<string[]> {
  const { choices, promptCheckbox, promptMode } = config
  if (promptMode === 'interactive') {
    const picked = (await promptCheckbox({
      message: 'Select staged packages to approve:',
      choices: [...choices],
    })) as string[] | undefined
    return picked ?? []
  }
  logger.log('--yes: approving all staged packages:')
  for (let i = 0, { length } = choices; i < length; i += 1) {
    logger.log(`  ${choices[i]!.name}`)
  }
  return choices.map(choice => choice.value)
}

/**
 * Print what a `--dry-run` would have approved, one row per selected stage id.
 */
function logPlannedApprovals(
  selected: readonly string[],
  verifiedEntries: readonly StageListEntry[],
): void {
  logger.log('[dry-run] would approve:')
  for (let i = 0, { length } = selected; i < length; i += 1) {
    const stageId = selected[i]!
    const entry = verifiedEntries.find(e => e.stageId === stageId)
    logger.log(`  ${entry?.name}@${entry?.version} (id: ${stageId})`)
  }
  logger.success(
    'Dry-run complete. Re-run without --dry-run for browser approval and promotion.',
  )
}

/**
 * The artifact-source FALLBACK CHAIN for one staged entry, in precedence order
 * rather than a single pick: a browser-read session (its bytes are npm's actual
 * staged upload) → the registry-API staged download. A source that yields no
 * bytes falls through to the next. A local re-pack is not eligible because it
 * can change after verification and is not the artifact npm will promote.
 */
function resolveStagedTarballSources(config: {
  browserSession: StagedBrowserSession | undefined
  entry: StageListEntry
  stageId: string
}): TarballProvider[] {
  const { browserSession, entry, stageId } = config
  const sources: TarballProvider[] = []
  if (browserSession) {
    const stagedTar = browserSession.tarballs.find(
      t => t.packageName === entry.name && t.version === entry.version,
    )
    if (stagedTar) {
      sources.push(() => browserSession.download(stagedTar))
    }
  }
  sources.push(() => defaultDownloadStagedTarball(stageId))
  return sources
}

/**
 * Scan every selected entry and return the stage ids that came back clean.
 */
async function scanSelectedStagedEntries(
  selected: readonly string[],
  config: {
    browserSession: StagedBrowserSession | undefined
    scanContext: Awaited<ReturnType<typeof preflightSocketScanAuth>>
    scanEntry: typeof scanStagedEntry
    threatScan: boolean
    verifiedEntries: readonly StageListEntry[]
  },
): Promise<string[]> {
  const {
    browserSession,
    scanContext,
    scanEntry,
    threatScan,
    verifiedEntries,
  } = config
  const scanned: string[] = []
  for (let i = 0, { length } = selected; i < length; i += 1) {
    const stageId = selected[i]!
    const entry = verifiedEntries.find(e => e.stageId === stageId)
    if (!entry?.name || !entry.version || !entry.shasum) {
      continue
    }
    const packTarball = composeTarballProviders(
      resolveStagedTarballSources({
        browserSession,
        entry,
        stageId,
      }),
    )
    // eslint-disable-next-line no-await-in-loop
    const scanOk = await scanEntry(
      { name: entry.name, version: entry.version },
      {
        context: scanContext,
        expectedShasum: entry.shasum,
        packTarball,
        threatScan,
      },
    )
    if (scanOk) {
      scanned.push(stageId)
    }
  }
  return scanned
}

/**
 * The Socket full-scan gate over the selection. It downloads each staged
 * artifact, checks its registry-recorded shasum, and sends those exact bytes to
 * Socket. Returns the stage ids that scanned clean, or
 * undefined when the whole batch is refused (`process.exitCode` already set).
 *
 * Runs before browser approval so every slow gate finishes before the human
 * authorizes the registry write.
 */
async function runApproveScanGate(
  selected: readonly string[],
  config: {
    gates: ApproveGateCollaborators
    remoteScanned?: readonly string[] | undefined
    verifiedEntries: readonly StageListEntry[]
  },
): Promise<string[] | undefined> {
  const { gates, verifiedEntries } = config
  const { remoteScanned } = config
  if (remoteScanned !== undefined) {
    return selected.every(stageId => remoteScanned.includes(stageId))
      ? [...selected]
      : undefined
  }
  // One auth preflight for the whole batch: token resolution (with the
  // browser-assisted mint on an interactive run), a cheap quota verify, and the
  // org slug — so a missing/expired token surfaces here, not per-entry mid-gate.
  const scanContext = await gates.scanAuth()
  if (!scanContext) {
    logger.fail('Socket scan gate unavailable; nothing approved.')
    process.exitCode = 1
    return undefined
  }
  // Optional browser-read passback: with --staged-browser (or
  // SOCKET_STAGED_BROWSER=1) open one signed-in npm session and pull each
  // staged tarball's bytes THROUGH it — the staged view + tarball are
  // session-only, invisible to the registry API. Opened once for the whole
  // batch; closed in finally. Opt-in local code-threat scan: with
  // --threat-scan (or SOCKET_THREAT_SCAN=1) each entry additionally runs the
  // keyless on-device triage over its extracted source. Resolved once.
  const threatScan = gates.threatRequested()
  let browserSession: StagedBrowserSession | undefined
  if (gates.browserRequested()) {
    try {
      browserSession = await gates.openStagedSession()
    } catch (e) {
      logger.fail(
        `Browser-read staged passback failed to open; nothing approved. ${String(e)}`,
      )
      process.exitCode = 1
      return undefined
    }
  }
  try {
    const scanned = await scanSelectedStagedEntries(selected, {
      browserSession,
      scanContext,
      scanEntry: gates.scanEntry,
      threatScan,
      verifiedEntries,
    })
    if (scanned.length === 0) {
      logger.fail(
        'No selected package passed the Socket scan gate; nothing approved.',
      )
      process.exitCode = 1
      return undefined
    }
    if (scanned.length < selected.length) {
      logger.fail(
        `${selected.length - scanned.length}/${selected.length} failed the scan gate; ` +
          'refusing the whole batch.',
      )
      process.exitCode = 1
      return undefined
    }
    return scanned
  } finally {
    await browserSession?.close()
  }
}

/**
 * Promote each gated stage id through `pnpm stage approve`, TTY-wrapped: the
 * registry's web-OTP challenge refuses non-interactive stdio instead of
 * opening the browser. Reports the approval and failure counts.
 */
async function approveGatedSelection(
  gated: readonly string[],
  config: {
    listStaged: typeof listStagedPackages
    runTty: typeof runInheritTty
  },
): Promise<{
  approved: number
  failed: number
}> {
  const { listStaged, runTty } = config
  let approved = 0
  let failed = 0
  const reportedApproved: string[] = []
  for (let i = 0, { length } = gated; i < length; i += 1) {
    const stageId = gated[i]!
    const args = ['stage', 'approve', stageId]
    // eslint-disable-next-line no-await-in-loop
    const code = await runTty('pnpm', args, rootPath)
    if (code === 0) {
      approved += 1
      reportedApproved.push(stageId)
    } else {
      failed += 1
      logger.fail(`Approve ${stageId} exited ${code}`)
    }
  }
  if (reportedApproved.length) {
    const remaining = new Set(
      (await listStaged()).flatMap(entry =>
        entry.stageId ? [entry.stageId] : [],
      ),
    )
    const unverified = reportedApproved.filter(stageId =>
      remaining.has(stageId),
    )
    if (unverified.length) {
      approved -= unverified.length
      failed += unverified.length
      logger.fail(
        `Approval reported success but ${unverified.length} stage(s) remain pending: ${unverified.join(', ')}`,
      )
    }
  }
  return { approved, failed }
}

export async function runApprove(config: ApproveConfig): Promise<void> {
  const { dryRun, yes } = {
    __proto__: null,
    ...config,
  } as ApproveConfig
  const stage = resolveApproveStageCollaborators(config)
  const gates = resolveApproveGateCollaborators(config)
  const promptMode = yes ? 'assume-yes' : 'interactive'
  // Identity, not just auth: staged entries are maintainer-visible, so a
  // wrong-account login reads an empty stage list and the approve silently
  // no-ops. ensureNpmIdentity covers logged-out (delegates to login.mts) AND
  // wrong-user (TTY: consented logout/login rotation; otherwise fail loud).
  const layout = stage.resolveLayout(rootPath)
  if (!(await stage.ensureIdentity(layout.versionSource.name))) {
    process.exitCode = 1
    return
  }
  const collected = await collectVerifiedApproveEntries({
    layout,
    scanRunId: config.scanRunId,
    stage,
    verifyRemoteScan: gates.verifyRemoteScan,
  })
  if (!collected) {
    return
  }
  const { entries: verifiedEntries, remoteScanned } = collected

  // Fetch prior-version provenance for each unique package name so the
  // approver can spot regressions (last public version had provenance
  // but the staged one's parent name has lost trust metadata between
  // versions — a workflow drift signal). Cheap: one fetch per unique
  // name, abbreviated packument (no _npmUser needed; we only check
  // attestations presence as a proxy for "this name is OIDC-published").
  const priorProvenance = await stage.fetchPriorProvenance(verifiedEntries)

  const selected = await selectApproveTargets({
    choices: buildApproveChoices(verifiedEntries, priorProvenance),
    promptCheckbox: stage.promptCheckbox,
    promptMode,
  })
  if (selected.length === 0) {
    logger.log('Nothing selected; exiting.')
    return
  }

  if (dryRun) {
    logPlannedApprovals(selected, verifiedEntries)
    return
  }

  // Full-scan gate: entries that fail drop out, mirroring the verify gate.
  const gated = await runApproveScanGate(selected, {
    gates,
    remoteScanned,
    verifiedEntries,
  })
  if (!gated) {
    return
  }

  const { approved, failed } = await approveGatedSelection(gated, {
    listStaged: stage.listStaged,
    runTty: gates.runTty,
  })
  if (failed > 0) {
    logger.fail(`${failed}/${gated.length} failed; ${approved} approved`)
    process.exitCode = 1
    return
  }
  logger.success(`Approved ${approved} package${approved === 1 ? '' : 's'}`)
}
