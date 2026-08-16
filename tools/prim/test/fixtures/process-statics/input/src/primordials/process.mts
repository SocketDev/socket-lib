// Minimal stub primordial. `prim mod` reads this to know `processCwd` exists
// (a lower-case `export function`, unlike the capitalized const primordials).
// The harness skips rewrites INSIDE this dir. Captured at load so it doesn't
// reference the `process` global by a member call the codemod would rewrite.
const SafeProcess = process
export function processCwd(): string {
  return SafeProcess.cwd()
}
