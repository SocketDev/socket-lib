// Source that uses Array.prototype.push — should rewrite to use the
// per-leaf import from `../primordials/array`. The variable name `arr`
// helps the codemod's receiver-guessing heuristic recognize this as an
// array operation.
export function collect(items: readonly string[]): string[] {
  const arr: string[] = []
  for (const item of items) {
    arr.push(item)
  }
  return arr
}
