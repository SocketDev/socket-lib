import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  processDirectory,
  rewriteCommonJsExports,
} from '../../../../scripts/repo/build/post/rewrite-cjs-exports.mts'
import { runWithTempDir } from '../../util/temp-files.mjs'

const bundle =
  'var result_exports = {};\n__export(result_exports, { default: () => answer });\nmodule.exports = __toCommonJS(result_exports);\nvar answer = { value: 42 };\n'
const rewritten =
  'var result_exports = {};\n/* module.exports will be set at end of file */\nvar answer = { value: 42 };\n\nmodule.exports = answer;\n'

describe('processDirectory', () => {
  it('rewrites nested CommonJS default exports and preserves executable output', async () => {
    await runWithTempDir(async directory => {
      const nested = path.join(directory, 'nested')
      await fs.mkdir(nested)
      const filename = path.join(nested, 'example.js')
      await fs.writeFile(filename, bundle)
      await fs.writeFile(path.join(directory, 'untouched.txt'), bundle)
      expect(await processDirectory(directory)).toBe(1)
      expect(await fs.readFile(filename, 'utf8')).toBe(rewritten)
      expect(createRequire(import.meta.url)(filename)).toEqual({ value: 42 })
      expect(
        await fs.readFile(path.join(directory, 'untouched.txt'), 'utf8'),
      ).toBe(bundle)
      expect(await processDirectory(directory)).toBe(0)
    }, 'rewrite-cjs-exports-')
  })

  it.each([
    'module.exports = __toCommonJS(result_exports); default: () => (',
    'module.exports = __toCommonJS(result_exports); __export(result_exports, { default: () => 42 });',
    'module.exports = answer; __export(result_exports, { default: () => answer });',
    'module.exports = __toCommonJS(result_exports); __export(result_exports, { named: () => answer });',
  ])('preserves incomplete or unrelated patterns: %s', async source => {
    await runWithTempDir(async directory => {
      const filename = path.join(directory, 'example.js')
      await fs.writeFile(filename, source)
      expect(await processDirectory(directory)).toBe(0)
      expect(await fs.readFile(filename, 'utf8')).toBe(source)
    }, 'rewrite-cjs-preserve-')
  })

  it('skips a missing directory', async () => {
    await runWithTempDir(async directory => {
      expect(await processDirectory(path.join(directory, 'missing'))).toBe(0)
    }, 'rewrite-cjs-missing-')
  })
})

describe('rewriteCommonJsExports', () => {
  it('rewrites both require quote styles only for root files', () => {
    const source = `const first = require('../first'); const second = require("../second");`
    expect(rewriteCommonJsExports(source)).toBe(source)
    expect(rewriteCommonJsExports(source, { rootFile: true })).toBe(
      `const first = require('./first'); const second = require("./second");`,
    )
  })

  it('preserves assignment separators before following statements', () => {
    const source = bundle.replace(
      '__toCommonJS(result_exports);',
      '__toCommonJS(result_exports) \n;',
    )
    expect(rewriteCommonJsExports(source)).toBe(rewritten)
  })

  it('preserves the last matching default export in traversal order', () => {
    const source = bundle.replace(
      'var answer',
      '__export(other_exports, { default: () => replacement });\nvar replacement = 7;\nvar answer',
    )
    const result = rewriteCommonJsExports(source)
    expect(result).toContain(
      '__export(result_exports, { default: () => answer });',
    )
    expect(result).not.toContain('__export(other_exports,')
    expect(result).toContain('module.exports = replacement;')
  })
})
