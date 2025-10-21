/**
 * @fileoverview Fix script that runs package export generation and Biome with auto-fix enabled.
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { printError, printHeader } from './utils/cli-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..')

/**
 * Run a command and return a promise that resolves when it completes.
 */
function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    printHeader(label)
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: rootPath,
      ...(process.platform === 'win32' && { shell: true }),
    })

    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${label} exited with code ${code}`))
      }
    })

    child.on('error', error => {
      printError(`${label} failed: ${error.message}`)
      reject(error)
    })
  })
}

// Run tasks sequentially
async function main() {
  try {
    // Step 1: Generate package exports (only if dist/ exists)
    const distPath = path.join(rootPath, 'dist')
    if (existsSync(distPath)) {
      await runCommand(
        'node',
        [path.join(__dirname, 'generate-package-exports.mjs')],
        'Generating Package Exports',
      )
    } else {
      printHeader('Skipping Package Exports (dist/ not found)')
    }

    // Step 2: Fix default imports
    await runCommand(
      'node',
      [path.join(__dirname, 'fix-default-imports.mjs')],
      'Fixing Default Imports',
    )

    // Step 3: Run Biome auto-fix
    await runCommand(
      'pnpm',
      ['exec', 'biome', 'check', '--write', '--unsafe', '.', ...process.argv.slice(2)],
      'Running Auto-fix',
    )

    process.exitCode = 0
  } catch (error) {
    printError(`Fix script failed: ${error.message}`)
    process.exitCode = 1
  }
}

main()
