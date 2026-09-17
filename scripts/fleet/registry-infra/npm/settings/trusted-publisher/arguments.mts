import { abortScript } from '../../../../process/script-result.mts'

import { logger } from '../../../shared.mts'

export interface TrustedPublisherCliArgs {
  drive: boolean
  environment?: string | undefined
  mode: 'apply' | 'read'
  packages: string[]
  repo?: string | undefined
  socketRegistry: boolean
  workflow?: string | undefined
}

export const TRUSTED_PUBLISHER_USAGE =
  'Usage: trusted-publisher/browser.mts read|apply [<pkg>…] ' +
  '[--socket-registry] [--drive] [--repo <owner/name>] ' +
  '[--workflow <file.yml>] [--environment <name>]'

const ENVIRONMENT_IDENTIFIER_RE = /^[a-z0-9][a-z0-9._-]{0,254}$/iu
const REPOSITORY_IDENTIFIER_RE =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/iu
const WORKFLOW_IDENTIFIER_RE = /^[a-z0-9][a-z0-9._-]{0,249}\.ya?ml$/iu

function parseIdentifierOption(
  argv: readonly string[],
  index: number,
  flag: string,
  pattern: RegExp,
): string {
  const value = argv[index + 1]
  if (value === undefined || !pattern.test(value)) {
    logger.fail(
      'Trusted-publisher option is invalid. ' +
        `Where: ${flag}. Saw an absent or unsafe value, wanted a safe identifier. ` +
        'Fix: provide the verified value.',
    )
    abortScript(1)
  }
  return value
}

export function parseTrustedPublisherArgs(
  argv: readonly string[],
): TrustedPublisherCliArgs {
  const mode = argv[0]
  if (mode !== 'apply' && mode !== 'read') {
    logger.fail(TRUSTED_PUBLISHER_USAGE)
    abortScript(1)
  }
  let drive = false
  let environment: string | undefined
  let repo: string | undefined
  let socketRegistry = false
  let workflow: string | undefined
  const packages: string[] = []
  for (let i = 1, { length } = argv; i < length; i += 1) {
    const arg = argv[i]!
    if (arg === '--drive') {
      drive = true
      continue
    }
    if (arg === '--socket-registry') {
      socketRegistry = true
      continue
    }
    if (arg === '--repo') {
      repo = parseIdentifierOption(argv, i, arg, REPOSITORY_IDENTIFIER_RE)
      i += 1
      continue
    }
    if (arg === '--workflow') {
      workflow = parseIdentifierOption(argv, i, arg, WORKFLOW_IDENTIFIER_RE)
      i += 1
      continue
    }
    if (arg === '--environment') {
      environment = parseIdentifierOption(
        argv,
        i,
        arg,
        ENVIRONMENT_IDENTIFIER_RE,
      )
      i += 1
      continue
    }
    if (arg.startsWith('-')) {
      logger.fail(`Unknown flag: ${arg}`)
      logger.error(TRUSTED_PUBLISHER_USAGE)
      abortScript(1)
    }
    packages.push(arg)
  }
  const overrideCount = [environment, repo, workflow].filter(
    value => value !== undefined,
  ).length
  if (overrideCount > 0 && overrideCount < 3) {
    logger.fail(
      'Trusted-publisher target is incomplete. Where: apply overrides. ' +
        'Saw a partial target, wanted --repo, --workflow, and --environment together. ' +
        'Fix: provide the verified tuple.',
    )
    abortScript(1)
  }
  return {
    drive,
    environment,
    mode,
    packages,
    repo,
    socketRegistry,
    workflow,
  }
}
