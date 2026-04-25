/**
 * @fileoverview Persist audit results across runs.
 *
 * The state file aggregates per-target findings as `{ primordial, count }`
 * pairs split into `coverage` (primordials that already exist and could
 * be migrated to) and `gaps` (primordials missing from the surface).
 *
 * Default location: `<cwd>/.prim-state.json`. Override with `--state`.
 *
 * Stable JSON shape so diff tools (or `prim state --diff`) can
 * compare two runs:
 *
 *   {
 *     "updated": "2026-04-22T19:33:00.000Z",
 *     "targets": {
 *       "socket-cli": {
 *         "coverage": [{ "primordial": "ObjectKeys", "count": 142 }, …],
 *         "gaps": [{ "primordial": "WeakRefPrototypeDeref", "count": 3 }, …]
 *       }
 *     }
 *   }
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} statePath
 * @returns {{ updated: string; targets: Record<string, { coverage: Array<{primordial:string;count:number}>; gaps: Array<{primordial:string;count:number}> }> }}
 */
export function loadState(statePath) {
  if (!existsSync(statePath)) {
    return { updated: '', targets: {} }
  }
  return JSON.parse(readFileSync(statePath, 'utf8'))
}

/**
 * @param {string} statePath
 * @param {object} state
 */
export function saveState(statePath, state) {
  state.updated = new Date().toISOString()
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}

/**
 * Roll up an array of findings into the `{ primordial, count }` shape
 * the state file uses.
 *
 * @param {Array<{ primordial: string; kind: 'covered'|'gap' }>} findings
 * @returns {{ coverage: Array<{primordial:string;count:number}>; gaps: Array<{primordial:string;count:number}> }}
 */
export function rollup(findings) {
  const tally = new Map()
  for (const f of findings) {
    const cur = tally.get(f.primordial)
    if (cur) {
      cur.count += 1
    } else {
      tally.set(f.primordial, { kind: f.kind, count: 1 })
    }
  }
  const coverage = []
  const gaps = []
  for (const [primordial, v] of tally) {
    const entry = { primordial, count: v.count }
    if (v.kind === 'covered') {
      coverage.push(entry)
    } else {
      gaps.push(entry)
    }
  }
  coverage.sort((a, b) => b.count - a.count)
  gaps.sort((a, b) => b.count - a.count)
  return { coverage, gaps }
}

/**
 * Default state-file path: `<cwd>/.prim-state.json`.
 */
export function defaultStatePath() {
  return path.join(process.cwd(), '.prim-state.json')
}
