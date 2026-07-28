/**
 * @file Agent-CLI flag compatibility: recognize a flag the installed CLI does
 *   not know, and strip it so the spawn can be retried without it. The flags
 *   `buildArgs` emits track the newest agent CLIs, but the CLI actually on PATH
 *   can be older. An unrecognized flag fails the process before any work
 *   happens, so a spawn layer that cannot degrade turns a cosmetic version skew
 *   into a total outage.
 */

// Flags the spawn layer adds as an OPTIMIZATION, not a correctness requirement.
// When the installed CLI does not know one, dropping it and retrying yields the
// same work at the CLI's default reasoning depth — strictly better than failing.
export const OPTIONAL_CLI_FLAGS: readonly string[] = ['--effort']

const REJECTION_PHRASES: readonly string[] = [
  'unknown argument',
  'unknown option',
  'unrecognized option',
]

/**
 * True when the agent CLI rejected `flag` as unrecognized — commander's
 * `error: unknown option '--effort'`, or an equivalent from another CLI.
 */
export function isUnknownCliOption(
  stdout: string,
  stderr: string,
  flag: string,
): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  if (!text.includes(flag.toLowerCase())) {
    return false
  }
  for (let i = 0, { length } = REJECTION_PHRASES; i < length; i += 1) {
    if (text.includes(REJECTION_PHRASES[i]!)) {
      return true
    }
  }
  return false
}

/**
 * `args` with every occurrence of `flag` and the value following it removed.
 */
export function withoutCliFlag(
  args: readonly string[],
  flag: string,
): string[] {
  const out: string[] = []
  for (let i = 0, { length } = args; i < length; i += 1) {
    if (args[i] === flag) {
      // Skip the flag AND its value.
      i += 1
      continue
    }
    out.push(args[i]!)
  }
  return out
}
