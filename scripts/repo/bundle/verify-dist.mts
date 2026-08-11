/**
 * @file Post-build dist integrity guard. After the parallel builders + the
 *   fsync barrier, syntax-check every emitted `dist/**\/*.js` so a corrupt or
 *   half-written file (the classic symptom: a parallel-write race leaves
 *   `dist/external/normalize-package-data.js` truncated, surfacing later as a
 *   cryptic `SyntaxError: Unexpected token '{'` at test time) FAILS THE BUILD
 *   loudly and locally instead of becoming an opaque downstream test failure.
 *   The check is a real parse: `new vm.Script(src)` for CJS / a
 *   `SourceTextModule`-free `--check`-equivalent via the V8 compile cache. We
 *   use `node --check <file>` per file, which parses without executing and
 *   catches truncation, encoding corruption, and partial writes. Cheap: parse
 *   only, no eval, no module graph.
 */

import { promises as fs } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { parse } from '@babel/parser'

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'

const logger = getDefaultLogger()

/**
 * Collect every `.js` file under `dir` (recursive).
 */
async function collectJsFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectJsFiles(full)))
    } else if (
      entry.isFile() &&
      (full.endsWith('.js') || full.endsWith('.cjs'))
    ) {
      out.push(full)
    }
  }
  return out
}

/**
 * Syntax-check one file with `node --check`: parse-only, no execution. Returns
 * the stderr on failure, or undefined on success.
 */
async function checkFile(file: string): Promise<string | undefined> {
  try {
    const result = await spawn(process.execPath, ['--check', file], {
      stdio: 'pipe',
      stdioString: true,
    })
    return result.code === 0
      ? undefined
      : String(result.stderr ?? 'parse failed')
  } catch (e) {
    return String((e as { stderr?: unknown | undefined })?.stderr ?? e)
  }
}

/**
 * The bare specifiers a shipped file may keep. Derived from package.json so
 * there is no second copy of the dependency set to drift: this package's own
 * name (self-referencing subpath imports) plus anything an installing consumer
 * is actually contracted to provide. `dependencies` is empty by design, so in
 * practice the set is the package name and the TypeScript peer.
 */
async function readAllowedBareSpecifiers(): Promise<string[]> {
  const pkgJson = JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  ) as {
    name: string
    dependencies?: Record<string, string> | undefined
    optionalDependencies?: Record<string, string> | undefined
    peerDependencies?: Record<string, string> | undefined
  }
  return [
    pkgJson.name,
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.optionalDependencies ?? {}),
    ...Object.keys(pkgJson.peerDependencies ?? {}),
  ]
}

/**
 * Collect the specifier of every `require('<literal>')` CALL in `src`.
 *
 * This parses rather than pattern-matches on purpose. The vendored bundles are
 * full of JSDoc examples like `* const mm = require('micromatch');`, and a
 * regex counts each one as a real dependency. `dist/external/pico-pack.js`
 * alone yields four such false positives. Only an AST tells a call apart from
 * a comment.
 */
function collectRequiredSpecifiers(src: string): Set<string> {
  const found = new Set<string>()
  const ast = parse(src, {
    allowReturnOutsideFunction: true,
    sourceType: 'unambiguous',
  })
  const seen = new Set<object>()
  const stack: unknown[] = [ast]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object' || seen.has(node)) {
      continue
    }
    seen.add(node)
    const candidate = node as {
      type?: string | undefined
      callee?:
        | { type?: string | undefined; name?: string | undefined }
        | undefined
      arguments?:
        | Array<{ type?: string | undefined; value?: unknown | undefined }>
        | undefined
    }
    if (
      candidate.type === 'CallExpression' &&
      candidate.callee?.type === 'Identifier' &&
      candidate.callee.name === 'require' &&
      candidate.arguments?.length === 1 &&
      candidate.arguments[0]!.type === 'StringLiteral'
    ) {
      found.add(String(candidate.arguments[0]!.value))
    }
    const childValues = Object.values(node)
    for (let i = 0, { length } = childValues; i < length; i += 1) {
      const value = childValues[i]
      if (Array.isArray(value)) {
        stack.push(...value)
      } else if (value && typeof value === 'object') {
        stack.push(value)
      }
    }
  }
  return found
}

/**
 * Whether `spec` resolves for a consumer without an undeclared install.
 */
function isResolvableSpecifier(spec: string, allowed: string[]): boolean {
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    return true
  }
  if (spec.startsWith('node:') || builtinModules.includes(spec)) {
    return true
  }
  return allowed.some(name => spec === name || spec.startsWith(`${name}/`))
}

/**
 * Find every shipped file that keeps a bare require this package does not
 * declare, which is a phantom dependency. It loads for whoever happens to have
 * the package hoisted nearby and throws MODULE_NOT_FOUND for everyone else, so
 * it has to fail the build that produced it rather than a consumer's test run.
 */
async function findPhantomRequires(
  files: string[],
): Promise<Array<{ file: string; specifiers: string[] }>> {
  const allowed = await readAllowedBareSpecifiers()
  const phantoms: Array<{ file: string; specifiers: string[] }> = []
  for (let i = 0, { length } = files; i < length; i += 1) {
    const file = files[i]!
    const src = await fs.readFile(file, 'utf8')
    // A parse failure is already reported by the syntax stage above.
    let specifiers: Set<string>
    try {
      specifiers = collectRequiredSpecifiers(src)
    } catch {
      continue
    }
    const bad = [...specifiers]
      .filter(spec => !isResolvableSpecifier(spec, allowed))
      .toSorted()
    if (bad.length) {
      phantoms.push({ file, specifiers: bad })
    }
  }
  return phantoms
}

/**
 * Verify dist integrity. Returns exit code (0 = all files parse).
 */
export async function verifyDist(distDir: string): Promise<number> {
  const files = await collectJsFiles(distDir)
  const failures: Array<{ file: string; error: string }> = []
  // Bounded concurrency: parse in chunks so a huge dist doesn't fork
  // thousands of `node --check` at once.
  const CONCURRENCY = 16
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async file => ({ file, error: await checkFile(file) })),
    )
    for (const { error, file } of results) {
      if (error !== undefined) {
        failures.push({ error, file })
      }
    }
  }
  if (failures.length > 0) {
    logger.error(
      `dist integrity check FAILED — ${failures.length} file(s) do not parse:`,
    )
    for (const { error, file } of failures) {
      const rel = path.relative(distDir, file)
      logger.error(`  ${rel}: ${error.split(/\r?\n/)[0]}`)
    }
    logger.error(
      'A corrupt/partial dist usually means a parallel-write race. ' +
        'Re-run the build; if it persists, the externals codemod or ' +
        'bundler is racing on this file.',
    )
    return 1
  }
  const phantoms = await findPhantomRequires(files)
  if (phantoms.length > 0) {
    logger.error(
      `dist phantom-dependency check FAILED - ${phantoms.length} file(s) keep an undeclared bare require:`,
    )
    for (const { file, specifiers } of phantoms) {
      const rel = path.relative(distDir, file)
      logger.error(`  ${rel}: ${specifiers.join(', ')}`)
    }
    logger.error(
      'This package declares no runtime dependencies, so a bare require ' +
        'that survives into dist resolves only when the consumer happens to ' +
        'have that package installed. Wanted: the specifier inlined into the ' +
        "bundle. Fix: drop it from the package's `external` list in " +
        'scripts/repo/build-externals/rolldown-config.mts so rolldown bundles it.',
    )
    return 1
  }
  return 0
}

// Allow running standalone: `node scripts/repo/bundle/verify-dist.mts [distDir]`.
if (process.argv[1]?.endsWith('verify-dist.mts')) {
  const distDir = path.resolve(process.argv[2] ?? 'dist')
  verifyDist(distDir).then(code => {
    if (code === 0) {
      logger.success('dist integrity OK')
    }
    process.exitCode = code
  })
}
