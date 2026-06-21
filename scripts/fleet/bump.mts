/**
 * @file Release-prep step: derive the next version from the Conventional Commits
 *   since the last release tag, generate the CHANGELOG entry from those same
 *   commits, write `package.json` + `CHANGELOG.md`, and commit
 *   `chore: bump version to X.Y.Z`. The CHANGELOG is DERIVED here, never
 *   hand-written, so it can't drift ahead of the tag (the failure mode that
 *   shipped a 6.0.9 entry describing work that landed after the 6.0.9 tag).
 *
 *   The tag + GitHub release are created later, at publish/approve time, by
 *   `publish.mts` (`ensureTagAndRelease`) / the provenance workflow — this step
 *   only prepares the bump commit. Release flow:
 *
 *     node scripts/fleet/bump.mts        # version + CHANGELOG + bump commit
 *     git push                           # land the bump
 *     <trigger publish workflow>         # CI: stage publish (OIDC + provenance)
 *     node scripts/fleet/publish.mts --approve   # local 2FA promote + tag
 *
 *   Usage: node scripts/fleet/bump.mts [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '@socketsecurity/lib-stable/argv/parse'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import {
  COMMIT_LOG_FORMAT,
  bumpLevelFor,
  computeNextVersion,
  generateChangelogSection,
  parseConventionalCommits,
  repoBaseUrl,
} from './lib/changelog.mts'
import { REPO_ROOT } from './paths.mts'
import { runCapture } from './publish-shared.mts'

const logger = getDefaultLogger()
const rootPath = REPO_ROOT

interface PackageJsonShape {
  name?: string | undefined
  repository?: { url?: string | undefined } | string | undefined
  version?: string | undefined
}

/**
 * Resolve the most recent `v<semver>` release tag, or `undefined` for a repo
 * with no release tags yet (first release — all history is the changelog).
 */
export async function lastReleaseTag(): Promise<string | undefined> {
  const r = await runCapture(
    'git',
    ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'],
    rootPath,
  )
  const tag = r.stdout.trim()
  return r.code === 0 && tag ? tag : undefined
}

/**
 * Read the commit stream between `fromTag` (exclusive) and HEAD in the parseable
 * `COMMIT_LOG_FORMAT`. With no prior tag, reads all history.
 */
export async function readCommitStream(
  fromTag: string | undefined,
): Promise<string> {
  const range = fromTag ? `${fromTag}..HEAD` : 'HEAD'
  const r = await runCapture(
    'git',
    ['log', range, `--format=${COMMIT_LOG_FORMAT}`],
    rootPath,
  )
  return r.code === 0 ? r.stdout : ''
}

function readPackageJson(): { raw: string; parsed: PackageJsonShape } {
  const raw = readFileSync(path.join(rootPath, 'package.json'), 'utf8')
  return { parsed: JSON.parse(raw) as PackageJsonShape, raw }
}

/**
 * Replace the root `"version"` field in package.json text, preserving the file's
 * existing formatting (a JSON.parse → stringify round-trip would reorder keys
 * and reflow the file). Matches the first `"version"` — the root field.
 */
export function replaceVersion(raw: string, nextVersion: string): string {
  return raw.replace(
    /("version":\s*")[^"]+(")/,
    (_m, pre: string, post: string) => `${pre}${nextVersion}${post}`,
  )
}

/**
 * Insert a new CHANGELOG section above the first existing `## ` version heading
 * (after the file's intro). When the file has no version sections yet, append
 * after a trailing blank line.
 */
export function insertChangelogSection(
  existing: string,
  section: string,
): string {
  const lines = existing.split('\n')
  const firstHeading = lines.findIndex(l => l.startsWith('## '))
  if (firstHeading === -1) {
    return `${existing.replace(/\s*$/, '')}\n\n${section}\n`
  }
  const before = lines.slice(0, firstHeading).join('\n').replace(/\s*$/, '')
  const after = lines.slice(firstHeading).join('\n')
  return `${before}\n\n${section}\n\n${after}`
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { 'dry-run': { default: false, type: 'boolean' } },
    strict: false,
  })
  const dryRun = !!values['dry-run']

  const { parsed: pkg, raw: pkgRaw } = readPackageJson()
  if (!pkg.version) {
    logger.fail('package.json has no version field.')
    process.exitCode = 1
    return
  }

  const fromTag = await lastReleaseTag()
  const commits = parseConventionalCommits(await readCommitStream(fromTag))
  const level = bumpLevelFor(commits)
  if (!level) {
    logger.fail(
      `No user-visible commits since ${fromTag ?? 'the start of history'} — ` +
        `nothing to release (feat / fix / perf / breaking only). ` +
        `Land a user-visible change first.`,
    )
    process.exitCode = 1
    return
  }

  const nextVersion = computeNextVersion(pkg.version, level)
  const repositoryUrl =
    typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  // ISO date (YYYY-MM-DD). bump.mts is a normal node script (not a workflow
  // sandbox), so `new Date()` is available.
  const date = new Date().toISOString().slice(0, 10)
  const section = generateChangelogSection({
    commits,
    date,
    repoUrl: repoBaseUrl(repositoryUrl),
    version: nextVersion,
  })

  logger.log(
    `${pkg.name ?? 'package'}: ${pkg.version} → ${nextVersion} (${level}, ` +
      `${commits.length} commit(s) since ${fromTag ?? 'start'})`,
  )
  logger.log('')
  logger.log(section)
  logger.log('')

  if (dryRun) {
    logger.success('Dry-run: no files written. Re-run without --dry-run to bump.')
    return
  }

  const changelogPath = path.join(rootPath, 'CHANGELOG.md')
  const existingChangelog = readFileSync(changelogPath, 'utf8')
  writeFileSync(
    path.join(rootPath, 'package.json'),
    replaceVersion(pkgRaw, nextVersion),
  )
  writeFileSync(changelogPath, insertChangelogSection(existingChangelog, section))

  const add = await runCapture(
    'git',
    ['add', 'package.json', 'CHANGELOG.md'],
    rootPath,
  )
  if (add.code !== 0) {
    logger.fail('git add failed.')
    process.exitCode = 1
    return
  }
  const commit = await runCapture(
    'git',
    [
      'commit',
      '-o',
      'package.json',
      'CHANGELOG.md',
      '-m',
      `chore: bump version to ${nextVersion}`,
    ],
    rootPath,
  )
  if (commit.code !== 0) {
    logger.fail(`git commit failed:\n${commit.stdout}`)
    process.exitCode = 1
    return
  }
  logger.success(
    `Bumped to ${nextVersion}. Push, then trigger the publish workflow ` +
      `(stage), then \`node scripts/fleet/publish.mts --approve\` to promote.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    logger.error(e)
    process.exitCode = 1
  })
}
