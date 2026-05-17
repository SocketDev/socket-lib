/**
 * @fileoverview Run tests with coverage reporting.
 * Sets COVERAGE=true so vitest config enables source resolution.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { spawn } from '@socketsecurity/lib-stable/spawn'

const WIN32 = process.platform === 'win32'

const rootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

// Pass through any extra args (e.g. test file filters)
const customFlags = ['--code-only', '--type-only', '--summary']
const extraArgs = process.argv
  .slice(2)
  .filter(arg => !customFlags.includes(arg))

const result = await spawn(
  'pnpm',
  [
    'exec',
    'vitest',
    '--config',
    '.config/vitest.config.mts',
    'run',
    '--coverage',
    ...extraArgs,
  ],
  {
    cwd: rootPath,
    shell: WIN32,
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: 'true' },
  },
)

process.exitCode = result.code
