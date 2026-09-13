import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { SOCKET_GITHUB_ORGS } from '../fleet/constants/socket-scopes.mts'

import { isPathWithinRoot } from '@socketsecurity/lib-stable/paths/predicates'

export interface ConsumerSourceEvidence {
  readonly schemaVersion: 1
  readonly repo: string
  readonly slug: string
  readonly revision: string
  readonly complete: true
  readonly files: ReadonlyArray<{
    readonly path: string
    readonly text: string
  }>
}

export function consumerEvidencePath(repoRoot: string, repo: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(repo)) {
    throw new Error(
      'Consumer identity is invalid. Where: consumer evidence. Saw an invalid repository name; wanted one repository name. Fix: use the fleet roster identity.',
    )
  }
  return path.join(repoRoot, '.cache', 'consumer-evidence', `${repo}.json`)
}

export function readConsumerEvidence(
  repoRoot: string,
  repo: string,
): ConsumerSourceEvidence {
  const file = consumerEvidencePath(repoRoot, repo)
  if (
    !existsSync(file) ||
    !isPathWithinRoot(realpathSync(file), realpathSync(repoRoot))
  ) {
    throw new Error(
      `Consumer evidence is unavailable. Where: ${file}. Saw missing or external evidence; wanted a complete contained snapshot. Fix: run pnpm run audit:consumer-source in ${repo}; import through Wheelhouse pnpm run cascade:consumer-evidence --target <consumer> --consumer-evidence-to <socket-lib>.`,
    )
  }
  const roster = readConsumerRoster(repoRoot)
  const member = roster.repos.find(entry => entry.name === repo)
  if (!member) {
    throw new Error(
      `Consumer ${repo} is absent from the canonical fleet roster.`,
    )
  }
  const expectedSlug = `${member.owner ?? SOCKET_GITHUB_ORGS[0]}/${member.name}`
  const value = JSON.parse(readFileSync(file, 'utf8')) as ConsumerSourceEvidence
  if (
    value?.schemaVersion !== 1 ||
    value.repo !== repo ||
    value.slug?.toLowerCase() !== expectedSlug.toLowerCase() ||
    !/^[a-f0-9]{40}$/i.test(value.revision) ||
    value.complete !== true ||
    !Array.isArray(value.files)
  ) {
    throw new Error(
      `Consumer evidence is invalid. Where: ${file}. Saw incomplete provenance; wanted schemaVersion 1, matching repo, commit SHA and complete files. Fix: regenerate the evidence.`,
    )
  }
  validateConsumerSourceFiles(value.files, file)
  return value
}

function validateConsumerSourceFiles(
  files: ConsumerSourceEvidence['files'],
  file: string,
): void {
  const paths = new Set<string>()
  for (const entry of files) {
    if (
      typeof entry?.path !== 'string' ||
      typeof entry.text !== 'string' ||
      path.isAbsolute(entry.path) ||
      entry.path.split(/[\\/]/).some(part => part === '' || part === '..') ||
      paths.has(entry.path)
    ) {
      throw new Error(
        `Consumer source evidence is invalid. Where: ${file}. Saw invalid or repeated source paths; wanted unique repository-relative files. Fix: regenerate the evidence.`,
      )
    }
    paths.add(entry.path)
  }
}

export function readConsumerRoster(repoRoot: string): {
  repos: Array<{ name: string; owner?: string | undefined }>
} {
  const rosterPath = path.join(
    repoRoot,
    '.claude',
    'skills',
    'fleet',
    'cascading-commits',
    'lib',
    'fleet-repos.json',
  )
  if (!isPathWithinRoot(realpathSync(rosterPath), realpathSync(repoRoot))) {
    throw new Error(
      'Consumer roster escapes the repository. Fix: restore the installed fleet roster.',
    )
  }
  const roster = JSON.parse(readFileSync(rosterPath, 'utf8')) as {
    repos: Array<{ name: string; owner?: string | undefined }>
  }
  return roster
}

export function missingConsumerEvidence(
  repoRoot: string,
  repos: readonly string[],
): string[] {
  return repos.filter(repo => !existsSync(consumerEvidencePath(repoRoot, repo)))
}
