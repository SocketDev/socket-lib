#!/usr/bin/env node
import {
  getScriptArgs,
  scriptStdio,
  writeScriptStdout,
} from '../../../process/script-output.mts'
/*
 * @file Configure npm Trusted Publishers through `npm trust` — the registry
 *   API, not the website. The web UI sits behind bot management that
 *   challenges an automated session per page (see
 *   docs/fleet/agents.md/npm-anti-bot-rhythm.md); the registry endpoint
 *   `POST /-/package/<pkg>/trust` that `npm trust` drives has no such
 *   challenge, so a whole workspace configures in one pass.
 *   Three details this wrapper exists to own, so no operator hand-runs npm:
 *
 *   1. The npm that runs is the one bundled with the repo's PINNED Node
 *      (pinned-npm.mts), never a stray Homebrew npm — these writes are
 *      2FA-gated and irreversible.
 *   2. Every npm spawn runs from a NEUTRAL cwd. A fleet repo's package.json
 *      declares `devEngines.packageManager: pnpm`, which makes npm refuse to
 *      run at all (EBADDEVENGINES), so the package name travels as an argument
 *      instead of the cwd.
 *   3. The first write prompts for 2FA web-auth, which needs a TTY. The spawn goes
 *      through the fleet PTY helper (shared.mts) so the prompt works from a
 *      non-TTY session. npm then grants a ~5-minute skip-2FA window, so
 *      packages are written SEQUENTIALLY with a short sleep — npm's own
 *      rate-limit guidance. The desired shape per package comes from
 *      trusted-publisher/plan.mts, so the two-workflow rule holds here exactly
 *      as it does in the browser driver: a plain package publishes from
 *      `publish-npm.yml`, a napi `<base>-<platform>` package from
 *      `publish-npm-addons.yml`. Dry-run is the default: it prints the plan and
 *      writes nothing. `--apply` performs the writes, verifies each by
 *      re-reading, and reports a summary. A package whose re-read does not
 *      match never aborts the rest. Usage: node
 *      scripts/fleet/registry-infra/npm/settings/trust.mts [<pkg>…] [--repo <owner/name>]
 *      [--apply]
 */

import { existsSync } from 'node:fs'
import os from 'node:os'
import process from 'node:process'

import { isWin32 } from '@socketsecurity/lib-stable/constants/platform'
import { sleep } from '@socketsecurity/lib-stable/promises/timers'
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { stripAnsi } from '@socketsecurity/lib-stable/term/ansi/strip'
import { getScriptLogger } from '../../../process/script-output.mts'

import { isMainModule } from '../../../process/is-main-module.mts'
import { runMain } from '../../../process/run-main.mts'
import { REPO_ROOT } from '../../../paths.mts'
import {
  buildPtyInvocation,
  NON_INTERACTIVE_RENDER_ENV,
  runCapture,
} from '../../shared.mts'
import {
  openNativeNpmGrantUrl,
  redactNativeNpmGrantOutput,
} from '../native-login.mts'
import { resolvePinnedNpm } from '../pinned-npm.mts'
import {
  parseTrustedPublisherBindings,
  supersededTrustedPublisherBindings,
  trustedPublisherBindingMatches,
} from './trusted-publisher/collection.mts'
import {
  desiredTrustedPublisher,
  LEGACY_WORKFLOW_FILENAMES,
} from './trusted-publisher/plan.mts'
import type { TrustedPublisherDesired } from './trusted-publisher/plan.mts'
import { resolveNpmWorkspaceLayout } from '../workspace.mts'
import {
  currentPublisherRepository,
  readPublisherNapiPlatforms,
} from './publisher-source.mts'

import type { ScriptMeta } from '../../../process/run-main.mts'

const logger = getScriptLogger()

/**
 * `npm trust` landed in npm 11.10.0. An older npm has no subcommand to call,
 * so the run stops with the pinned-Node fix rather than a cryptic usage error.
 */
export const MIN_NPM_VERSION = '11.10.0'

/**
 * Pause between sequential writes. npm's trusted-publishing guidance pairs the
 * skip-2FA window with a short sleep so a batch does not trip rate limiting.
 */
export const WRITE_SPACING_MS = 2000

/**
 * A package's planned configuration, and whether the registry already carries
 * it. `matches` short-circuits the write: this flow is a reconciler, so an
 * already-correct row is a skip, not a rewrite.
 */
export interface TrustPlan {
  readonly canonicalPresent: boolean
  readonly desired: TrustedPublisherDesired
  readonly matches: boolean
  readonly pkg: string
  // Whether the `npm trust list` read ANSWERED. A refused or rate-limited
  // read says nothing about the row, so an unreadable package is neither
  // conforming nor pending. Counting it "to configure" is the 2026-08-06
  // miscount, and writing it blind could target an unknown binding.
  readonly readable: boolean
  readonly staleIds: readonly string[]
}

export interface TrustFlags {
  readonly apply: boolean
  readonly packages: readonly string[]
  readonly repo: string | undefined
}

export function parseTrustArgs(argv: readonly string[]): TrustFlags {
  const packages: string[] = []
  let apply = false
  let repo: string | undefined
  for (let i = 0, { length } = argv; i < length; i += 1) {
    const arg = argv[i]!
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--repo') {
      repo = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--repo=')) {
      repo = arg.slice('--repo='.length)
    } else if (!arg.startsWith('-')) {
      packages.push(arg)
    }
  }
  return { apply, packages, repo }
}

/**
 * Semver-ish "is `version` at least `minimum`" over the numeric prefix of each
 * part, which is all a floor check needs. Pure so the guard is unit-testable.
 */
export function meetsMinimumVersion(version: string, minimum: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map(part => Number.parseInt(part, 10) || 0)
  const have = parse(version)
  const want = parse(minimum)
  for (let i = 0; i < 3; i += 1) {
    const a = have[i] ?? 0
    const b = want[i] ?? 0
    if (a !== b) {
      return a > b
    }
  }
  return true
}

/**
 * The `owner/name` of a GitHub repo named by a package.json `repository`
 * value — the string form, the `github:owner/name` shortcut, or the object
 * form's `url` — or undefined for anything that names no GitHub repo. Pure —
 * exported for tests.
 */
export function repoFromRepositoryValue(value: unknown): string | undefined {
  const url =
    typeof value === 'string'
      ? value
      : value !== null && typeof value === 'object'
        ? (value as { url?: unknown | undefined }).url
        : undefined
  if (typeof url !== 'string' || !url) {
    return undefined
  }
  // npm's `github:owner/repo` shorthand: the literal prefix, the owner up to
  // the slash, the repo lazily so a trailing `#branch` stays out of it, and an
  // optional `#branch` discarded.
  // `github:` shortcut — capture owner, then name up to an optional `#ref`.
  const shortcut = /^github:([^/]+)\/([^/#]+?)(?:#.*)?$/.exec(url)
  if (shortcut) {
    return `${shortcut[1]}/${shortcut[2]}`
  }
  // A full GitHub URL in any of its shapes. `[/:]` covers both https and the
  // scp-style git@ form, the owner runs to the next slash, the repo is lazy so
  // an optional `.git` suffix and any `/`, `#`, or `?` tail drop off rather
  // than landing in the name.
  const hosted =
    /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(url)
  return hosted ? `${hosted[1]}/${hosted[2]}` : undefined
}

/**
 * Derive `owner/name` for `pkg` from the registry packument's `repository`
 * field. A fresh reservation can require an explicit repository argument.
 */
export async function deriveRepoFromRegistry(
  npmPath: string,
  pkg: string,
  neutralCwd: string,
): Promise<string | undefined> {
  const run = await runCapture(
    npmPath,
    ['view', pkg, 'repository', '--json'],
    neutralCwd,
  ).catch(() => undefined)
  const body = run?.stdout.trim()
  if (!body) {
    return undefined
  }
  try {
    return repoFromRepositoryValue(JSON.parse(body))
  } catch {
    return undefined
  }
}

/**
 * Every package name a repo publishes: its workspace packages, including the
 * generated napi platform packages, or the single package a non-workspace repo
 * ships. This is what makes the bare `pnpm run npm:trust --apply` complete — an
 * operator naming nine packages by hand is nine chances to miss one, and a
 * missed platform package fails its publish at release time, not here.
 */
export function enumerateRepoPackages(repoRoot: string): string[] {
  const layout = resolveNpmWorkspaceLayout(repoRoot)
  const names = new Set<string>()
  if (layout.subject?.name) {
    names.add(layout.subject.name)
  }
  const { packages } = layout
  for (let i = 0, { length } = packages; i < length; i += 1) {
    const pkg = packages[i]!
    if (pkg.name) {
      names.add(pkg.name)
    }
  }
  return [...names].toSorted()
}

/**
 * The `npm trust github` argv for one package. The package name is an
 * ARGUMENT, never the cwd, because npm refuses to run inside a repo whose
 * devEngines names pnpm.
 */
/**
 * The only `--id` in `npm trust list` output. Multiple IDs return undefined,
 * because selecting the first binding could revoke an unrelated publisher.
 */
export function trustConnectionId(listOutput: string): string | undefined {
  const ids = [...listOutput.matchAll(/^\s*id:\s*(\S+)\s*$/gm)].map(
    match => match[1]!,
  )
  return ids.length === 1 ? ids[0] : undefined
}

/**
 * The argv that revokes `trustId` from `pkg`. Pure — exported for tests.
 */
export function buildTrustRevokeArgs(pkg: string, trustId: string): string[] {
  return ['trust', 'revoke', pkg, `--id=${trustId}`]
}

export function buildTrustWriteArgs(
  pkg: string,
  desired: TrustedPublisherDesired,
): string[] {
  return [
    'trust',
    'github',
    pkg,
    '--file',
    desired.workflowFilename,
    '--repository',
    `${desired.repositoryOwner}/${desired.repositoryName}`,
    '--environment',
    desired.environmentName,
    '--allow-stage-publish',
    // Direct publishing remains opt-in. npm 12 requires at least one grant
    // flag, so the canonical stage grant is always explicit.
    ...(desired.allowNpmPublish ? ['--allow-publish'] : []),
    '--yes',
  ]
}

/**
 * Whether `listOutput` from `npm trust list <pkg>` already describes
 * `desired`. The output is human-formatted, so this looks for each field's
 * value rather than parsing a shape npm may restyle. The grants must match
 * too: the write is a full upsert where an omitted flag CLEARS a grant, so a
 * row still carrying direct publish is NOT the stage-only row we would write
 * and skipping it would leave the wide grant in place.
 * Exactly one matching binding proves the intended configuration.
 */
export function listOutputMatches(
  listOutput: string,
  desired: TrustedPublisherDesired,
): boolean {
  return (
    parseTrustedPublisherBindings(listOutput).filter(binding =>
      trustedPublisherBindingMatches(binding, desired),
    ).length === 1
  )
}

function trustReadMatches(config: {
  desired: TrustedPublisherDesired
  result: { code: number; output: string }
}): boolean {
  return (
    config.result.code === 0 &&
    listOutputMatches(config.result.output, config.desired)
  )
}

/**
 * The four-ingredient block for a write whose re-read did not come back as
 * planned. Named per field so the operator can finish the row by hand if npm
 * partially accepted it.
 */
export function formatVerifyFailure(
  pkg: string,
  desired: TrustedPublisherDesired,
  listOutput: string,
): string {
  return [
    `the trusted publisher for ${pkg} did not verify after the write.`,
    `  Where: https://www.npmjs.com/package/${pkg}/access`,
    `  Saw:   ${listOutput.trim() || '(no configuration)'}`,
    `  Wanted: repo ${desired.repositoryOwner}/${desired.repositoryName}, ` +
      `workflow ${desired.workflowFilename}, environment ${desired.environmentName}.`,
    `  Fix:   re-run this command for ${pkg} alone; if it fails again, the ` +
      'registry rejected the claim — check the workflow filename exists on the default branch.',
  ].join('\n')
}

/**
 * The report for a package whose verify read was REFUSED rather than answered.
 * `writeExitCode` is the only evidence about the write itself, and it is stated
 * as evidence rather than a verdict: the row may be set, and the next run's
 * read — once a session can read — settles it either way.
 */
export function formatUnverifiable(
  pkg: string,
  desired: TrustedPublisherDesired,
  writeExitCode: number,
): string {
  return [
    `${pkg}: the write ${writeExitCode === 0 ? 'reported success' : `exited ${writeExitCode}`}, ` +
      'but the verify read was refused for a one-time password, so this run ' +
      'cannot say whether the row is set.',
    `  Wanted: repo ${desired.repositoryOwner}/${desired.repositoryName}, ` +
      `workflow ${desired.workflowFilename}, environment ${desired.environmentName}.`,
    `  Check:  https://www.npmjs.com/package/${pkg}/access`,
    '  Next:   re-run once a session can read; an already-correct row reports ' +
      'as conforming and is never rewritten.',
  ].join('\n')
}

/**
 * The human gate for the first write. npm challenges the first
 * account-changing call with 2FA web-auth and then grants a short window, so
 * one approval covers the batch.
 */
export function formatAuthGate(count: number): string {
  return [
    '🖐  HUMAN GATE — npm 2FA for the trusted-publisher batch [1/1]',
    `  Need: npm gates account changes behind 2FA, so the first of ${count} ` +
      'write(s) prompts for browser approval.',
    '  Mind: this is the registry API, not the website — no bot-management ' +
      'challenge; 2FA-bypass tokens are refused here by design.',
    '  You: approve the npmjs.com URL npm prints below in your browser.',
    '  Agent: I drive every write once approval lands — npm grants a ' +
      '~5-minute window, so one approval covers the whole batch. Each ' +
      'package is then written, re-read, and reported in the summary.',
  ].join('\n')
}

/**
 * Whether `output` is npm refusing an account operation for want of a
 * one-time password. Every `npm trust` call — the reads included — is an
 * account operation, so a session that has not authenticated sees this on the
 * FIRST read rather than at the first write.
 */
export function isOtpRequired(output: string): boolean {
  return /\bEOTP\b|requires a one-time password/i.test(output)
}

/**
 * Run npm and collect BOTH streams. npm reports an EOTP refusal — and the
 * approval URLs with it — on stderr, so a stdout-only capture reads as silence
 * and the caller concludes the session is authenticated when it is not.
 */
export async function runCaptureBoth(
  cmd: string,
  args: readonly string[],
  cwd: string,
): Promise<{ code: number; output: string }> {
  const child = spawn(cmd, [...args], {
    cwd,
    shell: isWin32(),
    stdio: scriptStdio(['ignore', 'pipe', 'pipe']),
  })
  let output = ''
  child.process.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  child.process.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  const code = await new Promise<number>(resolve => {
    child.process.on('close', (exitCode: number | null) => {
      resolve(exitCode ?? 1)
    })
  })
  void child.catch(() => undefined)
  return { code, output }
}

/**
 * Run an npm trust command through a PTY and answer its browser prompt.
 *
 * With a TTY npm takes its INTERACTIVE OTP path instead of refusing: it prints
 * an approval URL, waits at `Press ENTER to open in the browser...`, then polls
 * for the approval itself. The fleet's PTY helper inherits stdin, which is
 * empty in a non-interactive session, so that wait never ends. This answers the
 * prompt and opens the URL directly — the difference between a hang and a
 * completed write.
 */
export interface TrustCommandResult {
  readonly code: number
  readonly output: string
}

const TRUST_OUTPUT_LIMIT = 1024 * 1024

export async function runNativeNpmOperation(
  commandPath: string,
  args: readonly string[],
  neutralCwd: string,
): Promise<TrustCommandResult> {
  const runOnce = async (
    command: string,
    commandArgs: string[],
  ): Promise<{ code: number; seen: string }> => {
    const child = spawn(command, commandArgs, {
      cwd: neutralCwd,
      env: {
        ...process.env,
        ...NON_INTERACTIVE_RENDER_ENV,
        npm_config_browser: 'false',
      },
      shell: isWin32(),
      stdio: scriptStdio(['pipe', 'pipe', 'pipe']),
    })
    void child.catch(() => undefined)
    let seen = ''
    let answered = false
    let opened = false
    let approvalFailed = false
    let approvalFailure: unknown
    let approvalStart: Promise<void> | undefined
    let openTimer: ReturnType<typeof setTimeout> | undefined
    let pendingStderr = ''
    let pendingStdout = ''
    const writeSafe = (
      chunk: Buffer,
      destination: 'stderr' | 'stdout',
    ): void => {
      const current = destination === 'stderr' ? pendingStderr : pendingStdout
      const pending = `${current}${chunk.toString('utf8')}`
      const boundary = Math.max(
        pending.lastIndexOf('\n'),
        pending.lastIndexOf('\r'),
      )
      if (boundary === -1) {
        if (destination === 'stderr') {
          pendingStderr = pending
        } else {
          pendingStdout = pending
        }
        return
      }
      writeScriptStdout(
        Buffer.from(redactNativeNpmGrantOutput(pending.slice(0, boundary + 1))),
      )
      if (destination === 'stderr') {
        pendingStderr = pending.slice(boundary + 1)
      } else {
        pendingStdout = pending.slice(boundary + 1)
      }
    }
    const flushSafe = (): void => {
      for (const pending of [pendingStdout, pendingStderr]) {
        if (pending) {
          writeScriptStdout(Buffer.from(redactNativeNpmGrantOutput(pending)))
        }
      }
      pendingStdout = ''
      pendingStderr = ''
    }
    const tryOpen = (output: string): void => {
      if (opened) {
        return
      }
      const url = urlAfterMarker(output, 'auth/cli/')
      if (url) {
        opened = true
        approvalStart = openApprovalUrl(url).catch(error => {
          approvalFailed = true
          approvalFailure = error
          try {
            child.process.kill()
          } catch {}
        })
      }
    }
    const scheduleTrailingOpen = (): void => {
      if (openTimer) {
        clearTimeout(openTimer)
      }
      openTimer = setTimeout(() => {
        openTimer = undefined
        tryOpen(seen)
      }, 250)
    }
    const onChunk = (chunk: Buffer, destination: 'stderr' | 'stdout'): void => {
      seen = `${seen}${chunk.toString('utf8')}`.slice(-TRUST_OUTPUT_LIMIT)
      writeSafe(chunk, destination)
      if (!answered && /press enter/i.test(seen)) {
        answered = true
        child.process.stdin?.write('\n')
      }
      if (!opened) {
        const boundary = Math.max(
          seen.lastIndexOf('\n'),
          seen.lastIndexOf('\r'),
        )
        if (boundary >= 0) {
          tryOpen(seen.slice(0, boundary + 1))
        }
        scheduleTrailingOpen()
      }
    }
    child.process.stdout?.on('data', (chunk: Buffer) =>
      onChunk(chunk, 'stdout'),
    )
    child.process.stderr?.on('data', (chunk: Buffer) =>
      onChunk(chunk, 'stderr'),
    )
    const code = await new Promise<number>(resolve => {
      child.process.on('close', (exitCode: number | null) => {
        if (openTimer) {
          clearTimeout(openTimer)
          openTimer = undefined
        }
        tryOpen(seen)
        flushSafe()
        resolve(exitCode ?? 1)
      })
    })
    await approvalStart
    if (approvalFailed) {
      throw approvalFailure
    }
    return { code, seen }
  }
  const pty = buildPtyInvocation(process.platform, commandPath, [...args])
  const attempt = await runOnce(
    pty?.command ?? commandPath,
    pty ? [...pty.args] : [...args],
  )
  const wrappedBin = commandPath.split(/[\\/]/).at(-1) ?? commandPath
  if (!pty || !isPtyAllocationFailure(attempt.seen, attempt.code, wrappedBin)) {
    return {
      code: attempt.code,
      output: redactNativeNpmGrantOutput(attempt.seen),
    }
  }
  // script(1) refused the pseudo-terminal (socket/pipe stdio — an agent
  // session or a captured run) and npm never executed. expect(1) allocates
  // its own PTY pair without needing a controlling terminal, so npm takes its
  // INTERACTIVE OTP path: it prints a REAL approval URL (the non-interactive
  // EOTP refusal masks them to `***`) and polls for the approval itself. The
  // onChunk handler above opens that URL in the operator's browser.
  if (existsSync(EXPECT_PATH)) {
    logger.info(
      'script(1) refused a PTY here (no TTY); driving the write through ' +
        'expect(1) instead.',
    )
    const viaExpect = await runOnce(EXPECT_PATH, [
      '-c',
      buildExpectPtyScript(commandPath, [...args]),
    ])
    if (!isPtyAllocationFailure(viaExpect.seen, viaExpect.code, wrappedBin)) {
      return {
        code: viaExpect.code,
        output: redactNativeNpmGrantOutput(viaExpect.seen),
      }
    }
  }
  // Last resort: return npm's own refusal from a plain spawn. Only npm may
  // exchange the short-lived browser result for an OTP and retry the request.
  logger.info(
    'PTY allocation failed here (no TTY); retrying the write with a plain spawn.',
  )
  const plain = await runOnce(commandPath, [...args])
  return {
    code: plain.code,
    output: redactNativeNpmGrantOutput(plain.seen),
  }
}

export async function runTrustCommandInteractive(
  npmPath: string,
  args: readonly string[],
  neutralCwd: string,
): Promise<TrustCommandResult> {
  return await runNativeNpmOperation(npmPath, args, neutralCwd)
}

export async function runTrustWriteInteractive(
  npmPath: string,
  args: readonly string[],
  neutralCwd: string,
): Promise<number> {
  return (await runTrustCommandInteractive(npmPath, args, neutralCwd)).code
}

/**
 * Where macOS and most Linuxes keep expect(1). Checked with existsSync rather
 * than PATH lookup so a missing expect falls through to the plain-spawn
 * ladder instead of a spawn ENOENT.
 */
export const EXPECT_PATH = '/usr/bin/expect'

/**
 * How long the expect(1)-driven write may run before expect gives up. Sized
 * for the human step it wraps — npm prints an approval URL and waits for the
 * browser — so this is the operator's OTP budget plus slack, not a network
 * timeout. `timeout -1` would hang the run on a hung npm with only the
 * caller's own patience to end it.
 */
export const EXPECT_TIMEOUT_MS = 6 * 60_000

/**
 * A Tcl word for `value`: bare when it is plain command-argument text,
 * brace-quoted otherwise. Backslashes and braces are escaped so the value
 * survives brace-quoting verbatim. Pure — exported for tests.
 */
export function tclWord(value: string): string {
  if (/^[\w!%+,./:=@^-]+$/.test(value)) {
    return value
  }
  // Escape the three characters Tcl still interprets inside {braces}.
  return `{${value.replace(/[\\{}]/g, '\\$&')}}`
}

/**
 * The expect(1) program that runs `cmd args…` on a fresh PTY, answers npm's
 * `Press ENTER to open in the browser` prompt, and exits with the child's
 * exit code. expect allocates the PTY itself, so this works from a session
 * whose stdio is a socket or pipe — exactly where script(1) refuses. Pure —
 * exported for tests.
 */
export function buildExpectPtyScript(
  cmd: string,
  args: readonly string[],
): string {
  const words = [cmd, ...args].map(tclWord).join(' ')
  return [
    `set timeout ${Math.ceil(EXPECT_TIMEOUT_MS / 1000)}`,
    `spawn -noecho ${words}`,
    'expect {',
    '  -nocase -re {press enter} { send "\\r"; exp_continue }',
    '  eof',
    '}',
    'catch wait result',
    'exit [lindex $result 3]',
  ].join('\n')
}

/**
 * Whether a PTY-wrapped run died in the WRAPPER — the pseudo-terminal was
 * never allocated and the wrapped command never ran. Decided by EVIDENCE, not
 * by matching the wrapper's error wording (BSD and util-linux script(1)
 * phrase their failures differently, and both change): a nonzero exit where
 * nothing in the output came from the wrapped command means the command never
 * spoke, so the failure is the wrapper's. npm always identifies itself in its
 * output (banner, `npm notice`, `npm error`), and script(1) prefixes its own
 * complaints with `script:`, so stripping wrapper-origin lines and looking
 * for the wrapped binary's name is wording-independent. Pure — exported for
 * tests.
 */
export function isPtyAllocationFailure(
  output: string,
  code: number,
  wrappedBin = 'npm',
): boolean {
  if (code === 0) {
    return false
  }
  const trimmed = output.trim()
  if (trimmed === '') {
    // A nonzero exit with NO output at all: the wrapped command never ran —
    // it always says something, even failing.
    return true
  }
  // Drop the wrapper's own lines, then look for any evidence of the wrapped
  // command. An EOTP refusal or a usage error means it DID run and the
  // failure is its to report, not the wrapper's.
  const withoutWrapperLines = trimmed.replace(/^script:.*$/gm, '')
  return !new RegExp(`\\b${wrappedBin}\\b`, 'i').test(withoutWrapperLines)
}

/**
 * The last whitespace-delimited token on the first line containing `marker`.
 * npm prints each URL alone at the end of its line, so the token IS the URL.
 *
 * Token scanning rather than a URL regex on purpose: these are URLs, not
 * filesystem paths, and normalizing them for a separator-regex match collapses
 * `https://` to `https:/` — which silently defeated the parse.
 */
export function urlAfterMarker(
  output: string,
  marker: string,
): string | undefined {
  const lines = output.split(/\r?\n/)
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    if (!line.includes(marker)) {
      continue
    }
    const token = line.trim().split(/\s+/).pop()
    if (token?.startsWith('https:')) {
      return token
    }
  }
  return undefined
}

interface NativeApprovalTask {
  cleanup: () => Promise<void>
}

let approvalSession: NativeApprovalTask | undefined

/**
 * The injectable dependency for the attended browser task. A unit test swaps
 * the property for a scripted opener — plain assignment, no module mocking — so
 * the approval flow is testable without a browser.
 */
export const approvalDeps: {
  startTask: (options: {
    targetUrl: string
    taskName: string
  }) => Promise<NativeApprovalTask>
} = {
  async startTask(config) {
    const cfg = { __proto__: null, ...config } as typeof config
    return await openNativeNpmGrantUrl(cfg.targetUrl)
  },
}

/**
 * Open `url` where the operator can actually approve it. npm approval pages
 * only count when the attended browser is signed in as the PUBLISH account.
 */
export async function openApprovalUrl(url: string): Promise<void> {
  await closeApprovalSession()
  approvalSession = await approvalDeps.startTask({
    targetUrl: url,
    taskName: 'npm-approval',
  })
  logger.info('approval page opened in the verified shared browser session.')
}

/**
 * Close the approval window once the run is done with approvals. Safe to call
 * when none was ever opened.
 */
export async function closeApprovalSession(): Promise<void> {
  const session = approvalSession
  approvalSession = undefined
  if (session) {
    await session.cleanup()
  }
}

export async function main(): Promise<void> {
  try {
    await runTrust()
  } finally {
    // The approval window holds an attended task; leaving
    // it open would make the NEXT run's approval fall back to the default
    // browser — the exact failure the window exists to prevent.
    await closeApprovalSession()
  }
}

export function classifyTrustReadFailure(result: TrustCommandResult): string {
  // Capture npm's stable uppercase error code from either CLI prefix shape.
  const code = /\bnpm (?:error )?code\s+([A-Z0-9_-]+)/i.exec(result.output)?.[1]
  if (code === 'EUNKNOWNCOMMAND' || code === 'EUSAGE') {
    return `CLI unsupported (${code})`
  }
  if (code === 'E401' || code === 'E403') {
    return `permission or authentication scope (${code})`
  }
  if (code === 'EOTP') {
    return 'one-time approval incomplete (EOTP)'
  }
  // Capture only actionable HTTP statuses near a status label.
  const status =
    /\b(?:status|statusCode)\D{0,8}(401|403|404|429|5\d\d)\b/i.exec(
      result.output,
    )?.[1]
  if (status) {
    return `registry endpoint response (HTTP ${status})`
  }
  return result.code === 0
    ? 'response parse failure'
    : `command exit ${result.code}`
}

function isTrustRateLimit(output: string): boolean {
  // Accept npm's code, HTTP label, or stable rate-limit phrase.
  return /\bE429\b|\bHTTP\s*429\b|rate limit/i.test(output)
}

export function parseTrustListJson(
  output: string,
): ReturnType<typeof parseTrustedPublisherBindings> {
  const plain = stripAnsi(output)
  if (!plain.trim()) {
    return []
  }
  const json = completeTrustJson(plain)
  if (!json) {
    const bindings = parseTrustedPublisherBindings(plain)
    if (bindings.length) {
      return bindings
    }
    throw new Error('missing trusted-publisher data')
  }
  JSON.parse(json)
  return parseTrustedPublisherBindings(json)
}

function completeTrustJson(output: string): string | undefined {
  const bindings: unknown[] = []
  for (let start = 0; start < output.length; start += 1) {
    // 91 is `[` and 123 is `{`. `start` is an integer loop index.
    const code = output.charCodeAt(start)
    if (code !== 91 && code !== 123) {
      continue
    }
    const candidate = balancedJsonAt(output, start)
    if (!candidate) {
      continue
    }
    const parsed = JSON.parse(candidate) as unknown
    const values = Array.isArray(parsed) ? parsed : [parsed]
    for (const value of values) {
      if (isTrustBindingJson(value)) {
        bindings.push(value)
      }
    }
    start += candidate.length - 1
  }
  return bindings.length ? JSON.stringify(bindings) : undefined
}

function isTrustBindingJson(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const row = value as Record<string, unknown>
  return typeof row['type'] === 'string' && Array.isArray(row['permissions'])
}

function balancedJsonAt(output: string, start: number): string | undefined {
  const stack: string[] = []
  let escaped = false
  let quoted = false
  for (let index = start; index < output.length; index += 1) {
    const char = output[index]!
    if (quoted) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        quoted = false
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === '[' || char === '{') {
      stack.push(char)
    } else if (char === ']' || char === '}') {
      const open = stack.pop()
      if ((open === '[') !== (char === ']')) {
        return undefined
      }
      if (!stack.length) {
        const candidate = output.slice(start, index + 1)
        try {
          JSON.parse(candidate)
          return candidate
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

async function readTrustBindings(config: {
  apply: boolean
  args: readonly string[]
  neutralCwd: string
  npmPath: string
}): Promise<{
  bindings: ReturnType<typeof parseTrustedPublisherBindings>
  readable: boolean
}> {
  const cfg = { __proto__: null, ...config } as typeof config
  const run = async (): Promise<TrustCommandResult> =>
    cfg.apply
      ? await runTrustCommandInteractive(cfg.npmPath, cfg.args, cfg.neutralCwd)
      : await runCaptureBoth(cfg.npmPath, cfg.args, cfg.neutralCwd)
  let result = await run()
  if (result.code !== 0 && isTrustRateLimit(result.output)) {
    await sleep(WRITE_SPACING_MS)
    result = await run()
  }
  if (result.code !== 0 || isOtpRequired(result.output)) {
    logger.warn(
      `${cfg.args[2]}: trust read refused (${classifyTrustReadFailure(result)}).`,
    )
    return { bindings: [], readable: false }
  }
  try {
    return { bindings: parseTrustListJson(result.output), readable: true }
  } catch {
    logger.warn(
      `${cfg.args[2]}: trust read refused (${classifyTrustReadFailure(result)}).`,
    )
    return { bindings: [], readable: false }
  }
}

/**
 * Read each package's CURRENT trusted publisher and pair it with the desired
 * one. A package with no `--repo` and no matching rule is derived from the
 * current repository or the registry packument. An unreadable row is recorded
 * as unreadable, never guessed: a package that could not be read is never
 * written blind.
 */
async function planTrustedPublishers(config: {
  apply: boolean
  localPackages: readonly string[]
  localRepository: string | undefined
  neutralCwd: string
  npmPath: string
  packages: readonly string[]
  repoOverride: string | undefined
}): Promise<TrustPlan[]> {
  const cfg = { __proto__: null, ...config } as typeof config
  const { neutralCwd, npmPath, packages } = cfg
  const platformsByRepository = new Map<string, Promise<readonly string[]>>()
  const plans: TrustPlan[] = []
  for (let p = 0, { length } = packages; p < length; p += 1) {
    const pkg = packages[p]!
    let desired = desiredTrustedPublisher({
      pkg,
      repoOverride:
        cfg.repoOverride ??
        (cfg.localPackages.includes(pkg) ? cfg.localRepository : undefined),
    })
    if (!desired) {
      // Npm rate-limits account reads.
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const derived = await deriveRepoFromRegistry(npmPath, pkg, neutralCwd)
      if (derived) {
        logger.info(`${pkg}: repository ${derived} (derived)`)
        desired = desiredTrustedPublisher({
          pkg,
          repoOverride: derived,
        })
      }
    }
    if (!desired) {
      logger.fail(
        `cannot derive a repository for ${pkg}.\n` +
          '  What:  a trusted publisher names the GitHub repo that may publish.\n' +
          `  Where: ${pkg}\n` +
          '  Saw:   no --repo, the registry packument names no GitHub repository, ' +
          'and the current repository does not identify this package.\n' +
          '  Fix:   pass --repo <owner/name>.',
      )
      process.exitCode = 1
      continue
    }
    const repository = `${desired.repositoryOwner}/${desired.repositoryName}`
    let platforms = platformsByRepository.get(repository)
    if (!platforms) {
      platforms = readPublisherNapiPlatforms(repository)
      platformsByRepository.set(repository, platforms)
    }
    desired = desiredTrustedPublisher({
      napiPlatforms: [...(await platforms)],
      pkg,
      repoOverride: repository,
    })!
    // Npm rate-limits account reads.
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const listArgs = ['trust', 'list', pkg, ...(cfg.apply ? [] : ['--json'])]
    // Account reads stay sequential to respect npm rate limits.
    // eslint-disable-next-line no-await-in-loop -- ordered reads
    const { bindings, readable } = await readTrustBindings({
      apply: cfg.apply,
      args: listArgs,
      neutralCwd,
      npmPath,
    })
    const canonicalBindings = bindings.filter(binding =>
      trustedPublisherBindingMatches(binding, desired),
    )
    const canonicalPresent = canonicalBindings.length > 0
    const staleBindings = supersededTrustedPublisherBindings(
      bindings,
      desired,
      LEGACY_WORKFLOW_FILENAMES,
    )
    const staleIds = staleBindings
      .map(binding => binding.id)
      .filter((id): id is string => id !== undefined)
    plans.push({
      canonicalPresent,
      desired,
      matches:
        readable &&
        canonicalBindings.length === 1 &&
        staleBindings.length === 0,
      pkg,
      readable,
      staleIds,
    })
  }
  return plans
}

/**
 * Print what the run sees, one line per package: conforming, to-be-configured,
 * or unreadable, each with the repo, workflow, and environment it binds to.
 */
function logTrustPlanTable(config: {
  apply: boolean
  pendingCount: number
  plans: readonly TrustPlan[]
  unreadableCount: number
}): void {
  const cfg = { __proto__: null, ...config } as typeof config
  const { plans } = cfg
  logger.log(
    `npm trusted publishers — ${plans.length} package(s), ` +
      `${cfg.pendingCount} to configure, ${cfg.unreadableCount} unreadable` +
      `${cfg.apply ? '' : ' [dry-run]'}`,
  )
  for (let i = 0, { length } = plans; i < length; i += 1) {
    const plan = plans[i]!
    const changes: string[] = []
    if (plan.readable && !plan.canonicalPresent) {
      changes.push('add canonical')
    }
    if (plan.readable && plan.staleIds.length) {
      changes.push(`remove ${plan.staleIds.length} superseded`)
    }
    const label = plan.readable
      ? plan.matches
        ? 'conforms'
        : `would ${changes.length ? changes.join(' and ') : 'repair canonical'}`
      : 'unreadable'
    logger.log(
      `  ${plan.pkg}: ${label} — ${plan.desired.repositoryOwner}/` +
        `${plan.desired.repositoryName} ${plan.desired.workflowFilename} ` +
        `env ${plan.desired.environmentName}`,
    )
  }
}

/**
 * Write each missing canonical publisher and verify it. Only then revoke
 * known superseded workflows in the same repository by exact binding ID.
 * A REFUSED verify read is reported as UNVERIFIED, never as a failed write —
 * claiming a write failed when only the read did hides a write that landed.
 */
async function applyTrustedPublisherWrites(config: {
  neutralCwd: string
  npmPath: string
  pending: readonly TrustPlan[]
}): Promise<{ configured: number; failures: string[]; unverified: string[] }> {
  const cfg = { __proto__: null, ...config } as typeof config
  const { neutralCwd, npmPath, pending } = cfg
  let configured = 0
  const failures: string[] = []
  const unverified: string[] = []
  for (let i = 0, { length } = pending; i < length; i += 1) {
    const plan = pending[i]!
    if (i > 0) {
      // One 2FA window, npm's own rate-limit guidance.
      // eslint-disable-next-line no-await-in-loop -- sequential
      await sleep(WRITE_SPACING_MS)
    }
    let code = 0
    if (!plan.canonicalPresent) {
      // Sequential writes share one approval window.
      // eslint-disable-next-line no-await-in-loop -- sequential
      code = await runTrustWriteInteractive(
        npmPath,
        buildTrustWriteArgs(plan.pkg, plan.desired),
        neutralCwd,
      )
    }
    // eslint-disable-next-line no-await-in-loop -- the verify belongs
    let verify = await runCaptureBoth(
      npmPath,
      ['trust', 'list', plan.pkg],
      neutralCwd,
    )
    if (isOtpRequired(verify.output)) {
      unverified.push(plan.pkg)
      logger.warn(formatUnverifiable(plan.pkg, plan.desired, code))
      continue
    }
    if (
      code !== 0 ||
      !trustReadMatches({ desired: plan.desired, result: verify })
    ) {
      failures.push(plan.pkg)
      logger.fail(formatVerifyFailure(plan.pkg, plan.desired, verify.output))
      continue
    }
    const stale = supersededTrustedPublisherBindings(
      parseTrustedPublisherBindings(verify.output),
      plan.desired,
      LEGACY_WORKFLOW_FILENAMES,
    )
    let revokeFailed = false
    for (const binding of stale) {
      if (!binding.id) {
        revokeFailed = true
        break
      }
      // eslint-disable-next-line no-await-in-loop -- bounded sequential writes
      const revokeCode = await runTrustWriteInteractive(
        npmPath,
        buildTrustRevokeArgs(plan.pkg, binding.id),
        neutralCwd,
      )
      if (revokeCode !== 0) {
        revokeFailed = true
        break
      }
    }
    if (revokeFailed) {
      failures.push(plan.pkg)
      logger.fail(`${plan.pkg}: a superseded binding could not be revoked.`)
      continue
    }
    if (stale.length === 0) {
      configured += 1
      logger.success(`${plan.pkg}: configured and verified.`)
      continue
    }
    // eslint-disable-next-line no-await-in-loop -- final proof belongs here
    verify = await runCaptureBoth(
      npmPath,
      ['trust', 'list', plan.pkg],
      neutralCwd,
    )
    const finalBindings = parseTrustedPublisherBindings(verify.output)
    const staleRemain = supersededTrustedPublisherBindings(
      finalBindings,
      plan.desired,
      LEGACY_WORKFLOW_FILENAMES,
    )
    if (
      !trustReadMatches({ desired: plan.desired, result: verify }) ||
      staleRemain.length > 0
    ) {
      failures.push(plan.pkg)
      logger.fail(formatVerifyFailure(plan.pkg, plan.desired, verify.output))
      continue
    }
    configured += 1
    logger.success(`${plan.pkg}: configured and verified.`)
  }
  return { configured, failures, unverified }
}

function selectTrustPackages(flags: ReturnType<typeof parseTrustArgs>) {
  const targetRepoRoot = REPO_ROOT
  const localRepository = currentPublisherRepository(targetRepoRoot)
  if (!flags.packages.length && flags.repo && flags.repo !== localRepository) {
    throw new TypeError(
      'Package selection is required. Where: --repo. Saw a foreign repository without package names, wanted explicit packages. Fix: name the packages or run the command in their repository.',
    )
  }
  const localPackages = flags.packages.length
    ? []
    : enumerateRepoPackages(targetRepoRoot)
  const packages = flags.packages.length ? [...flags.packages] : localPackages
  return {
    __proto__: null,
    localPackages,
    localRepository,
    packages,
    targetRepoRoot,
  }
}

async function runTrust(): Promise<void> {
  const flags = parseTrustArgs(getScriptArgs())
  const { localPackages, localRepository, packages, targetRepoRoot } =
    selectTrustPackages(flags)
  if (!packages.length) {
    logger.fail(
      'no publishable packages found.\n' +
        '  What:  this flow configures a trusted publisher per published package.\n' +
        `  Where: ${targetRepoRoot}\n` +
        '  Saw:   no package arguments and no publishable manifest in the repo.\n' +
        '  Fix:   name the packages explicitly, or run from a repo that publishes — ' +
        'pnpm run npm:trust [@scope/pkg…] [--repo owner/name] [--apply]',
    )
    process.exitCode = 1
    return
  }
  const resolution = resolvePinnedNpm({
    home: os.homedir(),
    repoRoot: REPO_ROOT,
  })
  if (!resolution.npmPath) {
    logger.fail(`cannot resolve the pinned npm: ${resolution.refusal ?? ''}`)
    process.exitCode = 1
    return
  }
  const npmPath = resolution.npmPath
  // Neutral cwd: npm refuses to run inside a repo whose devEngines names pnpm.
  const neutralCwd = os.tmpdir()
  const versionRun = await runCapture(npmPath, ['--version'], neutralCwd)
  const npmVersion = versionRun.stdout.trim()
  if (!meetsMinimumVersion(npmVersion, MIN_NPM_VERSION)) {
    logger.fail(
      `the pinned npm is too old for \`npm trust\`.\n` +
        `  What:  trusted-publisher configuration needs npm ${MIN_NPM_VERSION} or newer.\n` +
        `  Where: ${npmPath}\n` +
        `  Saw:   npm ${npmVersion || '(unknown)'}; wanted >= ${MIN_NPM_VERSION}.\n` +
        `  Fix:   raise the .node-version pin to a Node whose bundled npm is ${MIN_NPM_VERSION}+.`,
    )
    process.exitCode = 1
    return
  }
  const plans = await planTrustedPublishers({
    apply: flags.apply,
    localPackages,
    localRepository,
    neutralCwd,
    npmPath,
    packages,
    repoOverride: flags.repo,
  })
  const unreadable = plans.filter(plan => !plan.readable)
  const pending = plans.filter(plan => plan.readable && !plan.matches)
  logTrustPlanTable({
    apply: flags.apply,
    pendingCount: pending.length,
    plans,
    unreadableCount: unreadable.length,
  })
  if (unreadable.length) {
    logger.fail(
      `${unreadable.length} package(s) could not be read.\n` +
        `  Where: ${unreadable.map(plan => plan.pkg).join(', ')}\n` +
        '  Saw:   the sanitized refusal category is reported above.\n' +
        '  Fix:   resolve the reported CLI, permission, endpoint, or response ' +
        'problem; an unreadable package is never written blind.',
    )
    process.exitCode = 1
  }
  if (!flags.apply) {
    logger.log('Re-run with --apply to write these configurations.')
    return
  }
  if (!pending.length) {
    if (unreadable.length) {
      logger.log(
        'nothing to write — the unreadable package(s) above remain unproven.',
      )
    } else {
      logger.success('every named package already conforms — nothing to write.')
    }
    return
  }
  logger.log(formatAuthGate(pending.length))
  const { configured, failures, unverified } =
    await applyTrustedPublisherWrites({ neutralCwd, npmPath, pending })
  const skipped = plans.length - pending.length - unreadable.length
  logger.log(
    `Trusted-publisher summary: ${configured} configured, ${skipped} already ` +
      `conforming, ${unreadable.length} unreadable, ` +
      `${unverified.length} unverifiable, ${failures.length} failed.`,
  )
  // An unverifiable package is an unfinished job, not a green one: the exit is
  // non-zero so a pipeline never treats "could not read" as "configured".
  if (failures.length || unverified.length) {
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'configures npm trusted publishers for workspace packages through the npm trust registry API',
  help: `Usage: node scripts/fleet/registry-infra/npm/settings/trust.mts [<pkg>…] [flags]

  --apply              perform the writes and verify each (dry-run by default)
  --repo <owner/name>  override the repository the trusted publisher binds to`,
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
