/**
 * @file The child program the undefined-bindings check runs, plus the parser
 *   for what it prints back.
 *   Split out of `exports-have-no-undefined-bindings.mts` because it is a
 *   different artifact from the runner around it: a CJS string executed by a
 *   separate `node -e`, sharing no module scope with the code that builds it.
 */

/**
 * The child program. Requires one entry, then compares each eager re-export's
 * runtime value against the value on the module it was read from.
 *
 * Written as a CJS string because it must run with `node -e`, sharing nothing
 * with this process — a fresh require cache per subpath is the entire point.
 */
export function buildProbeSource(): string {
  return `
const { readFileSync, realpathSync } = require('node:fs')
const plan = JSON.parse(readFileSync(process.env['PROBE_PLAN'], 'utf8'))
const targets = JSON.parse(readFileSync(process.env['PROBE_TARGETS'], 'utf8'))
// require.cache is keyed by REALPATH. On macOS /var is a symlink to
// /private/var, so a plan built from the walked path misses every lookup and
// the probe reports a clean run it never performed. Canonicalize both sides.
const real = p => { try { return realpathSync(p) } catch { return p } }
const planFiles = Object.keys(plan)
const cache = require.cache

// One process walks MANY targets, emptying require.cache between each so every
// target still loads from nothing. The isolation this check needs is a fresh
// module-init order - the circular-init timing that leaves a binding undefined
// is exactly what it hunts - and an emptied CJS cache reproduces that, while a
// process per target cost ~26s of CPU for 663 targets.
function probe(target) {
  for (const key of Object.keys(cache)) { delete cache[key] }
  try {
    require(target)
  } catch (e) {
    return { error: String((e && e.message) || e), target }
  }
  const findings = []
  let observed = 0
  for (const file of planFiles) {
    const mod = cache[real(file)]
    if (!mod) { continue }
    observed += 1
    const exported = mod.exports
    if (!exported || typeof exported !== 'object') { continue }
    for (const entry of plan[file]) {
      const sourceMod = cache[real(entry.target)]
      if (!sourceMod) { continue }
      const sourceExported = sourceMod.exports
      if (!sourceExported || typeof sourceExported !== 'object') { continue }
      let here
      let there
      try { here = exported[entry.exported] } catch { continue }
      if (here !== undefined) { continue }
      try { there = sourceExported[entry.local] } catch { continue }
      if (there === undefined) { continue }
      findings.push({ binding: entry.exported, file, source: entry.target })
    }
  }
  return { findings, observed, target }
}

const lines = []
for (const target of targets) {
  lines.push(JSON.stringify(probe(target)))
}
process.stdout.write(lines.join('\\n'))
process.exit(0)
`
}

/**
 * Parse a probe's stdout. A child that printed nothing usable is reported as
 * an error rather than silently counted clean.
 */
export interface ProbeFinding {
  binding: string
  file: string
  source: string
}

export function parseProbeOutput(stdout: string): {
  error?: string | undefined
  findings: ProbeFinding[]
  observed: number
  target?: string | undefined
} {
  let parsed
  try {
    parsed = JSON.parse(stdout) as {
      error?: string | undefined
      findings?: ProbeFinding[] | undefined
      observed?: number | undefined
      target?: string | undefined
    }
  } catch {
    return {
      error: `probe printed unparseable output: ${stdout.slice(0, 200)}`,
      findings: [],
      observed: 0,
    }
  }
  if (parsed.error) {
    return {
      error: parsed.error,
      findings: [],
      observed: 0,
      target: parsed.target,
    }
  }
  return {
    findings: parsed.findings ?? [],
    observed: parsed.observed ?? 0,
    target: parsed.target,
  }
}
