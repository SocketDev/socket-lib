// Consumer with NO local primordials/ directory. The codemod should fall
// through to the package-name specifier (`@socketsecurity/lib/primordials`).
// Mirrors the downstream-of-lib path — every fleet repo other than
// socket-lib itself looks like this.
export function collect(items: readonly string[]): string[] {
  const arr: string[] = []
  for (const item of items) {
    arr.push(item)
  }
  return arr
}
