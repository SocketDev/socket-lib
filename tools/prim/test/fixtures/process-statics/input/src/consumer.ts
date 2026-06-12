// `process.cwd()` is a method call → rewrites to the `processCwd` primordial
// from `../primordials/process`. `process.env` is a property read (no call), so
// the codemod never visits it and it stays as-is.
export function describeCwd(): string {
  const dir = process.cwd()
  const mode = process.env['NODE_ENV']
  return `${dir} (${mode})`
}
