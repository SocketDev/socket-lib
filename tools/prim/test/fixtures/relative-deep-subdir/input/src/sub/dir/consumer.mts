// Consumer two directories deeper than primordials/. Tests that the
// leaf-specifier resolver computes the correct relative path
// (`../../primordials/array`, not `./primordials/array` or
// `@socketsecurity/lib/primordials`).
export function collect(items: readonly string[]): string[] {
  const arr: string[] = []
  for (const item of items) {
    arr.push(item)
  }
  return arr
}
