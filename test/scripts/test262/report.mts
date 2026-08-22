/**
 * @file Format a run summary for a human.
 */

import type { Bucket, Summary, Verdict } from './types.mts'

/**
 * Verdicts in one bucket.
 */
export function verdictsIn(summary: Summary, bucket: Bucket): Verdict[] {
  const out: Verdict[] = []
  const { verdicts } = summary
  for (let i = 0, { length } = verdicts; i < length; i += 1) {
    const verdict = verdicts[i]!
    if (verdict.bucket === bucket) {
      out.push(verdict)
    }
  }
  return out
}

/**
 * The human-readable report. Failures come first: a run that ends badly should
 * not need scrolling to find out why.
 */
export function formatSummary(summary: Summary): string {
  const unexpected = verdictsIn(summary, 'unexpected-fail')
  const nowPassing = verdictsIn(summary, 'now-passing')
  const expectedPass = verdictsIn(summary, 'expected-pass')
  const expectedFail = verdictsIn(summary, 'expected-fail')
  const lines: string[] = []

  if (summary.verdicts.length === 0) {
    lines.push(
      'No tests ran. The pinned subset is empty or unfetched, which is NOT a pass.',
    )
    lines.push(
      'Fix: node scripts/fleet/git-partial-submodule.mts clone upstream/test262',
    )
    return lines.join('\n')
  }

  for (let i = 0, { length } = unexpected; i < length; i += 1) {
    const verdict = unexpected[i]!
    lines.push(`FAIL ${verdict.id}`)
    if (verdict.output) {
      lines.push(indent(verdict.output.trimEnd()))
    }
  }
  for (let i = 0, { length } = nowPassing; i < length; i += 1) {
    lines.push(
      `NOW PASSING ${nowPassing[i]!.id} - remove it from the allowlist`,
    )
  }
  for (let i = 0, { length } = summary.staleAllowlist; i < length; i += 1) {
    lines.push(
      `STALE ALLOWLIST ${summary.staleAllowlist[i]!} - matched no test`,
    )
  }
  lines.push(
    `${expectedPass.length} passed, ${unexpected.length} unexpected failure(s), ${expectedFail.length} known failure(s), ${nowPassing.length} now passing`,
  )
  return lines.join('\n')
}

/**
 * Indent a block by two spaces so it reads as detail under its heading.
 */
export function indent(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    out.push(`  ${lines[i]!}`)
  }
  return out.join('\n')
}
