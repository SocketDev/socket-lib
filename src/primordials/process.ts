/**
 * @file Safe call-through accessors for the `process` global's methods and
 *   value reads. The `process` object reference is captured once at module load
 *   (immune to a later `globalThis.process = …` reassignment), but each method
 *   is CALLED at access time off that captured object — so `vi.spyOn(process,
 *   'cwd')`, which mutates the same captured object, still intercepts. Binding
 *   the method reference instead (`process.cwd.bind(process)`) would freeze it
 *   and break that test seam, so we deliberately keep the late call. Consumers
 *   read cwd / platform / env / argv through these instead of touching
 *   `process` directly; enforced Socket-wide by
 *   `socket/prefer-process-primordial`. This is the `process` leaf of the
 *   node-module primordials: where `node/fs` / `node/path` lazy-load a `node:`
 *   module behind a function, this captures the always-present `process` global
 *   and routes its hot reads through one tamper-resistant surface.
 */

// The `process` object captured at module load. A later
// `globalThis.process = evil` cannot redirect reads that go through this
// reference; a `vi.spyOn(process, 'cwd')` (mutating this same object) still
// takes effect because the method is looked up at call time below.
const SafeProcess: NodeJS.Process = process

/**
 * The CPU architecture token (`'x64'` / `'arm64'` / …).
 */
export function processArch(): string {
  return SafeProcess.arch
}

/**
 * The argv array (`[execPath, scriptPath, ...args]`).
 *
 * @example
 *   ;```typescript
 *   const entry = processArgv()[1]
 *   ```
 */
export function processArgv(): string[] {
  return SafeProcess.argv
}

/**
 * The current working directory. Call-through to the captured process's `cwd` —
 * late-bound so test spies still intercept.
 *
 * @example
 *   ;```typescript
 *   const dir = processCwd()
 *   ```
 */
export function processCwd(): string {
  return SafeProcess.cwd()
}

/**
 * Emit a process warning. Call-through so a test spy on `process.emitWarning`
 * still intercepts.
 */
export function processEmitWarning(
  ...args: Parameters<NodeJS.Process['emitWarning']>
): void {
  SafeProcess.emitWarning(...args)
}

/**
 * The process environment object. Returns the live `process.env` off the
 * captured process (call-through, so a test that swaps `process.env` is seen).
 *
 * @example
 *   ;```typescript
 *   const token = processEnv()['SOCKET_API_TOKEN']
 *   ```
 */
export function processEnv(): NodeJS.ProcessEnv {
  return SafeProcess.env
}

/**
 * The absolute path to the Node executable (`process.execPath`).
 */
export function processExecPath(): string {
  return SafeProcess.execPath
}

/**
 * Schedule a callback on the next tick. Call-through (late-bound).
 */
export function processNextTick(
  ...args: Parameters<NodeJS.Process['nextTick']>
): void {
  SafeProcess.nextTick(...args)
}

/**
 * The process id.
 */
export function processPid(): number {
  return SafeProcess.pid
}

/**
 * The OS platform token (`'darwin'` / `'linux'` / `'win32'` / …).
 *
 * @example
 *   ;```typescript
 *   if (processPlatform() === 'win32') { … }
 *   ```
 */
export function processPlatform(): NodeJS.Platform {
  return SafeProcess.platform
}

/**
 * The standard error stream. Returned off the captured process so a test that
 * spies on `process.stderr.write` still intercepts.
 */
export function processStderr(): NodeJS.WriteStream {
  return SafeProcess.stderr
}

/**
 * The standard output stream. Returned off the captured process so a test that
 * spies on `process.stdout.write` still intercepts.
 */
export function processStdout(): NodeJS.WriteStream {
  return SafeProcess.stdout
}

/**
 * The Node version string (`process.version`, e.g. `'v26.2.0'`).
 */
export function processVersion(): string {
  return SafeProcess.version
}
