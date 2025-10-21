/**
 * @fileoverview Build script with selective build step flags.
 */

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

// Parse command line flags
const args = process.argv.slice(2)
const flags = {
  js: args.includes('--js'),
  types: args.includes('--types'),
  externals: args.includes('--externals'),
}

// If no flags specified, run all steps
const runAll = !flags.js && !flags.types && !flags.externals

// Run build steps
async function main() {
  try {
    // Clean first if running full build
    if (runAll) {
      await runCommand(
        'pnpm',
        ['run', 'clean'],
        'Cleaning Build Artifacts',
      )
    }

    // Build JS
    if (runAll || flags.js) {
      await runCommand(
        'node',
        [path.join(__dirname, 'build-js.mjs')],
        'Building JavaScript',
      )
    }

    // Build types
    if (runAll || flags.types) {
      await runCommand(
        'pnpm',
        ['exec', 'tsgo', '--project', 'tsconfig.dts.json', '--declaration', '--emitDeclarationOnly'],
        'Building Types',
      )
    }

    // Build externals
    if (runAll || flags.externals) {
      await runCommand(
        'node',
        [path.join(__dirname, 'build-externals.mjs')],
        'Building Externals',
      )
    }

    // Fix exports at the end if running full build
    if (runAll) {
      await runCommand(
        'pnpm',
        ['run', 'fix:exports'],
        'Fixing CommonJS Exports',
      )
    }

    process.exitCode = 0
  } catch (error) {
    printError(`Build script failed: ${error.message}`)
    process.exitCode = 1
  }
}

main()
