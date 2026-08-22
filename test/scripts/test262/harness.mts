/**
 * @file Walk the pinned subset and compose each test into a runnable script.
 *   Two pieces of glue matter here. A test262 file is a SCRIPT, not a module,
 *   so it is passed to `node -e` and never imported. And the shim has to be
 *   installed before the test runs, which happens in a generated `--import`
 *   prelude: that keeps the shim real code rather than text pasted into the
 *   script, while the test itself still sees a plain global.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { parseTestMeta } from './parser.mts'

import type { FeatureConfig, TestCase } from './types.mts'

/**
 * Harness files every test262 test needs, in the order test262 loads them.
 */
export const DEFAULT_INCLUDES: readonly string[] = ['assert.js', 'sta.js']

/**
 * Host bindings test262 expects the runner to provide. Node has no `print`,
 * which is how an async test reports completion.
 */
export const HOST_SHIM =
  'var print = function (msg) { console.log(String(msg)) };'

/**
 * A test262 file that is a fixture rather than a test: `_FIXTURE` files are
 * loaded BY tests and fail on their own.
 */
export function isFixture(filename: string): boolean {
  return filename.includes('_FIXTURE')
}

/**
 * Every runnable test file beneath `dir`, recursively.
 */
export function collectTestFiles(dir: string): string[] {
  const out: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const entry = entries[i]!
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectTestFiles(full))
    } else if (entry.name.endsWith('.js') && !isFixture(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Load the test cases for one feature. `root` is the test262 checkout root.
 */
export function collectCases(root: string, feature: FeatureConfig): TestCase[] {
  const cases: TestCase[] = []
  for (let i = 0, { length } = feature.dirs; i < length; i += 1) {
    const dir = path.join(root, feature.dirs[i]!)
    let stat
    try {
      stat = statSync(dir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) {
      continue
    }
    const files = collectTestFiles(dir)
    for (let j = 0, count = files.length; j < count; j += 1) {
      const file = files[j]!
      const source = readFileSync(file, 'utf8')
      cases.push({
        id: path.relative(root, file).replaceAll(path.sep, '/'),
        meta: parseTestMeta(source),
        path: file,
        source,
      })
    }
  }
  return cases
}

/**
 * The prelude that installs one shim over its native built-in.
 *
 * The method is built with object-method shorthand under a COMPUTED key, which
 * buys three things test262 checks and a plain `function` declaration fails:
 * the name may be a reserved word (`Promise.try`), the shorthand has no
 * `[[Construct]]` so `new` on it throws, and `name` comes out right for free.
 * Only `length` needs setting, since a rest parameter reports 0.
 */
export function composePrelude(
  feature: FeatureConfig,
  distDir: string,
): string {
  const { install } = feature
  const modulePath = path
    .join(distDir, feature.module)
    .replaceAll(path.sep, '/')
  const call =
    install.receiverAs === 'argument'
      ? `shim(this, ...args)`
      : install.receiverAs === 'this'
        ? `shim.call(this, ...args)`
        : `shim(...args)`
  const property = JSON.stringify(install.property)
  return [
    `import { ${install.export} as shim } from ${JSON.stringify(modulePath)}`,
    `const property = ${property}`,
    `const method = { [property](...args) { return ${call} } }[property]`,
    `Object.defineProperty(method, 'length', { configurable: true, value: ${install.length} })`,
    `Object.defineProperty(${install.target}, property, {`,
    `  configurable: true, enumerable: false, value: method, writable: true,`,
    `})`,
    // Array.prototype additions are unscopable, and test262 checks it.
    install.target === 'Array.prototype'
      ? `Object.defineProperty(Array.prototype[Symbol.unscopables], property, { configurable: true, enumerable: true, value: true, writable: true })`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The full script for one test: harness files, then the test source. Strict
 * mode is prepended when the test asks for it.
 */
export function composeScript(root: string, testCase: TestCase): string {
  const parts: string[] = []
  if (testCase.meta.onlyStrict) {
    // Stays first: a "use strict" directive after any statement is inert.
    parts.push('"use strict";')
  }
  parts.push(HOST_SHIM)
  // An async test reports through `$DONE`, which doneprintHandle.js turns into
  // the printed marker the executor looks for.
  const includes = [
    ...DEFAULT_INCLUDES,
    ...(testCase.meta.async ? ['doneprintHandle.js'] : []),
    ...testCase.meta.includes,
  ]
  for (let i = 0, { length } = includes; i < length; i += 1) {
    parts.push(readFileSync(path.join(root, 'harness', includes[i]!), 'utf8'))
  }
  parts.push(testCase.source)
  return parts.join('\n')
}
