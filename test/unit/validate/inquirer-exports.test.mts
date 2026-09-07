import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

const wrapperRoot = fileURLToPath(
  new URL('../../../src/external/@inquirer/', import.meta.url),
)

describe('inquirer wrapper exports', () => {
  it.each(['checkbox', 'search', 'select'])(
    'exposes %s Separator through native ESM and preserves CJS identity',
    async name => {
      await runWithTempDir(async directory => {
        const wrappers = path.join(directory, '@inquirer')
        await fs.mkdir(wrappers)
        const packageFile = path.join(directory, 'external-pack.js')
        await fs.writeFile(
          packageFile,
          `const prompt = function prompt() {}; const Separator = class Separator {}; module.exports = { ${name}: Object.freeze({ default: prompt, Separator }) };`,
        )
        const wrapperFile = path.join(wrappers, `${name}.js`)
        await fs.copyFile(path.join(wrapperRoot, `${name}.js`), wrapperFile)
        const require = createRequire(import.meta.url)
        const expected = require(packageFile)[name]
        expect(require(wrapperFile)).toBe(expected)
        const result = await spawn(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
        import assert from 'node:assert/strict'
        import { createRequire } from 'node:module'
        import { pathToFileURL } from 'node:url'
        const filename = process.argv[1]
        const cjs = createRequire(pathToFileURL(filename))(filename)
        const esm = await import(pathToFileURL(filename).href)
        assert.equal(typeof esm.Separator, 'function')
        assert.equal(esm.Separator, cjs.Separator)
        assert.equal(esm.default, cjs)
      `,
            wrapperFile,
          ],
          { stdio: 'pipe', throws: false },
        )
        expect(result.code, String(result.stderr)).toBe(0)
      }, 'inquirer-exports-')
    },
  )
})
