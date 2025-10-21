/**
 * @fileoverview Fix script that runs package export generation and Biome with auto-fix enabled.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import colors from 'yoctocolors-cjs'

import { printError, printHeader, replaceHeader } from './utils/cli-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..')

/**
 * Run a command and return a promise that resolves when it completes.
 */
function _runCommand(command, args, label) {
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
      printHeader('Package Exports')
      const exportChild = spawn(
        'node',
        [path.join(__dirname, 'generate-package-exports.mjs')],
        {
          stdio: 'pipe',
          cwd: rootPath,
          ...(process.platform === 'win32' && { shell: true }),
        },
      )
      await new Promise((resolve, reject) => {
        exportChild.on('exit', code => {
          if (code === 0) {
            replaceHeader(colors.green('✓ Package exports generated'))
            resolve()
          } else {
            reject(new Error(`Package exports exited with code ${code}`))
          }
        })
        exportChild.on('error', reject)
      })
    } else {
      printHeader('Skipping Package Exports (dist/ not found)')
    }

    // Step 2: Fix default imports (prints its own header and success)
    const child = spawn(
      'node',
      [path.join(__dirname, 'fix-default-imports.mjs')],
      {
        stdio: 'inherit',
        cwd: rootPath,
        ...(process.platform === 'win32' && { shell: true }),
      },
    )
    await new Promise((resolve, reject) => {
      child.on('exit', code => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Fix default imports exited with code ${code}`))
        }
      })
      child.on('error', reject)
    })

    // Step 3: Run Biome auto-fix
    printHeader('Biome Auto-fix')
    const biomeChild = spawn(
      'pnpm',
      [
        'exec',
        'biome',
        'check',
        '--write',
        '--unsafe',
        '.',
        ...process.argv.slice(2),
      ],
      {
        stdio: 'inherit',
        cwd: rootPath,
        ...(process.platform === 'win32' && { shell: true }),
      },
    )
    await new Promise((resolve, reject) => {
      biomeChild.on('exit', code => {
        if (code === 0) {
          replaceHeader(colors.green('✓ Biome auto-fix complete'), 1)
          resolve()
        } else {
          reject(new Error(`Biome auto-fix exited with code ${code}`))
        }
      })
      biomeChild.on('error', reject)
    })

    process.exitCode = 0
  } catch (error) {
    printError(`Fix script failed: ${error.message}`)
    process.exitCode = 1
  }
}

main()
