/**
 * @fileoverview Output formatters for prim findings.
 */

/**
 * @param {Array<{ primordial: string; pattern: string; file: string; line: number; kind: 'covered'|'gap' }>} findings
 * @param {{ mode: 'coverage'|'gaps'|'audit'; targetName: string }} ctx
 * @returns {string}
 */
export function formatHuman(findings, ctx) {
  if (findings.length === 0) {
    if (ctx.mode === 'gaps') {
      return `${ctx.targetName}: surface complete — no gaps.`
    }
    if (ctx.mode === 'coverage') {
      return `${ctx.targetName}: no migration candidates found. (Either everything's already migrated, or the audited build doesn't exercise built-ins outside of vendored code.)`
    }
    return `${ctx.targetName}: nothing to report.`
  }

  // Group by primordial, sorted by frequency.
  const byPrimordial = new Map()
  for (const f of findings) {
    const arr = byPrimordial.get(f.primordial) ?? []
    arr.push(f)
    byPrimordial.set(f.primordial, arr)
  }
  const sorted = [...byPrimordial.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )

  const lines = []
  const header = `${ctx.targetName} (${ctx.mode}): ${findings.length} site(s) → ${sorted.length} distinct primordial(s)`
  lines.push(header, '')

  for (const [primordial, items] of sorted) {
    const sample = items[0]
    const verb =
      sample.kind === 'covered'
        ? `replace ${items.length}× with \`${primordial}\``
        : `add \`${primordial}\` to socket-lib/src/primordials.ts (${items.length} call site${items.length === 1 ? '' : 's'})`
    lines.push(verb)
    for (const item of items.slice(0, 3)) {
      lines.push(`    ${item.file}:${item.line}  ${item.pattern}`)
    }
    if (items.length > 3) {
      lines.push(`    … and ${items.length - 3} more`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

/**
 * @param {object} payload
 * @returns {string}
 */
export function formatJson(payload) {
  return JSON.stringify(payload, null, 2)
}
