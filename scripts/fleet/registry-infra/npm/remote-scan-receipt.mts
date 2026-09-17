import crypto from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

import { extractZipArchive } from '../../artifact/zip.mts'
import {
  downloadGithubDispatchApi,
  requestGithubDispatchApi,
} from '../github-dispatch.mts'
import { rootPath, runCapture } from '../shared.mts'
import {
  NPM_SCAN_RECEIPT_FILE,
  npmScanReceiptArtifactName,
  parseNpmRemoteScanReceipt,
} from '../../npm/scan-receipt.mts'

import type { StageListEntry } from './shared.mts'
import type { NpmRemoteScanReceipt } from '../../npm/scan-receipt.mts'
const MAX_ARCHIVE_BYTES = 1_048_576
const SHA_RE = /^[a-f0-9]{40}$/u

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function receiptError(saw: string): never {
  throw new Error(
    `Remote npm scan receipt is invalid. Where: ${NPM_SCAN_RECEIPT_FILE}. Saw ${saw}; wanted one successful trusted publish-npm scan bound to the current staged bytes. Fix: dispatch the scan workflow again and pass its run ID to npm:approve.`,
  )
}

export function verifyNpmRemoteScanBinding(
  receipt: NpmRemoteScanReceipt,
  expected: {
    repository: string
    runId: number
    runAttempt: number
    selected: readonly string[]
    entries: readonly StageListEntry[]
  },
): string[] {
  const selectedEntries = expected.selected.map(stageId =>
    expected.entries.find(entry => entry.stageId === stageId),
  )
  const entry = selectedEntries.length === 1 ? selectedEntries[0] : undefined
  if (
    receipt.repository.toLowerCase() !== expected.repository.toLowerCase() ||
    receipt.runId !== expected.runId ||
    receipt.runAttempt !== expected.runAttempt ||
    !entry ||
    entry.stageId !== receipt.stageId ||
    entry.name !== receipt.packageName ||
    entry.version !== receipt.packageVersion ||
    entry.shasum !== receipt.stageSha1
  ) {
    receiptError('a receipt that does not match the selected live stage')
  }
  return [receipt.stageId]
}

async function githubJson(endpoint: string): Promise<unknown> {
  return JSON.parse(
    (await requestGithubDispatchApi(endpoint)).toString('utf8'),
  ) as unknown
}

async function currentRepository(): Promise<string> {
  const remote = (
    await runCapture('git', ['remote', 'get-url', 'origin'], rootPath)
  ).stdout.trim()
  const match =
    /github\.com[/:](?<repo>[^\s/]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(remote)
  const repository = match?.groups?.['repo']
  if (!repository) {
    receiptError('an unrecognized checkout origin')
  }
  return repository
}

function validateTrustedWorkflowRun(
  value: unknown,
  expected: {
    defaultBranch: string
    repository: string
    runId: number
  },
): Record<string, unknown> {
  const run = recordOf(value)
  const runPath =
    typeof run['path'] === 'string' ? run['path'].split('@', 1)[0] : undefined
  if (
    run['id'] !== expected.runId ||
    run['event'] !== 'workflow_dispatch' ||
    run['status'] !== 'completed' ||
    run['conclusion'] !== 'success' ||
    runPath !== '.github/workflows/publish-npm.yml' ||
    run['head_branch'] !== expected.defaultBranch ||
    typeof run['head_sha'] !== 'string' ||
    !SHA_RE.test(run['head_sha']) ||
    recordOf(run['repository'])['full_name'] !== expected.repository ||
    recordOf(run['head_repository'])['full_name'] !== expected.repository
  ) {
    receiptError(`untrusted workflow run ${expected.runId}`)
  }
  return run
}

export function verifyNpmScanSourceBinding(
  sourceCommitValue: unknown,
  publishRunValue: unknown,
  sourceSha: string,
): void {
  const sourceCommit = recordOf(sourceCommitValue)
  const publishRun = recordOf(publishRunValue)
  const parents = sourceCommit['parents']
  if (
    sourceCommit['sha'] !== sourceSha ||
    recordOf(recordOf(sourceCommit['commit'])['verification'])['verified'] !==
      true ||
    !Array.isArray(parents) ||
    parents.length !== 1 ||
    recordOf(parents[0])['sha'] !== publishRun['head_sha']
  ) {
    receiptError('an unsigned source or source not produced by the publish run')
  }
}

async function verifyReceiptProducerRuns(config: {
  repository: string
  receipt: NpmRemoteScanReceipt
  rawScanRun: Record<string, unknown>
}): Promise<void> {
  const repositoryMetadata = recordOf(
    await githubJson(`repos/${config.repository}`),
  )
  const defaultBranch = repositoryMetadata['default_branch']
  if (typeof defaultBranch !== 'string' || defaultBranch === '') {
    receiptError('repository metadata without a default branch')
  }
  validateTrustedWorkflowRun(config.rawScanRun, {
    defaultBranch,
    repository: config.repository,
    runId: config.receipt.runId,
  })
  const jobs = recordOf(
    await githubJson(
      `repos/${config.repository}/actions/runs/${config.receipt.runId}/attempts/${config.receipt.runAttempt}/jobs?per_page=100`,
    ),
  )['jobs']
  const scanJobs = Array.isArray(jobs)
    ? jobs.filter(job => recordOf(job)['name'] === 'Scan staged npm package')
    : []
  if (
    scanJobs.length !== 1 ||
    recordOf(scanJobs[0])['conclusion'] !== 'success'
  ) {
    receiptError('a missing or unsuccessful scan job')
  }
  const publishRun = validateTrustedWorkflowRun(
    await githubJson(
      `repos/${config.repository}/actions/runs/${config.receipt.publishRunId}`,
    ),
    {
      defaultBranch,
      repository: config.repository,
      runId: config.receipt.publishRunId,
    },
  )
  const sourceCommit = recordOf(
    await githubJson(
      `repos/${config.repository}/commits/${config.receipt.sourceSha}`,
    ),
  )
  verifyNpmScanSourceBinding(sourceCommit, publishRun, config.receipt.sourceSha)
}

export async function verifyNpmRemoteScanRun(
  runId: number,
  selected: readonly string[],
  entries: readonly StageListEntry[],
): Promise<string[] | undefined> {
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    receiptError('an invalid workflow run ID')
  }
  const repository = await currentRepository()
  const rawRun = recordOf(
    await githubJson(`repos/${repository}/actions/runs/${runId}`),
  )
  const runAttempt = validRunAttempt(rawRun, runId)
  const listing = recordOf(
    await githubJson(
      `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    ),
  )
  const artifactName = npmScanReceiptArtifactName(runId, runAttempt)
  const artifact = uniqueArtifactOf(listing['artifacts'], artifactName)
  const artifactId = artifact['id']
  const digest = artifact['digest']
  if (
    typeof artifactId !== 'number' ||
    !Number.isSafeInteger(artifactId) ||
    artifactId <= 0 ||
    artifact['expired'] !== false ||
    recordOf(artifact['workflow_run'])['id'] !== runId ||
    typeof digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(digest)
  ) {
    receiptError('invalid artifact metadata')
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), 'npm-scan-receipt-'))
  const archivePath = path.join(directory, 'artifact.zip')
  try {
    await downloadGithubDispatchApi(
      `repos/${repository}/actions/artifacts/${artifactId}/zip`,
      archivePath,
      MAX_ARCHIVE_BYTES,
    )
    const archive = readFileSync(archivePath)
    const actualDigest = `sha256:${crypto.hash('sha256', archive)}`
    if (digest !== actualDigest) {
      receiptError('artifact bytes that do not match GitHub metadata')
    }
    const files = extractZipArchive(archive, {
      maxArchiveBytes: MAX_ARCHIVE_BYTES,
      maxEntries: 1,
      maxEntryBytes: 262_144,
      maxTotalBytes: 262_144,
    })
    const receiptFile = files.length === 1 ? files[0] : undefined
    if (!receiptFile || receiptFile.name !== NPM_SCAN_RECEIPT_FILE) {
      receiptError('an unexpected artifact file set')
    }
    const receipt = parseNpmRemoteScanReceipt(
      JSON.parse(receiptFile.data.toString('utf8')) as unknown,
    )
    await verifyReceiptProducerRuns({
      rawScanRun: rawRun,
      receipt,
      repository,
    })
    return verifyNpmRemoteScanBinding(receipt, {
      entries,
      repository,
      runAttempt,
      runId,
      selected,
    })
  } finally {
    safeDeleteSync(directory)
  }
}

function validRunAttempt(
  rawRun: Record<string, unknown>,
  runId: number,
): number {
  const runAttempt = rawRun['run_attempt']
  if (
    typeof runAttempt !== 'number' ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0
  ) {
    receiptError(`untrusted workflow run ${runId}`)
  }
  return runAttempt
}

function uniqueArtifactOf(value: unknown, artifactName: string) {
  const matches = Array.isArray(value)
    ? value.filter(entry => recordOf(entry)['name'] === artifactName)
    : []
  if (matches.length !== 1) {
    receiptError(`${matches.length} matching artifacts`)
  }
  return recordOf(matches[0])
}
