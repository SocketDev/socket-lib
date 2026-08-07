#!/usr/bin/env node
/**
 * @file `socket-lib` CLI entry point — top-level dispatcher. socket-lib — print
 *   help, list commands socket-lib check <name> [opts...] — run a Socket-wide
 *   check Subcommands live as siblings under `src/cli/`; each is its own file
 *   so a misbehaving check can't crash other commands at parse time. The
 *   dispatcher just routes; subcommands own their own arg parsing. The CLI is
 *   shipped via the `bin` field in package.json and intended to be invoked as
 *   `pnpm exec socket-lib <command>` from any consumer that has
 *   `@socketsecurity/lib` as a (dev)dependency.
 */

import { createRequire } from 'node:module'
import process from 'node:process'

import {
  buildCliManifest,
  describeRequest,
  renderDescribe,
} from '../exe/argv/meta'
import { getDefaultLogger } from '../logger/default'

import { runCheck } from './check'

const logger = getDefaultLogger()

// Resolves to the repo root from src/cli/ and to the published package root
// from dist/cli/ — the same two hops in both layouts.
const { version: LIB_VERSION } = createRequire(import.meta.url)(
  '../../package.json',
) as { version: string }

const MANIFEST = buildCliManifest({
  name: 'socket-lib',
  version: LIB_VERSION,
  description: 'Socket-wide static-analysis CLI',
  commands: [
    {
      name: 'check',
      description: 'Run a Socket-wide check (primordials, ...)',
      flags: [
        {
          name: 'json',
          type: 'boolean',
          default: false,
          description: 'Output as JSON',
        },
        {
          name: 'explain',
          type: 'boolean',
          default: false,
          description: 'Explain each finding',
        },
        {
          name: 'silent',
          type: 'boolean',
          default: false,
          description: 'Suppress output',
        },
      ],
    },
  ],
  flags: [
    {
      name: 'describe',
      type: 'boolean',
      default: false,
      description:
        'Print what this tool does and exit; with --json, a machine-readable command manifest',
    },
    {
      name: 'help',
      type: 'boolean',
      short: 'h',
      default: false,
      description: 'Show help',
    },
  ],
})

export function printHelp(): void {
  logger.log('socket-lib — Socket-wide static-analysis CLI')
  logger.log('')
  logger.log('Usage:')
  logger.log('  socket-lib <command> [...args]')
  logger.log('')
  logger.log('Commands:')
  logger.log('  check <name>   Run a Socket-wide check (primordials, ...).')
  logger.log('')
  logger.log('Run `socket-lib check --help` for the list of checks.')
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const describeKind = describeRequest(args)
  if (describeKind) {
    process.stdout.write(renderDescribe(describeKind, MANIFEST))
    return 0
  }

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

/* c8 ignore start - CJS CLI entry guard; only fires when this
   module is invoked as the bin (`socket-lib`), not when imported. */
if (typeof require !== 'undefined' && require.main === module) {
  void main().then(code => {
    process.exit(code)
  })
}
/* c8 ignore stop */
