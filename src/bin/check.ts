/**
 * @fileoverview `socket-lib check <name>` subcommand group.
 *
 * Routes to per-check handlers by name. Each check resolves its
 * config file and runs its check; the group itself just dispatches
 * and prints help.
 *
 * Available checks:
 *   primordials   Drift between a repo's `primordials` destructures
 *                 and socket-lib's userland mirror.
 *
 * Aliases let callers shorten the common ones:
 *   prim          → primordials
 */

import { getDefaultLogger } from '../logger'

import { runCheckPrimordials } from './check-primordials'

const logger = getDefaultLogger()

// Each entry maps an invocation name to the canonical name. Aliases
// resolve to the same handler; help prints them grouped.
const CHECKS: ReadonlyMap<string, string> = new Map([
  ['primordials', 'primordials'],
  ['prim', 'primordials'],
])

const ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ['primordials', ['prim']],
])

function printHelp(): void {
  logger.log('socket-lib check — fleet-wide static-analysis checks')
  logger.log('')
  logger.log('Usage:')
  logger.log('  socket-lib check <name> [...opts]')
  logger.log('')
  logger.log('Checks:')
  for (const [canonical, aliases] of ALIASES) {
    const aliasStr = aliases.length > 0 ? ` (alias: ${aliases.join(', ')})` : ''
    logger.log(`  ${canonical}${aliasStr}`)
  }
  logger.log('')
  logger.log('Run `socket-lib check <name> --help` for check-specific options.')
}

export async function runCheck(args: readonly string[]): Promise<number> {
  const name = args[0]
  if (!name || name === '--help' || name === '-h') {
    printHelp()
    return 0
  }
  const canonical = CHECKS.get(name)
  if (!canonical) {
    logger.error(`socket-lib check: unknown check '${name}'`)
    logger.error('Run `socket-lib check --help` for the list of checks.')
    return 1
  }

  switch (canonical) {
    case 'primordials':
      return await runCheckPrimordials(args.slice(1))
    // Unreachable; CHECKS map is exhaustive.
    /* c8 ignore start */
    default:
      logger.error(`socket-lib check: missing handler for '${canonical}'`)
      return 1
    /* c8 ignore stop */
  }
}
