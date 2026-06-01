/**
 * @file Coverage-merge helpers split out of cover.mts (file-size cap). Pure
 *   data-merge over the two suites' coverage-final.json — no orchestration.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

const logger = getDefaultLogger()

export interface CoverageLocation {
  start: { line: number; column: number }
  end: { line: number; column: number }
}

export interface CoverageFileFinal {
  s?: Record<string, number> | undefined
  b?: Record<string, number[]> | undefined
  f?: Record<string, number> | undefined
  statementMap?: Record<string, CoverageLocation> | undefined
}

export interface AggregateCoverage {
  branches: string
  functions: string
  lines: string
  statements: string
}

/**
 * Merge coverage-final.json from both suites using max-hit-count strategy. A
 * statement/branch/function covered by either suite counts as covered. Returns
 * aggregate percentages for statements, branches, functions, lines.
 */
export async function mergeCoverageFinal(
  rootPath: string,
): Promise<AggregateCoverage | undefined> {
  const mainFinalPath = path.join(rootPath, 'coverage/coverage-final.json')
  const isolatedFinalPath = path.join(
    rootPath,
    'coverage-isolated/coverage-final.json',
  )

  let mainFinal: Record<string, CoverageFileFinal> = {}
  let isolatedFinal: Record<string, CoverageFileFinal> = {}
  try {
    mainFinal = JSON.parse(await fs.readFile(mainFinalPath, 'utf8')) as Record<
      string,
      CoverageFileFinal
    >
  } catch (e) {
    const err = e as NodeJS.ErrnoException | null
    if (err?.code !== 'ENOENT') {
      logger.warn(`Failed to read ${mainFinalPath}: ${err?.message}`)
    }
  }
  try {
    isolatedFinal = JSON.parse(
      await fs.readFile(isolatedFinalPath, 'utf8'),
    ) as Record<string, CoverageFileFinal>
  } catch (e) {
    const err = e as NodeJS.ErrnoException | null
    if (err?.code !== 'ENOENT') {
      logger.warn(`Failed to read ${isolatedFinalPath}: ${err?.message}`)
    }
  }

  if (!Object.keys(mainFinal).length && !Object.keys(isolatedFinal).length) {
    return undefined
  }

  const allFiles = [
    ...new Set([...Object.keys(mainFinal), ...Object.keys(isolatedFinal)]),
  ]
  let totalStatements = 0
  let coveredStatements = 0
  let totalBranches = 0
  let coveredBranches = 0
  let totalFunctions = 0
  let coveredFunctions = 0
  let totalLines = 0
  let coveredLines = 0

  for (let fi = 0, { length: flen } = allFiles; fi < flen; fi += 1) {
    const file = allFiles[fi]!
    const m = mainFinal[file]
    const iso = isolatedFinal[file]

    // Merge statement counts (max of both suites) — union of keys.
    const stmtMap = { ...m?.statementMap, ...iso?.statementMap }
    const allStmtKeys = [
      ...new Set([...Object.keys(m?.s ?? {}), ...Object.keys(iso?.s ?? {})]),
    ]
    const mergedS: Record<string, number> = {}
    for (let i = 0, { length } = allStmtKeys; i < length; i += 1) {
      const id = allStmtKeys[i]!
      mergedS[id] = Math.max(m?.s?.[id] ?? 0, iso?.s?.[id] ?? 0)
    }
    totalStatements += allStmtKeys.length
    coveredStatements += Object.values(mergedS).filter(c => c > 0).length

    // Merge branch counts — union of keys, element-wise max.
    const allBranchKeys = [
      ...new Set([...Object.keys(m?.b ?? {}), ...Object.keys(iso?.b ?? {})]),
    ]
    const mergedB: Record<string, number[]> = {}
    for (let i = 0, { length } = allBranchKeys; i < length; i += 1) {
      const id = allBranchKeys[i]!
      const mArr = m?.b?.[id] ?? []
      const iArr = iso?.b?.[id] ?? []
      const len = Math.max(mArr.length, iArr.length)
      mergedB[id] = Array.from({ length: len }, (_, j) =>
        Math.max(mArr[j] ?? 0, iArr[j] ?? 0),
      )
    }
    for (let i = 0, { length } = allBranchKeys; i < length; i += 1) {
      const id = allBranchKeys[i]!
      const arr = mergedB[id] || []
      totalBranches += arr.length
      coveredBranches += arr.filter(c => c > 0).length
    }

    // Merge function counts — union of keys.
    const allFnKeys = [
      ...new Set([...Object.keys(m?.f ?? {}), ...Object.keys(iso?.f ?? {})]),
    ]
    const mergedF: Record<string, number> = {}
    for (let i = 0, { length } = allFnKeys; i < length; i += 1) {
      const id = allFnKeys[i]!
      mergedF[id] = Math.max(m?.f?.[id] ?? 0, iso?.f?.[id] ?? 0)
    }
    totalFunctions += allFnKeys.length
    coveredFunctions += Object.values(mergedF).filter(c => c > 0).length

    // Lines: derive from merged statements (each statement maps to a line).
    const lineSet = new Set()
    const coveredLineSet = new Set()
    const stmtEntries = Object.entries(stmtMap)
    for (let i = 0, { length } = stmtEntries; i < length; i += 1) {
      const entry = stmtEntries[i]!
      const id = entry[0]
      const loc = entry[1]
      const line = loc.start.line
      lineSet.add(line)
      if ((mergedS[id] ?? 0) > 0) {
        coveredLineSet.add(line)
      }
    }
    totalLines += lineSet.size
    coveredLines += coveredLineSet.size
  }

  function pct(covered: number, total: number): string {
    return total > 0 ? ((covered / total) * 100).toFixed(2) : '0.00'
  }

  return {
    branches: pct(coveredBranches, totalBranches),
    functions: pct(coveredFunctions, totalFunctions),
    lines: pct(coveredLines, totalLines),
    statements: pct(coveredStatements, totalStatements),
  }
}
