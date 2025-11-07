/**
 * @fileoverview Filter coverage data to exclude dist/ files
 *
 * This script post-processes V8 coverage data to remove dist/ files,
 * ensuring coverage reports only show src/ TypeScript files.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const coveragePath = path.join(projectRoot, 'coverage/coverage-final.json')

if (!fs.existsSync(coveragePath)) {
  console.error('Coverage file not found:', coveragePath)
  process.exit(1)
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'))

// Filter out dist/ files
const filtered = {}
let distCount = 0
let srcCount = 0

for (const [file, data] of Object.entries(coverage)) {
  // Keep only src/ files, exclude dist/
  if (file.includes('/src/') && !file.includes('/dist/')) {
    filtered[file] = data
    srcCount++
  } else if (file.includes('/dist/')) {
    distCount++
  }
}

console.log(`Filtered ${distCount} dist/ files`)
console.log(`Kept ${srcCount} src/ files`)
console.log(`Total files: ${Object.keys(coverage).length}`)

fs.writeFileSync(coveragePath, JSON.stringify(filtered, null, 2))
console.log('Coverage data filtered successfully')
