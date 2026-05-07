#!/usr/bin/env node
/**
 * @fileoverview `socket-lib` CLI entry point — top-level dispatcher.
 *
 *   socket-lib                          — print help, list commands
 *   socket-lib check <name> [opts...]   — run a fleet-wide check
 *
 * Subcommands live as siblings under `src/bin/`; each is its own
 * file so a misbehaving check can't crash other commands at parse
 * time. The dispatcher just routes; subcommands own their own arg
 * parsing.
 *
 * The CLI is shipped via the `bin` field in package.json and
 * intended to be invoked as `pnpm exec socket-lib <command>` from
 * any consumer that has `@socketsecurity/lib` as a (dev)dependency.
 */

import process from 'node:process'

import { getDefaultLogger } from '../logger'

import { runCheck } from './check'

const logger = getDefaultLogger()

export function printHelp(): void {
  logger.log('socket-lib — fleet-wide static-analysis CLI')
  logger.log('')
  logger.log('Usage:')
  logger.log('  socket-lib <command> [...args]')
  logger.log('')
  logger.log('Commands:')
  logger.log('  check <name>   Run a fleet-wide check (primordials, ...).')
  logger.log('')
  logger.log('Run `socket-lib check --help` for the list of checks.')
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return 0
  }

  switch (command) {
    case 'check': {
      return await runCheck(args.slice(1))
    }
    default: {
      logger.error(`socket-lib: unknown command '${command}'`)
      logger.error('Run `socket-lib --help` for the list of commands.')
      return 1
    }
  }
}

// Run main only when this module is the entry point (`socket-lib`
// invocation). Importing it from another module — e.g. the build
// validator — must not trigger CLI behavior.
//
// `require.main === module` is the CJS equivalent of the ESM
// `import.meta.url === pathToFileURL(argv[1]).href` check; since the
// emitted dist is CJS, this is what works at runtime.
declare const require: { main: unknown }
declare const module: unknown

/* c8 ignore next 5 - CJS CLI entry guard; only fires when this
   module is invoked as the bin (`socket-lib`), not when imported. */
if (typeof require !== 'undefined' && require.main === module) {
  void main().then(code => {
    process.exit(code)
  })
}
