/**
 * @file TypeScript type coverage utilities.
 */

import { spawn } from '../process/spawn/child.mjs'

import type { GetTypeCoverageOptions, TypeCoverageResult } from './types.mjs'

import { ErrorCtor } from '../primordials/error.mjs'

import { NumberParseInt } from '../primordials/number.mjs'
import { getNodeProcess } from '../node/process.mjs'
/**
 * Get TypeScript type coverage metrics.
 *
 * @throws {Error} When type-coverage command fails (if generateIfMissing is
 *   false).
 */
export async function getTypeCoverage(
  options?: GetTypeCoverageOptions | undefined,
): Promise<TypeCoverageResult | undefined> {
  const nodeProcess = getNodeProcess()
  const opts = {
    __proto__: null,
    cwd: nodeProcess.cwd(),
    generateIfMissing: false,
    ...options,
  } as GetTypeCoverageOptions

  const { cwd, generateIfMissing } = opts

  if (!cwd) {
    throw new ErrorCtor('Working directory is required.')
  }

  try {
    // Run type-coverage to get metrics.
    const result = await spawn('type-coverage', ['--detail'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const outputText = result.stdout ? result.stdout.toString() : ''
    // Parse type-coverage's summary line `1234 / 5678 48.92%`: group 1 =
    // covered count, group 2 = total count, group 3 = the percentage.
    const match = /(\d+) \/ (\d+) ([\d.]+)%/.exec(outputText)

    if (!match || !match[1] || !match[2] || !match[3]) {
      return undefined
    }

    return {
      covered: NumberParseInt(match[1], 10),
      percent: match[3],
      total: NumberParseInt(match[2], 10),
    }
  } catch (e) {
    if (generateIfMissing) {
      throw new ErrorCtor(
        'Unable to generate type coverage. Ensure type-coverage is installed.',
        { cause: e },
      )
    }
    // If not generating, return null when type-coverage isn't available.
    return undefined
  }
}
