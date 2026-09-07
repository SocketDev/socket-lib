/**
 * @file Fix CommonJS exports for Node.js ESM compatibility. Transforms the
 *   bundler's minified exports to clear module.exports = { ... } format.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { parse } from '@babel/parser'
import MagicString from 'magic-string'

import { isQuiet } from '../flags/predicates.mts'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { isErrnoException } from '@socketsecurity/lib-stable/errors/predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'

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
        if (await processCommonJsFile(fullPath, verbose)) {
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

fixConstantExports().catch(error => {
  logger.error(`Build failed: ${error.message || error}`)
  process.exitCode = 1
})

async function processCommonJsFile(
  fullPath: string,
  verbose = false,
): Promise<boolean> {
  const content = await fs.readFile(fullPath, 'utf8')
  const s = new MagicString(content)
  let modified = false

  modified = rewriteCommonJsDefault(content, s)

  // SIMPLIFIED APPROACH: External packages use standard CommonJS exports.
  // rolldown bundles them with `minify: false` producing clean `module.exports` patterns.
  // All external packages work directly: require('./external/packagename')
  // NO .default references needed - internal code uses them as-is.

  // Fix relative paths ONLY for files in the root dist directory
  const isRootFile = path.dirname(fullPath) === distDir
  if (
    isRootFile &&
    (content.includes('require("../') || content.includes("require('../"))
  ) {
    let pos = 0
    while ((pos = content.indexOf('require("../', pos)) !== -1) {
      s.overwrite(pos + 'require("'.length, pos + 'require("../'.length, './')
      pos += 1
      modified = true
    }
    pos = 0
    while ((pos = content.indexOf("require('../", pos)) !== -1) {
      s.overwrite(pos + "require('".length, pos + "require('../".length, './')
      pos += 1
      modified = true
    }
  }

  if (modified) {
    await fs.writeFile(fullPath, s.toString())
    if (verbose) {
      const relativePath = path.relative(distDir, fullPath)
      logger.log(`    Fixed ${relativePath}`)
    }
    return true
  }
  return false
}

function rewriteCommonJsDefault(content: string, s: MagicString): boolean {
  // Check if this is a single default export with __toCommonJS pattern
  if (
    content.includes('module.exports = __toCommonJS(') &&
    content.includes('default: () => ')
  ) {
    // Parse AST to find the export pattern and value identifier
    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: [],
      })

      let valueIdentifier: string | undefined
      let exportCallStart: number | undefined
      let exportCallEnd: number | undefined
      let toCommonJSStart: number | undefined
      let toCommonJSEnd: number | undefined

      // Find __export call with default export
      const walk = (value: unknown): void => {
        if (!isAstNode(value)) {
          return
        }
        const node = value

        inspectExportCall(node)
        inspectCommonJsAssignment(node)

        // Recursively walk. Entries rather than keys so the child is
        // read without indexing back into a node that declares no index
        // signature; `walk` narrows each one itself.
        const childEntries = Object.entries(node)
        for (let i = 0, { length } = childEntries; i < length; i += 1) {
          const { 0: key, 1: child } = childEntries[i]!
          if (key === 'end' || key === 'loc' || key === 'start') {
            continue
          }
          if (Array.isArray(child)) {
            for (const item of child) {
              walk(item)
            }
          } else {
            walk(child)
          }
        }
      }

      function inspectExportCall(node: AstNode): void {
        // Look for: __export(name, { default: () => value_identifier })
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === '__export' &&
          node.arguments?.length === 2 &&
          node.arguments[1]?.type === 'ObjectExpression'
        ) {
          const defaultProp = node.arguments[1]?.properties?.find(
            p =>
              p?.type === 'ObjectProperty' &&
              p.key?.name === 'default' &&
              p.value?.type === 'ArrowFunctionExpression',
          )
          if (defaultProp?.value?.body?.name) {
            valueIdentifier = defaultProp.value.body.name
            exportCallStart = node.start
            exportCallEnd = node.end
          }
        }
      }
      function inspectCommonJsAssignment(node: AstNode): void {
        // Look for: module.exports = __toCommonJS(name)
        if (
          node.type === 'AssignmentExpression' &&
          node.left?.type === 'MemberExpression' &&
          node.left.object?.name === 'module' &&
          node.left.property?.name === 'exports' &&
          node.right?.type === 'CallExpression' &&
          node.right.callee?.name === '__toCommonJS'
        ) {
          toCommonJSStart = node.start
          toCommonJSEnd = node.end
        }
      }

      walk(ast.program)

      // Each end offset is assigned in the same branch as its start, so
      // naming all four here is what types the offsets as numbers below.
      if (
        valueIdentifier &&
        exportCallStart !== undefined &&
        exportCallEnd !== undefined &&
        toCommonJSStart !== undefined &&
        toCommonJSEnd !== undefined
      ) {
        // Remove the __export call and surrounding statement
        // Find the semicolon and newline after the call
        const removeEnd = skipExportTerminators(content, exportCallEnd)
        s.remove(exportCallStart, removeEnd)

        // Replace the entire statement: module.exports = __toCommonJS(name);
        // Find and include the semicolon
        const statementEnd = findAssignmentStatementEnd(content, toCommonJSEnd)
        // Replace the entire statement with a comment
        s.overwrite(
          toCommonJSStart,
          statementEnd,
          '/* module.exports will be set at end of file */',
        )

        // Add module.exports at the end of the file
        s.append(`\nmodule.exports = ${valueIdentifier};\n`)

        return true
      }
    } catch {
      // If parsing fails, skip this optimization
    }
  }

  return false
}

function skipExportTerminators(content: string, offset: number): number {
  let removeEnd = offset
  while (
    removeEnd < content.length &&
    (content[removeEnd] === '\n' || content[removeEnd] === ';')
  ) {
    removeEnd++
  }
  return removeEnd
}

function findAssignmentStatementEnd(content: string, offset: number): number {
  let statementEnd = offset
  while (
    statementEnd < content.length &&
    (content[statementEnd] === '\n' ||
      content[statementEnd] === ' ' ||
      content[statementEnd] === ';')
  ) {
    if (content[statementEnd] === ';') {
      statementEnd++
      break
    }
    statementEnd++
  }
  return statementEnd
}
