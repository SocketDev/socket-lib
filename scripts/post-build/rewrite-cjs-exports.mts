/**
 * @file Fix CommonJS exports for Node.js ESM compatibility. Transforms the
 *   bundler's minified exports to clear module.exports = { ... } format.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { parse } from '@babel/parser'
import MagicString from 'magic-string'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../fleet/paths.mts'

const logger = getDefaultLogger()

const distDir = path.join(REPO_ROOT, 'dist')

export async function fixConstantExports() {
  const verbose = process.argv.includes('--verbose')
  const quiet = isQuiet()

  try {
    const fixedCount = await processDirectory(distDir, verbose)

    if (!quiet) {
      const title =
        fixedCount > 0
          ? `CommonJS Exports (${fixedCount} file${fixedCount === 1 ? '' : 's'})`
          : 'CommonJS Exports (no changes)'
      logger.success(title)
    }
  } catch (e) {
    logger.error(`Failed to fix CommonJS exports: ${e.message}`)
    process.exitCode = 1
  }
}

/**
 * Process files in a directory and fix CommonJS exports. Handles files with
 * `export default` by transforming __toCommonJS patterns.
 */
export async function processDirectory(
  dir: string,
  verbose: boolean = false,
): Promise<number> {
  let fixedCount = 0

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        fixedCount += await processDirectory(fullPath, verbose)
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = await fs.readFile(fullPath, 'utf8')
        const s = new MagicString(content)
        let modified = false

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

            let valueIdentifier = undefined
            let exportCallStart = undefined
            let exportCallEnd = undefined
            let toCommonJSStart = undefined
            let toCommonJSEnd = undefined

            // Find __export call with default export
            const walk = node => {
              if (!node || typeof node !== 'object') {
                return
              }

              // Look for: __export(name, { default: () => value_identifier })
              if (
                node.type === 'CallExpression' &&
                node.callee?.type === 'Identifier' &&
                node.callee.name === '__export' &&
                node.arguments?.length === 2 &&
                node.arguments[1].type === 'ObjectExpression'
              ) {
                const defaultProp = node.arguments[1].properties?.find(
                  p =>
                    p.type === 'ObjectProperty' &&
                    p.key?.name === 'default' &&
                    p.value?.type === 'ArrowFunctionExpression',
                )
                if (defaultProp?.value.body?.name) {
                  valueIdentifier = defaultProp.value.body.name
                  exportCallStart = node.start
                  exportCallEnd = node.end
                }
              }

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

              // Recursively walk
              for (const key of Object.keys(node)) {
                if (key === 'end' || key === 'loc' || key === 'start') {
                  continue
                }
                const value = node[key]
                if (Array.isArray(value)) {
                  for (const item of value) {
                    walk(item)
                  }
                } else {
                  walk(value)
                }
              }
            }

            walk(ast.program)

            if (
              valueIdentifier &&
              exportCallStart !== undefined &&
              toCommonJSStart !== undefined
            ) {
              // Remove the __export call and surrounding statement
              // Find the semicolon and newline after the call
              let removeEnd = exportCallEnd
              while (
                removeEnd < content.length &&
                (content[removeEnd] === '\n' || content[removeEnd] === ';')
              ) {
                removeEnd++
              }
              s.remove(exportCallStart, removeEnd)

              // Replace the entire statement: module.exports = __toCommonJS(name);
              // Find and include the semicolon
              let statementEnd = toCommonJSEnd
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
              // Replace the entire statement with a comment
              s.overwrite(
                toCommonJSStart,
                statementEnd,
                '/* module.exports will be set at end of file */',
              )

              // Add module.exports at the end of the file
              s.append(`\nmodule.exports = ${valueIdentifier};\n`)

              modified = true
            }
          } catch {
            // If parsing fails, skip this optimization
          }
        }

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
            s.overwrite(
              pos + 'require("'.length,
              pos + 'require("../'.length,
              './',
            )
            pos += 1
            modified = true
          }
          pos = 0
          while ((pos = content.indexOf("require('../", pos)) !== -1) {
            s.overwrite(
              pos + "require('".length,
              pos + "require('../".length,
              './',
            )
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
          fixedCount += 1
        }
      }
    }
  } catch (e) {
    // Skip directories that don't exist
    if (e.code !== 'ENOENT') {
      throw e
    }
  }

  return fixedCount
}

fixConstantExports().catch(error => {
  logger.error(`Build failed: ${error.message || error}`)
  process.exitCode = 1
})
