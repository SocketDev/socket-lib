import { existsSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { rootPath } from '../shared.mts'
import { resolvePinnedNpm } from './pinned-npm.mts'

export interface NpmStageCommand {
  readonly argsPrefix: readonly string[]
  readonly command: string
  readonly env: NodeJS.ProcessEnv
}

interface NpmStageCommandConfig {
  readonly env?: NodeJS.ProcessEnv | undefined
  readonly exists?: ((filePath: string) => boolean) | undefined
  readonly home?: string | undefined
  readonly platform?: NodeJS.Platform | undefined
  readonly realpath?: ((filePath: string) => string) | undefined
  readonly repoRoot?: string | undefined
  readonly resolvePinned?: typeof resolvePinnedNpm | undefined
}

function pathKeyForStageCommand(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string {
  if (platform !== 'win32') {
    return 'PATH'
  }
  return Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'Path'
}

function resolveNpmCliPath(config: {
  exists: (filePath: string) => boolean
  npmPath: string
  platform: NodeJS.Platform
  realpath: (filePath: string) => string
}): string | undefined {
  const { exists, npmPath, platform, realpath } = config
  if (platform !== 'win32') {
    try {
      const resolved = realpath(npmPath)
      return exists(resolved) ? resolved : undefined
    } catch {
      return undefined
    }
  }
  const binDir = path.dirname(npmPath)
  const candidates = [
    path.join(binDir, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(binDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ]
  return candidates.find(exists)
}

function buildNpmStageCommand(config: {
  env: NodeJS.ProcessEnv
  exists: (filePath: string) => boolean
  npmPath: string
  pin: string | undefined
  platform: NodeJS.Platform
  realpath: (filePath: string) => string
}): NpmStageCommand {
  const { env, exists, npmPath, pin, platform, realpath } = config
  const binDir = path.dirname(npmPath)
  const nodePath = path.join(binDir, platform === 'win32' ? 'node.exe' : 'node')
  const npmCliPath = resolveNpmCliPath({
    exists,
    npmPath,
    platform,
    realpath,
  })
  if (!exists(nodePath) || !npmCliPath) {
    throw new Error(
      'Cannot run npm staging.\n' +
        `  Where: the Node installation for ${npmPath}.\n` +
        `  Saw:   ${exists(nodePath) ? 'the pinned Node' : 'no pinned Node'} and ${npmCliPath ? 'the npm CLI module' : 'no npm CLI module'}; wanted both.\n` +
        `  Fix:   reinstall the pinned Node ${pin ?? 'version'}, then retry.`,
    )
  }
  const pathKey = pathKeyForStageCommand(env, platform)
  const currentPath = env[pathKey]
  return {
    argsPrefix: [npmCliPath],
    command: nodePath,
    env: {
      ...env,
      [pathKey]: currentPath
        ? `${binDir}${path.delimiter}${currentPath}`
        : binDir,
    },
  }
}

export function resolveNpmStageCommand(
  options: NpmStageCommandConfig = {},
): NpmStageCommand {
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const home = options.home ?? os.homedir()
  const platform = options.platform ?? process.platform
  const repoRoot = options.repoRoot ?? rootPath
  const resolution = (options.resolvePinned ?? resolvePinnedNpm)({
    home,
    repoRoot,
  })
  if (!resolution.npmPath) {
    throw new Error(`Cannot run npm staging.\n${resolution.refusal ?? ''}`)
  }
  return buildNpmStageCommand({
    env,
    exists,
    npmPath: resolution.npmPath,
    pin: resolution.pin,
    platform,
    realpath: options.realpath ?? realpathSync,
  })
}
