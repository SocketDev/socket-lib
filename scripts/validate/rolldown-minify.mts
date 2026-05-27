/**
 * @file Validates that the rolldown build configs keep `output.minify: false`.
 *   Minification breaks ESM/CJS interop in the per-file lib output and makes
 *   the bundled externals harder to debug, so it must stay off.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

const logger = getDefaultLogger()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..', '..')

interface Violation {
  config: string
  value: unknown
  message: string
  location: string
}

/**
 * Validate the rolldown build configs have `output.minify: false`. Checks the
 * main source config (`buildConfig.output.minify`) and the externals config
 * (built via `getRolldownConfig`, whose output must also be unminified).
 */
export async function validateRolldownMinify(): Promise<Violation[]> {
  const violations: Violation[] = []

  const sourceConfigPath = path.join(rootPath, '.config/rolldown.config.mts')
  const externalsConfigPath = path.join(
    rootPath,
    'scripts/build-externals/rolldown-config.mts',
  )

  try {
    // oxlint-disable-next-line socket/no-dynamic-import-outside-bundle -- config path is computed at runtime.
    const sourceConfig = await import(sourceConfigPath)
    const buildOutput = sourceConfig.buildConfig?.output
    if (buildOutput && buildOutput.minify !== false) {
      violations.push({
        config: 'buildConfig.output',
        value: buildOutput.minify,
        message: 'buildConfig.output.minify must be false',
        location: sourceConfigPath,
      })
    }
  } catch (e) {
    logger.fail(
      `Failed to load rolldown source config: ${(e as Error).message}`,
    )
    process.exitCode = 1
    return []
  }

  try {
    // oxlint-disable-next-line socket/no-dynamic-import-outside-bundle -- config path is computed at runtime.
    const externalsConfig = await import(externalsConfigPath)
    // getRolldownConfig builds the per-package config; probe its output.
    const probe = externalsConfig.getRolldownConfig?.('entry.js', 'out.js')
    if (probe?.output && probe.output.minify !== false) {
      violations.push({
        config: 'getRolldownConfig().output',
        value: probe.output.minify,
        message: 'externals getRolldownConfig().output.minify must be false',
        location: externalsConfigPath,
      })
    }
  } catch (e) {
    logger.fail(
      `Failed to load rolldown externals config: ${(e as Error).message}`,
    )
    process.exitCode = 1
    return []
  }

  return violations
}

async function main(): Promise<void> {
  const violations = await validateRolldownMinify()

  if (violations.length === 0) {
    logger.success('rolldown minify validation passed')
    process.exitCode = 0
    return
  }

  logger.fail('rolldown minify validation failed\n')

  for (const violation of violations) {
    logger.log(`  ${violation.message}`)
    logger.log(`  Found: minify: ${violation.value}`)
    logger.log('  Expected: minify: false')
    logger.log(`  Location: ${violation.location}`)
    logger.log('')
  }

  logger.log('Minification breaks ESM/CJS interop and makes debugging harder.')
  logger.log('')

  process.exitCode = 1
}

main().catch(error => {
  logger.fail('Validation failed:', error)
  process.exitCode = 1
})
