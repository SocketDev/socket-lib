/**
 * @file Terminal visuals for the fleet API-usage audit (audit-api-usage.mts).
 *   Renders the 3-way adoption picture as colored unicode bars: a summary
 *   stacked bar (adopted / cascade-only / unused), one stacked bar per
 *   top-level area, a per-repo adoption heat grid for the most-imported
 *   subpaths, and the cascade-only + blind-spot caveats. Split out of the audit
 *   so the collector stays under the file-size cap.
 */

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

const logger = getDefaultLogger()

const ANSI = {
  bold: '[1m',
  cyan: '[36m',
  dim: '[2m',
  green: '[32m',
  red: '[31m',
  reset: '[0m',
  yellow: '[33m',
}

// A proportional unicode bar of `width` cells split into colored segments.
// `segments` is [count, ansiColor][]; the last segment absorbs rounding so the
// bar always fills exactly `width` cells.
export function stackedBar(
  segments: ReadonlyArray<readonly [number, string]>,
  total: number,
  width: number,
): string {
  if (total <= 0) {
    return ANSI.dim + '·'.repeat(width) + ANSI.reset
  }
  let out = ''
  let used = 0
  for (let i = 0, { length } = segments; i < length; i += 1) {
    const [count, color] = segments[i]!
    const cells =
      i === length - 1 ? width - used : Math.round((count / total) * width)
    if (cells > 0) {
      out += color + '█'.repeat(cells) + ANSI.reset
      used += cells
    }
  }
  return out
}

export interface ReportData {
  subpaths: string[]
  adopted: string[]
  cascadeOnly: string[]
  unused: string[]
  consumers: string[]
  reposBySubpath: Map<string, Set<string>>
  cascadeOnlySet: Set<string>
  blindSubpaths: string[]
  namespaceRefs: number
  reExportRefs: number
  bareRootRefs: number
}

export function renderReport(d: ReportData): void {
  const total = d.subpaths.length
  const pct = (n: number): string =>
    `${String(Math.round((n / total) * 100)).padStart(2)}%`
  const c = ANSI

  logger.log('')
  logger.log(
    `${c.bold}socket-lib API surface${c.reset} ${c.dim}— ${total} export subpaths across ${d.consumers.length} consumers${c.reset}`,
  )
  logger.log('')

  // Summary stacked bar: adopted (green) / cascade-only (cyan) / unused (red).
  const SUMMARY_WIDTH = 48
  logger.log(
    `  ${stackedBar(
      [
        [d.adopted.length, c.green],
        [d.cascadeOnly.length, c.cyan],
        [d.unused.length, c.red],
      ],
      total,
      SUMMARY_WIDTH,
    )}`,
  )
  logger.log(
    `  ${c.green}█${c.reset} adopted ${c.bold}${d.adopted.length}${c.reset} (${pct(d.adopted.length)})   ` +
      `${c.cyan}█${c.reset} cascade-only ${c.bold}${d.cascadeOnly.length}${c.reset} (${pct(d.cascadeOnly.length)})   ` +
      `${c.red}█${c.reset} unused ${c.bold}${d.unused.length}${c.reset} (${pct(d.unused.length)})`,
  )
  logger.log(
    `  ${c.dim}adopted = a member repo imports it · cascade-only = used only in the wheelhouse template/ (shipped fleet-wide) · unused = no reference${c.reset}`,
  )
  logger.log('')

  renderAreas(d)
  renderFanOut(d)
  renderCascadeOnly(d)

  // Blind spots + caveats.
  logger.log(
    `  ${c.bold}blind spots${c.reset} ${c.dim}(defeat per-name dead-code analysis)${c.reset}`,
  )
  logger.log(
    `    namespace imports ${d.namespaceRefs}   re-exports ${d.reExportRefs}   bare-root ${d.bareRootRefs}   only-via-blind-spot subpaths ${d.blindSubpaths.length}`,
  )
}

// Per-area breakdown: one stacked bar per top-level area, sorted by size.
function renderAreas(d: ReportData): void {
  const c = ANSI
  const areaTotals = new Map<
    string,
    { adopted: number; cascade: number; unused: number; total: number }
  >()
  const bump = (area: string, key: 'adopted' | 'cascade' | 'unused'): void => {
    const a = areaTotals.get(area) ?? {
      adopted: 0,
      cascade: 0,
      unused: 0,
      total: 0,
    }
    a[key] += 1
    a.total += 1
    areaTotals.set(area, a)
  }
  for (let i = 0, { length } = d.adopted; i < length; i += 1) {
    bump(d.adopted[i]!.split('/')[0]!, 'adopted')
  }
  for (let i = 0, { length } = d.cascadeOnly; i < length; i += 1) {
    bump(d.cascadeOnly[i]!.split('/')[0]!, 'cascade')
  }
  for (let i = 0, { length } = d.unused; i < length; i += 1) {
    bump(d.unused[i]!.split('/')[0]!, 'unused')
  }
  const areas = [...areaTotals.entries()].toSorted(
    (a, b) => b[1].total - a[1].total,
  )
  const areaNameWidth = Math.min(
    18,
    areas.reduce((m, [name]) => Math.max(m, name.length), 0),
  )
  const AREA_BAR = 20
  logger.log(
    `  ${c.bold}by area${c.reset} ${c.dim}(adopted/cascade/unused)${c.reset}`,
  )
  for (let i = 0, { length } = areas; i < length; i += 1) {
    const [name, a] = areas[i]!
    const bar = stackedBar(
      [
        [a.adopted, c.green],
        [a.cascade, c.cyan],
        [a.unused, c.red],
      ],
      a.total,
      AREA_BAR,
    )
    logger.log(
      `    ${name.padEnd(areaNameWidth)} ${bar} ${c.dim}${String(a.total).padStart(3)}${c.reset}` +
        ` ${c.green}${a.adopted}${c.reset}/${c.cyan}${a.cascade}${c.reset}/${c.red}${a.unused}${c.reset}`,
    )
  }
  logger.log('')
}

// Consumer fan-out: top adopted subpaths + which member repos import each, as a
// dot-grid heat strip (short repo labels, fixed column order).
function renderFanOut(d: ReportData): void {
  const c = ANSI
  const repoLabels = d.consumers
    .filter(r => r !== 'socket-wheelhouse')
    .toSorted()
  const shortRepo = (r: string): string => r.replace(/^socket-/, '')
  const topAdopted = d.adopted
    .toSorted(
      (a, b) =>
        (d.reposBySubpath.get(b)?.size ?? 0) -
        (d.reposBySubpath.get(a)?.size ?? 0),
    )
    .slice(0, 20)
  logger.log(
    `  ${c.bold}most-adopted subpaths${c.reset} ${c.dim}(● = repo imports it)${c.reset}`,
  )
  const subColWidth = topAdopted.reduce((m, s) => Math.max(m, s.length), 0)
  const header = repoLabels
    .map(r => shortRepo(r).slice(0, 3).padEnd(4))
    .join('')
  logger.log(`    ${' '.repeat(subColWidth + 2)}${c.dim}${header}${c.reset}`)
  for (let i = 0, { length } = topAdopted; i < length; i += 1) {
    const sub = topAdopted[i]!
    const repos = d.reposBySubpath.get(sub) ?? new Set<string>()
    const grid = repoLabels
      .map(r =>
        repos.has(r) ? `${c.green}●${c.reset}   ` : `${c.dim}·${c.reset}   `,
      )
      .join('')
    logger.log(
      `    ${sub.padEnd(subColWidth)} ${String(repos.size).padStart(2)} ${grid}`,
    )
  }
  logger.log('')
}

// Cascade-only: live fleet-wide but no member adopted them — NOT removable.
function renderCascadeOnly(d: ReportData): void {
  const c = ANSI
  if (!d.cascadeOnly.length) {
    return
  }
  logger.log(
    `  ${c.cyan}${c.bold}cascade-only${c.reset} ${c.dim}— shipped by the cascade, no member imports directly (do NOT remove)${c.reset}`,
  )
  const sample = d.cascadeOnly.slice(0, 12)
  logger.log(
    `    ${sample.join(', ')}${d.cascadeOnly.length > 12 ? ` … +${d.cascadeOnly.length - 12} more` : ''}`,
  )
  logger.log('')
}
