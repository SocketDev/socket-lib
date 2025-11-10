/**
 * @fileoverview Fix CommonJS exports for Node.js ESM compatibility.
 * Transforms esbuild's minified exports to clear module.exports = { ... } format.
 */

import { parse } from '@babel/parser'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import MagicString from 'magic-string'

import { isQuiet } from '#socketsecurity/lib/argv/flags'
import { getDefaultLogger } from '#socketsecurity/lib/logger'

const logger = getDefaultLogger()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

/**
 * Process files in a directory and fix CommonJS exports.
 * Handles files with `export default` by transforming __toCommonJS patterns.
 *
 * @param {string} dir - Directory to process
 * @param {boolean} verbose - Show individual file fixes
 * @returns {Promise<number>} Number of files fixed
 */
async function processDirectory(dir, verbose = false) {
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

            let valueIdentifier = null
            let exportCallStart = null
            let exportCallEnd = null
            let toCommonJSStart = null
            let toCommonJSEnd = null

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
                if (key === 'start' || key === 'end' || key === 'loc') {
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
              exportCallStart !== null &&
              toCommonJSStart !== null
            ) {
              // Remove the __export call and surrounding statement
              // Find the semicolon and newline after the call
              let removeEnd = exportCallEnd
              while (
                removeEnd < content.length &&
                (content[removeEnd] === ';' || content[removeEnd] === '\n')
              ) {
                removeEnd++
              }
              s.remove(exportCallStart, removeEnd)

              // Replace the entire statement: module.exports = __toCommonJS(name);
              // Find and include the semicolon
              let statementEnd = toCommonJSEnd
              while (
                statementEnd < content.length &&
                (content[statementEnd] === ';' ||
                  content[statementEnd] === ' ' ||
                  content[statementEnd] === '\n')
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
        // esbuild bundles them with `minify: false` producing clean `module.exports` patterns.
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
  } catch (error) {
    // Skip directories that don't exist
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return fixedCount
}

async function fixConstantExports() {
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
  } catch (error) {
    logger.error(`Failed to fix CommonJS exports: ${error.message}`)
    process.exitCode = 1
  }
}

fixConstantExports().catch(error => {
  logger.error(`Build failed: ${error.message || error}`)
  process.exitCode = 1
})
