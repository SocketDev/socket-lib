# Process Utilities

Spawn child processes, manage inter-process communication (IPC), handle process locks, and work with promises in a safe, cross-platform way.

## When to Use Process Utilities

- Running shell commands and capturing output
- Executing package manager commands (npm, pnpm, yarn)
- Building projects with external tools
- Managing concurrent operations with locks
- Preventing duplicate process execution

## Quick Start

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { ProcessLock } from '@socketsecurity/lib/process-lock'

// Run a command
const result = await spawn('git', ['status'])
console.log(result.stdout)

// Ensure only one instance runs
const lock = new ProcessLock('my-operation')
if (await lock.acquire()) {
  try {
    await doWork()
  } finally {
    await lock.release()
  }
}
```

## Spawning Processes

### spawn()

**What it does:** Spawns a child process and returns a promise that resolves when it completes.

**When to use:** Running commands, building projects, executing scripts, calling package managers.

**Security:** Uses array-based arguments which prevent command injection. Arguments are passed directly to the OS without shell interpretation, making it safe even with user input.

**Parameters:**

- `cmd` (string): Command to execute
- `args` (string[]): Array of arguments
- `options` (SpawnOptions): Process configuration
- `extra` (SpawnExtra): Extra metadata

**Returns:** Promise<SpawnResult> with exit code, stdout, stderr, and process info

**Example:**

```typescript
import { spawn } from '@socketsecurity/lib/spawn'

// Basic usage
const result = await spawn('git', ['status'])
console.log(result.stdout)

// With options
const result = await spawn('npm', ['install'], {
  cwd: '/path/to/project',
  env: { NODE_ENV: 'production' },
  stdio: 'pipe',
})

// Access stdin for interactive processes
const result = spawn('cat', [])
result.stdin?.write('Hello\n')
result.stdin?.end()
const { stdout } = await result
console.log(stdout) // 'Hello'

// Handle errors with exit codes
try {
  await spawn('exit', ['1'])
} catch (error) {
  if (isSpawnError(error)) {
    console.error(`Failed with code ${error.code}`)
    console.error(error.stderr)
  }
}

// Run with timeout
try {
  await spawn('sleep', ['10'], {
    timeout: 5000, // Kill after 5 seconds
  })
} catch (error) {
  console.error('Command timed out')
}
```

**Common Pitfalls:**

- Don't use string concatenation for arguments - use array form for security
- Non-zero exit codes throw an error by default
- Remember to pass `cwd` instead of using `process.chdir()` (never use `chdir`)
- Windows requires `shell: true` for `.cmd` and `.bat` files (automatically handled)

### spawnSync()

**What it does:** Synchronously spawns a child process and waits for it to complete.

**When to use:** When you need to block execution until the command finishes. Avoid in async code.

**Returns:** SpawnSyncReturns with exit code and captured output

**Example:**

```typescript
import { spawnSync } from '@socketsecurity/lib/spawn'

// Basic synchronous spawn
const result = spawnSync('git', ['status'])
console.log(result.stdout)
console.log(result.status) // exit code

// With options
const result = spawnSync('npm', ['install'], {
  cwd: '/path/to/project',
  stdioString: true,
})

if (result.status !== 0) {
  console.error(result.stderr)
}

// Get raw buffer output
const result = spawnSync('cat', ['binary-file'], {
  stdioString: false,
})
console.log(result.stdout) // Buffer
```

**Common Pitfalls:**

- Blocks the event loop - don't use for long-running commands
- No spinner animation during execution
- Timeout not supported (use `spawn()` with timeout instead)

### Spawn Options

#### cwd

Current working directory for the process.

```typescript
await spawn('npm', ['test'], {
  cwd: '/path/to/project',
})
```

**Important:** Always use `cwd` option instead of `process.chdir()`. The `chdir()` function is dangerous in Node.js as it affects the entire process and causes race conditions.

#### env

Environment variables for the process.

```typescript
await spawn('node', ['app.js'], {
  env: {
    NODE_ENV: 'production',
    API_KEY: 'secret123',
  },
})
```

**Note:** On Windows, process.env is a Proxy with case-insensitive access. The spawn utilities preserve this behavior.

#### stdio

Stdio configuration for stdin, stdout, stderr.

```typescript
// Pipe all stdio
await spawn('command', [], {
  stdio: 'pipe',
})

// Inherit stdout/stderr (show in terminal)
await spawn('npm', ['test'], {
  stdio: 'inherit',
})

// Ignore all stdio
await spawn('background-task', [], {
  stdio: 'ignore',
})

// Custom per-stream: [stdin, stdout, stderr]
await spawn('command', [], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

**Values:**

- `'pipe'` - Create pipe (default, captures output)
- `'inherit'` - Use parent's stream (shows in terminal)
- `'ignore'` - Ignore the stream

#### shell

Run command in shell.

```typescript
await spawn('npm', ['install'], {
  shell: true, // Required for .cmd/.bat on Windows
})
```

**Note:** Automatically enabled on Windows for `.cmd`, `.bat`, `.ps1` files. Still safe because arguments are array-based.

#### timeout

Maximum time before killing the process.

```typescript
await spawn('long-running-command', [], {
  timeout: 60000, // 60 seconds
})
```

#### stdioString

Convert stdio output to strings (default: true).

```typescript
// Get strings (default)
const result = await spawn('cat', ['file.txt'], {
  stdioString: true,
})
console.log(result.stdout) // string

// Get buffers
const result = await spawn('cat', ['binary-file'], {
  stdioString: false,
})
console.log(result.stdout) // Buffer
```

#### stripAnsi

Remove ANSI escape codes from output (default: true).

```typescript
await spawn('colored-command', [], {
  stripAnsi: true, // Remove color codes
})
```

#### spinner

Spinner instance to pause during execution.

```typescript
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner({ text: 'Working...' })
spinner.start()

await spawn('command', [], {
  spinner,
  stdio: 'inherit', // Spinner auto-pauses when output is shown
})

spinner.success('Complete')
```

### Security: Array-Based Arguments

The spawn functions use array-based arguments, which is the PRIMARY DEFENSE against command injection:

```typescript
// ✓ SAFE: Array-based arguments
await spawn('git', ['commit', '-m', userMessage])
// Each argument is properly escaped, even if userMessage = "foo; rm -rf /"

// ✗ UNSAFE: String concatenation (DON'T DO THIS)
await spawn(`git commit -m "${userMessage}"`, { shell: true })
// Vulnerable to injection if userMessage = '"; rm -rf / #'
```

**Why array-based is safe:**

- Node.js passes each argument directly to the OS
- Shell metacharacters (`;`, `|`, `&`, `$`, etc.) are treated as literal strings
- No shell interpretation even with `shell: true`
- Automatic escaping for all argument types

### Spawn Error Handling

#### isSpawnError()

**What it does:** Checks if a value is a spawn error.

**Example:**

```typescript
import { spawn, isSpawnError } from '@socketsecurity/lib/spawn'

try {
  await spawn('nonexistent-command')
} catch (error) {
  if (isSpawnError(error)) {
    console.error(`Command: ${error.cmd}`)
    console.error(`Exit code: ${error.code}`)
    console.error(`stderr: ${error.stderr}`)
  }
}
```

#### enhanceSpawnError()

**What it does:** Enhances spawn errors with better context and messages.

**Example:**

```typescript
import { enhanceSpawnError } from '@socketsecurity/lib/spawn'

try {
  await spawn('failing-command', ['--flag'])
} catch (error) {
  const enhanced = enhanceSpawnError(error)
  console.error(enhanced.message)
  // "Command failed: failing-command --flag (exit code 1)"
  // "Error details..."
}
```

## Process Locks

### ProcessLock

**What it does:** Ensures only one instance of an operation runs at a time.

**When to use:** Preventing duplicate builds, ensuring atomic operations, coordinating between processes.

**Example:**

```typescript
import { ProcessLock } from '@socketsecurity/lib/process-lock'

const lock = new ProcessLock('my-critical-operation')

if (await lock.acquire()) {
  try {
    // Do critical work that shouldn't run concurrently
    await buildProject()
  } finally {
    // Always release in finally block
    await lock.release()
  }
} else {
  console.log('Another process is running this operation')
}
```

### ProcessLock Methods

#### constructor(name, options?)

Creates a new process lock.

```typescript
const lock = new ProcessLock('build-process', {
  lockDir: '/tmp/locks', // Custom lock directory
  timeout: 30000, // Timeout in ms
})
```

#### acquire()

Attempts to acquire the lock.

```typescript
const acquired = await lock.acquire()
if (acquired) {
  // Lock acquired, do work
}
```

Returns `true` if lock was acquired, `false` if another process holds it.

#### release()

Releases the lock.

```typescript
await lock.release()
```

Always call this in a `finally` block to ensure cleanup.

#### isLocked()

Checks if the lock is currently held.

```typescript
if (await lock.isLocked()) {
  console.log('Lock is held by another process')
}
```

## Inter-Process Communication (IPC)

### setupIPC()

**What it does:** Sets up IPC channel for communication between parent and child processes.

**When to use:** Sending messages between processes, coordinating work, passing data.

**Example:**

```typescript
import { setupIPC } from '@socketsecurity/lib/ipc'

// In parent process
const child = spawn('node', ['worker.js'], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})

setupIPC(child.process, {
  onMessage: message => {
    console.log('Received from child:', message)
  },
})

// Send to child
child.process.send({ type: 'work', data: 'foo' })

// In child (worker.js)
setupIPC(process, {
  onMessage: message => {
    if (message.type === 'work') {
      const result = doWork(message.data)
      process.send({ type: 'result', value: result })
    }
  },
})
```

## Real-World Examples

### Running Package Manager Commands

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner({ text: 'Installing dependencies...' })
spinner.start()

try {
  await spawn('pnpm', ['install'], {
    cwd: projectPath,
    stdio: 'pipe',
    spinner,
  })
  spinner.successAndStop('Dependencies installed')
} catch (error) {
  spinner.failAndStop('Installation failed')
  throw error
}
```

### Build Process with Multiple Steps

```typescript
import { spawn } from '@socketsecurity/lib/spawn'
import { Spinner } from '@socketsecurity/lib/spinner'

const spinner = Spinner()

spinner.start('Compiling TypeScript...')
await spawn('tsc', [], { cwd: projectPath })
spinner.success('TypeScript compiled')

spinner.text('Building bundle...')
await spawn('esbuild', ['src/index.ts', '--bundle'], { cwd: projectPath })
spinner.success('Bundle created')

spinner.text('Running tests...')
await spawn('vitest', ['run'], { cwd: projectPath })
spinner.successAndStop('All steps complete')
```

### Atomic Operations with Locks

```typescript
import { ProcessLock } from '@socketsecurity/lib/process-lock'
import { spawn } from '@socketsecurity/lib/spawn'

async function atomicBuild() {
  const lock = new ProcessLock('project-build')

  if (!(await lock.acquire())) {
    console.log('Build already running in another process')
    return
  }

  try {
    console.log('Starting build...')
    await spawn('npm', ['run', 'build'], { cwd: projectPath })
    console.log('Build complete')
  } finally {
    await lock.release()
  }
}
```

### Git Operations

```typescript
import { spawn } from '@socketsecurity/lib/spawn'

// Get current branch
const result = await spawn('git', ['branch', '--show-current'], {
  cwd: repoPath,
})
const branch = result.stdout.trim()
console.log(`Current branch: ${branch}`)

// Check for uncommitted changes
try {
  await spawn('git', ['diff-index', '--quiet', 'HEAD'], {
    cwd: repoPath,
  })
  console.log('No uncommitted changes')
} catch (error) {
  console.log('Uncommitted changes detected')
}

// Get last commit
const result = await spawn('git', ['log', '-1', '--format=%H %s'], {
  cwd: repoPath,
})
console.log(`Last commit: ${result.stdout}`)
```

### Parallel Execution with Error Handling

```typescript
import { spawn } from '@socketsecurity/lib/spawn'

const tasks = [
  spawn('npm', ['run', 'test:unit']),
  spawn('npm', ['run', 'test:integration']),
  spawn('npm', ['run', 'lint']),
]

try {
  const results = await Promise.all(tasks)
  console.log('All tasks completed successfully')
} catch (error) {
  console.error('One or more tasks failed')
  throw error
}
```

## Troubleshooting

### Command not found

**Problem:** Spawn throws ENOENT error.

**Solution:**

- Verify the command exists in PATH (`which command` on Unix, `where command` on Windows)
- Use absolute paths if command isn't in PATH
- Check if command requires shell (`.cmd`, `.bat` files need `shell: true` on Windows)

### Permission denied

**Problem:** EACCES or EPERM error.

**Solution:**

- Check file permissions (`chmod +x script.sh` on Unix)
- Verify you have execute permissions
- On Unix, ensure script has proper shebang (`#!/usr/bin/env node`)

### Process hangs indefinitely

**Problem:** Spawn never resolves.

**Solution:**

- Add a `timeout` option
- Check if command is waiting for input (set `stdio: 'ignore'` for stdin)
- Ensure child process isn't keeping parent alive (`child.unref()`)

### Output encoding issues

**Problem:** Strange characters in stdout/stderr.

**Solution:**

- Ensure `stdioString: true` for text output
- Use `stripAnsi: true` to remove color codes
- For binary output, use `stdioString: false` to get Buffer

### Lock not releasing

**Problem:** ProcessLock stays locked after error.

**Solution:**
Always use try/finally:

```typescript
const lock = new ProcessLock('operation')
if (await lock.acquire()) {
  try {
    await doWork()
  } finally {
    await lock.release() // Always runs, even on error
  }
}
```

### Spawn fails on Windows

**Problem:** `.cmd` or `.bat` files don't execute.

**Solution:**
The library automatically enables `shell: true` on Windows for script files. If issues persist:

```typescript
await spawn('command.cmd', [], {
  shell: true, // Explicitly enable shell
})
```

### Environment variables not passed

**Problem:** Child process can't access expected env vars.

**Solution:**
Merge with process.env:

```typescript
await spawn('command', [], {
  env: {
    ...process.env, // Include parent env
    CUSTOM_VAR: 'value',
  },
})
```

### Working directory issues

**Problem:** Command can't find files in current directory.

**Solution:**
Always use `cwd` option:

```typescript
await spawn('npm', ['test'], {
  cwd: '/absolute/path/to/project',
})
```

Never use `process.chdir()` - it's dangerous and causes race conditions.
