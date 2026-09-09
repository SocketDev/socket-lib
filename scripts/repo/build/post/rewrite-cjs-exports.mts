/**
 * @file Fix CommonJS exports for Node.js ESM compatibility. Transforms the
 *   bundler's minified exports to clear module.exports = { ... } format.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { parse } from '@babel/parser'
import MagicString from 'magic-string'

import { isQuiet } from '../../flags/predicates.mts'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { isErrnoException } from '@socketsecurity/lib-stable/errors/predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../../../fleet/process/is-main-module.mts'
import { runMain } from '../../../fleet/process/run-main.mts'

import { REPO_ROOT } from '../../../fleet/paths.mts'

import type { ScriptMeta } from '../../../fleet/process/run-main.mts'

const logger = getDefaultLogger()

/**
 * The bundler-output AST as this file reads it: structurally, by the handful of
 * fields the two patterns below test. A Babel discriminated union does not fit,
 * because the walker recurses over EVERY child key rather than switching on
 * node type, so each child is typed as another node of the same loose shape.
 */
export interface AstNode {
  arguments?: ReadonlyArray<AstNode | undefined> | undefined
  body?: AstNode | undefined
  callee?: AstNode | undefined
  end?: number | undefined
  key?: AstNode | undefined
  left?: AstNode | undefined
  name?: string | undefined
  object?: AstNode | undefined
  properties?: ReadonlyArray<AstNode | undefined> | undefined
  property?: AstNode | undefined
  right?: AstNode | undefined
  start?: number | undefined
  type?: string | undefined
  value?: AstNode | undefined
}

/**
 * Whether `value` is walkable. Anything non-object is a leaf.
 */
export function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null
}

const distDir = path.join(REPO_ROOT, 'dist')

export async function fixConstantExports() {
  const verbose = process.argv.includes('--verbose')
  const quiet = isQuiet()

  try {
    const fixedCount = await processDirectory(distDir, { verbose })

    if (!quiet) {
      const title =
        fixedCount > 0
          ? `CommonJS Exports (${fixedCount} file${fixedCount === 1 ? '' : 's'})`
          : 'CommonJS Exports (no changes)'
      logger.success(title)
    }
  } catch (e) {
    logger.error(`Failed to fix CommonJS exports: ${errorMessage(e)}`)
    process.exitCode = 1
  }
}

/**
 * Process files in a directory and fix CommonJS exports. Handles files with
 * `export default` by transforming __toCommonJS patterns.
 */
export async function processDirectory(
  dir: string,
  { verbose = false }: { verbose?: boolean | undefined } = {},
): Promise<number> {
  let fixedCount = 0

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        fixedCount += await processDirectory(fullPath, { verbose })
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = await fs.readFile(fullPath, 'utf8')
        const rewritten = rewriteCommonJsExports(content, {
          rootFile: path.dirname(fullPath) === distDir,
        })
        if (rewritten !== content) {
          await fs.writeFile(fullPath, rewritten)
          if (verbose) {
            const relativePath = path.relative(distDir, fullPath)
            logger.log(`    Fixed ${relativePath}`)
          }
          fixedCount += 1
        }
      }
    }
  } catch (e) {
    // Skip directories that don't exist
    if (!isErrnoException(e) || e.code !== 'ENOENT') {
      throw e
    }
  }

  return fixedCount
}

interface ExportCall {
  name: string
  node: AstNode
}

interface ExportPatterns {
  exportCall?: ExportCall | undefined
  assignment?: AstNode | undefined
}

function defaultExportCall(node: AstNode): ExportCall | undefined {
  if (
    node.type !== 'CallExpression' ||
    node.callee?.type !== 'Identifier' ||
    node.callee.name !== '__export' ||
    node.arguments?.length !== 2 ||
    node.arguments[1]?.type !== 'ObjectExpression'
  ) {
    return undefined
  }
  const property = node.arguments[1].properties?.find(
    candidate =>
      candidate?.type === 'ObjectProperty' &&
      candidate.key?.name === 'default' &&
      candidate.value?.type === 'ArrowFunctionExpression',
  )
  const name = property?.value?.body?.name
  if (!name) {
    return undefined
  }
  const result = { __proto__: null, name, node }
  return result
}

function findExportPatterns(value: unknown, patterns: ExportPatterns): void {
  if (!isAstNode(value)) {
    return
  }
  const exportCall = defaultExportCall(value)
  if (exportCall) {
    patterns.exportCall = exportCall
  }
  if (isCommonJsAssignment(value)) {
    patterns.assignment = value
  }
  const entries = Object.entries(value)
  for (let index = 0, { length } = entries; index < length; index += 1) {
    const { 0: key, 1: child } = entries[index]!
    if (key === 'end' || key === 'loc' || key === 'start') {
      continue
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        findExportPatterns(item, patterns)
      }
    } else {
      findExportPatterns(child, patterns)
    }
  }
}

function isCommonJsAssignment(node: AstNode): boolean {
  return (
    node.type === 'AssignmentExpression' &&
    node.left?.type === 'MemberExpression' &&
    node.left.object?.name === 'module' &&
    node.left.property?.name === 'exports' &&
    node.right?.type === 'CallExpression' &&
    node.right.callee?.name === '__toCommonJS'
  )
}

function rewriteDefaultExport(content: string, output: MagicString): boolean {
  if (
    !content.includes('module.exports = __toCommonJS(') ||
    !content.includes('default: () => ')
  ) {
    return false
  }
  try {
    const ast = parse(content, { sourceType: 'module', plugins: [] })
    const patterns: ExportPatterns = {}
    findExportPatterns(ast.program, patterns)
    const { exportCall, assignment } = patterns
    if (
      !exportCall ||
      exportCall.node.start === undefined ||
      exportCall.node.end === undefined ||
      assignment?.start === undefined ||
      assignment.end === undefined
    ) {
      return false
    }
    let removeEnd = exportCall.node.end
    while (
      removeEnd < content.length &&
      (content[removeEnd] === '\n' || content[removeEnd] === ';')
    ) {
      removeEnd += 1
    }
    output.remove(exportCall.node.start, removeEnd)
    output.overwrite(
      assignment.start,
      assignmentStatementEnd(content, assignment.end),
      '/* module.exports will be set at end of file */',
    )
    output.append(`\nmodule.exports = ${exportCall.name};\n`)
    return true
  } catch {
    return false
  }
}

function assignmentStatementEnd(content: string, start: number): number {
  let end = start
  while (
    end < content.length &&
    (content[end] === '\n' || content[end] === ' ' || content[end] === ';')
  ) {
    if (content[end] === ';') {
      return end + 1
    }
    end += 1
  }
  return end
}

function rewriteRootRequires(content: string, output: MagicString): boolean {
  let modified = false
  for (const quote of ['"', "'"]) {
    const prefix = `require(${quote}`
    const pattern = `${prefix}../`
    let position = 0
    while ((position = content.indexOf(pattern, position)) !== -1) {
      output.overwrite(
        position + prefix.length,
        position + pattern.length,
        './',
      )
      position += 1
      modified = true
    }
  }
  return modified
}

export function rewriteCommonJsExports(
  content: string,
  options: { rootFile?: boolean | undefined } = {},
): string {
  const settings = { __proto__: null, ...options }
  const output = new MagicString(content)
  let modified = rewriteDefaultExport(content, output)
  if (settings.rootFile && rewriteRootRequires(content, output)) {
    modified = true
  }
  return modified ? output.toString() : content
}

const SCRIPT_META: ScriptMeta = {
  describe:
    "rewrites the bundler's minified CommonJS exports in dist/ to a plain module.exports assignment",
  help: `Usage: node scripts/repo/build/post/rewrite-cjs-exports.mts [flags]

  --verbose             name every rewritten file
  --quiet, --silent     suppress non-error output`,
}

if (isMainModule(import.meta.url)) {
  runMain(fixConstantExports, SCRIPT_META)
}
