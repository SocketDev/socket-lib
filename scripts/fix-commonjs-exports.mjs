/**
 * @fileoverview Fix CommonJS exports for Node.js ESM compatibility.
 * Transforms esbuild's minified exports to clear module.exports = { ... } format.
 */

import { parse } from '@babel/parser'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import MagicString from 'magic-string'
import colors from 'yoctocolors-cjs'

import { isQuiet } from '#socketsecurity/lib/argv/flags'
import { getDefaultLogger } from '#socketsecurity/lib/logger'

const logger = getDefaultLogger()
const printCompletedHeader = title => console.log(colors.green(`✓ ${title}`))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

/**
 * Extract named exports from esbuild's minified pattern.
 * Pattern: V(X,{exportName:()=>identifier,...});module.exports=z(X);
 *
 * @param {string} code - The file content
 * @returns {{ exports: Array<{name: string, identifier: string}>, match: RegExpMatchArray } | null}
 */
function extractEsbuildExports(code) {
  // First verify the code is valid JavaScript
  try {
    parse(code, {
      sourceType: 'module',
      plugins: [],
    })
  } catch {
    // If parsing fails, skip this file
    return null
  }

  // Pattern: V(X,{exportName:()=>identifier,...});module.exports=z(X);
  // where V is the export setter, X is the exports object, z adds __esModule
  const pattern = /V\((\w+),\{([^}]+)\}\);module\.exports=z\(\1\);/
  const match = code.match(pattern)

  if (!match) {
    return null
  }

  const exportsStr = match[2]

  // Parse the exports string: "exportName:()=>identifier,..."
  const exports = []
  const exportRegex = /(\w+):\(\)=>(\w+)/g
  let exportMatch
  while ((exportMatch = exportRegex.exec(exportsStr)) !== null) {
    exports.push({ name: exportMatch[1], identifier: exportMatch[2] })
  }

  if (exports.length === 0) {
    return null
  }

  return { exports, match }
}

/**
 * Process files in a directory and fix CommonJS exports.
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

        // Transform esbuild's minified export pattern to clear CommonJS exports
        const exportsInfo = extractEsbuildExports(content)
        if (exportsInfo) {
          const { exports, match } = exportsInfo

          // Find the position of the match (this is early in the file, before definitions)
          const matchStart = match.index
          const matchEnd = matchStart + match[0].length

          // Remove the early export pattern
          s.remove(matchStart, matchEnd)

          // Find the stub at the end: 0&&(module.exports={...});
          // This is where we should place the actual exports
          const stubPattern = /0&&\(module\.exports=\{[^}]+\}\);/
          const stubMatch = content.match(stubPattern)

          // Build the clear CommonJS export
          const exportLines = exports
            .map(({ identifier, name }) => `  ${name}: ${identifier}`)
            .join(',\n')

          const replacement = `module.exports = {\n${exportLines}\n};`

          if (stubMatch && stubMatch.index !== undefined) {
            // Replace the stub with actual exports
            s.overwrite(
              stubMatch.index,
              stubMatch.index + stubMatch[0].length,
              replacement,
            )
          } else {
            // If no stub found, append at the end (before sourcemap comment)
            const sourcemapComment = '//# sourceMappingURL='
            const sourcemapIndex = content.lastIndexOf(sourcemapComment)
            if (sourcemapIndex !== -1) {
              s.appendLeft(sourcemapIndex, `\n${replacement}\n`)
            } else {
              s.append(`\n${replacement}\n`)
            }
          }

          modified = true
        }

        // Check if this is a single default export
        if (content.includes('exports.default =')) {
          // Transform exports.default = value to module.exports = value
          let pos = 0
          while ((pos = content.indexOf('exports.default = ', pos)) !== -1) {
            s.overwrite(
              pos,
              pos + 'exports.default = '.length,
              'module.exports = ',
            )
            pos += 1
            modified = true
          }

          // Remove the __esModule marker
          const esModuleMarker =
            'Object.defineProperty(exports, "__esModule", { value: true });'
          pos = content.indexOf(esModuleMarker)
          if (pos !== -1) {
            const endPos = pos + esModuleMarker.length
            // Check if there's a newline after
            if (content[endPos] === '\n') {
              s.remove(pos, endPos + 1)
            } else {
              s.remove(pos, endPos)
            }
            modified = true
          }
        }

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
            console.log(`    Fixed ${relativePath}`)
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
      printCompletedHeader(title)
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
