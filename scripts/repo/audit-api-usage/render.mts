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

// A proportional bar of `width` cells split into segments. Each segment is
// [count, ansiColor, glyph] — a DISTINCT glyph per segment so the split reads in
// monochrome too (not only by color): adopted uses a full block, cascade a
// medium shade, unused a light shade. The last segment absorbs rounding so the
// bar always fills exactly `width` cells.
export function stackedBar(
  segments: ReadonlyArray<readonly [number, string, string]>,
  total: number,
  width: number,
): string {
  if (total <= 0) {
    return ANSI.dim + '·'.repeat(width) + ANSI.reset
  }
  let out = ''
  let used = 0
  for (let i = 0, { length } = segments; i < length; i += 1) {
    const [count, color, glyph] = segments[i]!
    const cells =
      i === length - 1 ? width - used : Math.round((count / total) * width)
    if (cells > 0) {
      out += color + glyph.repeat(cells) + ANSI.reset
      used += cells
    }
  }
  return out
}

// Per-segment glyphs (monochrome-readable): adopted █, cascade ▒, unused ░.
const GLYPH = { adopted: '█', cascade: '▒', unused: '░' } as const

export interface PassThroughReExport {
  repo: string
  file: string
  subpath: string
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
  bareRootRefs: number
  passThroughReExports: PassThroughReExport[]
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

  // Summary stacked bar: adopted █ green / cascade-only ▒ cyan / unused ░ red.
  const SUMMARY_WIDTH = 48
  logger.log(
    `  ${stackedBar(
      [
        [d.adopted.length, c.green, GLYPH.adopted],
        [d.cascadeOnly.length, c.cyan, GLYPH.cascade],
        [d.unused.length, c.red, GLYPH.unused],
      ],
      total,
      SUMMARY_WIDTH,
    )}`,
  )
  logger.log(
    `  ${c.green}${GLYPH.adopted} adopted${c.reset} ${c.bold}${d.adopted.length}${c.reset} (${pct(d.adopted.length)})   ` +
      `${c.cyan}${GLYPH.cascade} cascade-only${c.reset} ${c.bold}${d.cascadeOnly.length}${c.reset} (${pct(d.cascadeOnly.length)})   ` +
      `${c.red}${GLYPH.unused} unused${c.reset} ${c.bold}${d.unused.length}${c.reset} (${pct(d.unused.length)})`,
  )
  logger.log(
    `  ${c.dim}adopted = a member repo imports it · cascade-only = used only in the wheelhouse template/ (shipped fleet-wide) · unused = no reference${c.reset}`,
  )
  logger.log('')

  renderAreas(d)
  renderFanOut(d)
  renderCascadeOnly(d)
  renderPassThrough(d)

  // Blind spots: ONLY namespace + bare-root reference the package without
  // naming a subpath, so per-name analysis can't see through them. (Re-exports,
  // dynamic import(), and require() all name the subpath → counted as usage.)
  logger.log(
    `  ${c.bold}blind spots${c.reset} ${c.dim}(reference the package without naming a subpath)${c.reset}`,
  )
  logger.log(
    `    namespace imports ${d.namespaceRefs}   bare-root ${d.bareRootRefs}   only-via-blind-spot subpaths ${d.blindSubpaths.length}`,
  )
}

// Pass-through re-exports: a consumer forwards a lib subpath through its own
// surface (`export { x } from '@socketsecurity/lib/x'`). The subpath is used,
// but the hop adds nothing — downstream could import lib directly. Cleanup
// candidate to minimize. Grouped by repo.
function renderPassThrough(d: ReportData): void {
  const c = ANSI
  if (!d.passThroughReExports.length) {
    return
  }
  const byRepo = new Map<string, PassThroughReExport[]>()
  for (let i = 0, { length } = d.passThroughReExports; i < length; i += 1) {
    const p = d.passThroughReExports[i]!
    const list = byRepo.get(p.repo)
    if (list) {
      list.push(p)
    } else {
      byRepo.set(p.repo, [p])
    }
  }
  logger.log(
    `  ${c.yellow}${c.bold}pass-through re-exports${c.reset} ${c.dim}— a consumer forwards a lib subpath; downstream could import lib directly (minimize)${c.reset}`,
  )
  const repos = [...byRepo.entries()].toSorted(
    (a, b) => b[1].length - a[1].length,
  )
  for (let i = 0, { length } = repos; i < length; i += 1) {
    const [repo, list] = repos[i]!
    logger.log(
      `    ${c.yellow}${repo.replace(/^socket-/, '')}${c.reset} ${c.dim}(${list.length})${c.reset}`,
    )
    for (let j = 0, jlen = Math.min(list.length, 6); j < jlen; j += 1) {
      logger.log(
        `      ${list[j]!.file} ${c.dim}→${c.reset} ${list[j]!.subpath}`,
      )
    }
    if (list.length > 6) {
      logger.log(`      ${c.dim}… +${list.length - 6} more${c.reset}`)
    }
  }
  logger.log('')
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
        [a.adopted, c.green, GLYPH.adopted],
        [a.cascade, c.cyan, GLYPH.cascade],
        [a.unused, c.red, GLYPH.unused],
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
