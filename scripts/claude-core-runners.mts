/**
 * @file Low-level command runners for the Claude Code utilities CLI. Wraps the
 *   lib spawn helper with inherit-stdio and captured-output variants.
 */

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'

import { WIN32, rootPath } from './claude-core-shared.mts'

export async function runCommand(command, args = [], options = {}) {
  const opts = { __proto__: null, ...options }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: rootPath,
      ...(WIN32 && { shell: true }),
      ...opts,
    })

    child.on('exit', code => {
      resolve(code || 0)
    })

    child.on('error', error => {
      reject(error)
    })
  })
}

export async function runCommandWithOutput(command, args = [], options = {}) {
  const opts = { __proto__: null, ...options }
  const { input, timeout: timeoutMs, ...spawnOpts } = opts

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(command, args, {
      cwd: rootPath,
      ...(WIN32 && { shell: true }),
      ...spawnOpts,
    })

    // Kill the child once the timeout elapses and resolve with a timeout
    // result instead of racing promises (Promise.race leaks the losing
    // promise and its handles).
    const timeoutId = timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
          resolve({
            exitCode: 1,
            stdout,
            stderr: stderr || 'Operation timed out',
            timedOut: true,
          })
        }, timeoutMs)
      : undefined

    // Write input to stdin if provided.
    if (input && child.stdin) {
      child.stdin.write(input)
      child.stdin.end()
    }

    if (child.stdout) {
      child.stdout.on('data', data => {
        stdout += data
      })
    }

    if (child.stderr) {
      child.stderr.on('data', data => {
        stderr += data
      })
    }

    child.on('exit', code => {
      if (timedOut) {
        return
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve({ exitCode: code || 0, stdout, stderr })
    })

    child.on('error', error => {
      if (timedOut) {
        return
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(error)
    })
  })
}
