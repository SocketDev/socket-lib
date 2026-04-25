/**
 * @fileoverview Walk a directory of bundled JavaScript and emit
 * findings: every site where a primordial would (or already does)
 * apply.
 *
 * Each finding records:
 *   - The primordial that maps to the call site (e.g. `ArrayPrototypeMap`).
 *   - Whether that primordial is currently exported from socket-lib
 *     (`covered`) or not yet (`gap`).
 *   - File / line / column / source pattern for human inspection.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { simple } from 'acorn-wasm'

import {
  TRACKED_GLOBALS,
  UNAMBIGUOUS_PROTOTYPE_METHODS,
  ctorPrimordialName,
  guessReceiverType,
  prototypePrimordialName,
  staticPrimordialName,
} from './globals.mts'

/**
 * @typedef {Object} Finding
 * @property {string} primordial    Name of the matching primordial.
 * @property {string} pattern       Source-level pattern, e.g. `Object.keys(...)`.
 * @property {string} file          Path relative to the target root.
 * @property {number} line
 * @property {number} column
 * @property {'covered'|'gap'} kind Whether the primordial exists today.
 */

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot
 * @param {string} opts.scanDir              Directory to walk (e.g. `dist`).
 * @param {Set<string>} opts.exported        Currently-exported primordials.
 * @param {string[]} [opts.skipDirs]         Directories to skip during walk.
 * @param {string[]} [opts.skipFiles]        Files to skip (basename match).
 * @returns {Finding[]}
 */
export function auditDirectory({
  targetRoot,
  scanDir,
  exported,
  skipDirs = ['external'],
  skipFiles = ['primordials.js', 'primordials.mjs', 'primordials.cjs'],
}) {
  const findings = []
  const seen = new Set()

  function record(file, loc, pattern, primordial) {
    const line = loc?.line ?? 0
    const column = (loc?.column ?? 0) + 1
    const dedupKey = `${file}:${line}:${column}:${primordial}`
    if (seen.has(dedupKey)) {
      return
    }
    seen.add(dedupKey)
    findings.push({
      primordial,
      pattern,
      file,
      line,
      column,
      kind: exported.has(primordial) ? 'covered' : 'gap',
    })
  }

  const visitors = {
    NewExpression(node) {
      if (
        node.callee?.type !== 'Identifier' ||
        !TRACKED_GLOBALS.has(node.callee.name)
      ) {
        return
      }
      record(
        node._relPath,
        node.loc?.start,
        `new ${node.callee.name}(...)`,
        ctorPrimordialName(node.callee.name),
      )
    },
    CallExpression(node) {
      if (node.callee?.type !== 'MemberExpression') {
        return
      }
      const { object, property } = node.callee
      if (!object || !property || property.type !== 'Identifier') {
        return
      }
      if (object.type === 'Identifier' && TRACKED_GLOBALS.has(object.name)) {
        record(
          node._relPath,
          node.loc?.start,
          `${object.name}.${property.name}(...)`,
          staticPrimordialName(object.name, property.name),
        )
        return
      }
      if (object.type === 'Identifier') {
        // Strongest signal: the method name itself maps to one type
        // unambiguously (e.g. `.toUpperCase()` → String only,
        // `.getTime()` → Date only).
        const methodType = UNAMBIGUOUS_PROTOTYPE_METHODS.get(property.name)
        if (methodType) {
          record(
            node._relPath,
            node.loc?.start,
            `${object.name}.${property.name}(...)  [method: ${methodType}]`,
            prototypePrimordialName(methodType, property.name),
          )
          return
        }
        // Weaker signal: guess the receiver's type from its name.
        const guess = guessReceiverType(object.name)
        if (!guess) {
          return
        }
        record(
          node._relPath,
          node.loc?.start,
          `${object.name}.${property.name}(...)  [guessed: ${guess}]`,
          prototypePrimordialName(guess, property.name),
        )
      }
    },
    MemberExpression(node) {
      if (
        node.computed ||
        node.object?.type !== 'Identifier' ||
        !TRACKED_GLOBALS.has(node.object.name) ||
        !node.property?.name
      ) {
        return
      }
      const propName = node.property.name
      if (propName[0] !== propName[0].toLowerCase()) {
        return
      }
      record(
        node._relPath,
        node.loc?.start,
        `${node.object.name}.${propName}`,
        staticPrimordialName(node.object.name, propName),
      )
    },
  }

  function auditFile(absPath, relPath) {
    const src = readFileSync(absPath, 'utf8')
    try {
      // Inject relPath onto every visited node by wrapping the visitors.
      // acorn-wasm's `simple` doesn't pass extra context, so we attach
      // it inside the file walker once.
      const wrapped = {}
      for (const [name, fn] of Object.entries(visitors)) {
        wrapped[name] = node => {
          node._relPath = relPath
          fn(node)
        }
      }
      simple(src, wrapped, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
      })
    } catch {
      // File didn't parse — skip silently. Lint/type pipelines catch
      // syntax errors elsewhere.
    }
  }

  function* walkDir(dir) {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.includes(entry) || skipFiles.includes(entry)) {
        continue
      }
      const abs = path.join(dir, entry)
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        yield* walkDir(abs)
      } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
        yield abs
      }
    }
  }

  for (const abs of walkDir(scanDir)) {
    const rel = path.relative(targetRoot, abs)
    auditFile(abs, rel)
  }

  return findings
}
