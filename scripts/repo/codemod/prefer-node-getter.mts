#!/usr/bin/env node
/*
 * @file Rewrite a module's direct `node:` builtin import to the matching
 *   `getNode*()` accessor, so it can come off the prefer-node-getter baseline.
 *
 *   Half of a two-step burn-down. This step swaps the import and points every
 *   use at `getNodeX().member`; `pnpm run fix` then runs
 *   `no-inline-lazy-node-getter`, which hoists `const x = getNodeX()` once per
 *   scope. Splitting it that way keeps the binding placement in the rule that
 *   already owns it, rather than teaching a second tool the same convention.
 *
 *   It rewrites to the ACCESSOR, never to a frozen `pathJoin`-style snapshot.
 *   Those are opt-in for hot paths and are not spy-able, so converting a module
 *   whose tests inject through `getNodeFs()` would silently break them.
 *
 *   Usage: node scripts/repo/codemod/prefer-node-getter.mts <file>… [--dry-run]
 *   Exit: 0 always; each file reports changed or unchanged.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { runMain } from '../../fleet/process/run-main.mts'
import { REPO_ROOT } from '../../fleet/paths.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'

const logger = getDefaultLogger()

/**
 * Builtin specifier to the accessor that wraps it, paired with the `src/node/`
 * module the accessor lives in. Mirrors BUILTIN_TO_GETTER in the lint rule; a
 * builtin absent here has no accessor and is left alone.
 */
export const BUILTIN_ACCESSORS: ReadonlyArray<
  readonly [builtin: string, getter: string, module: string]
> = Object.freeze([
  ['async_hooks', 'getNodeAsyncHooks', 'async-hooks'],
  ['child_process', 'getNodeChildProcess', 'child-process'],
  ['crypto', 'getNodeCrypto', 'crypto'],
  ['events', 'getNodeEvents', 'events'],
  ['fs/promises', 'getNodeFsPromises', 'fs-promises'],
  ['fs', 'getNodeFs', 'fs'],
  ['http', 'getNodeHttp', 'http'],
  ['https', 'getNodeHttps', 'https'],
  ['module', 'getNodeModule', 'module'],
  ['os', 'getNodeOs', 'os'],
  ['path', 'getNodePath', 'path'],
  ['process', 'getNodeProcess', 'process'],
  ['timers/promises', 'getNodeTimersPromises', 'timers-promises'],
  ['url', 'getNodeUrl', 'url'],
  ['util', 'getNodeUtil', 'util'],
] as const)

/**
 * Guards on what may precede a rewritable identifier.
 *
 * - Not a member access (`options.path`), since that names someone else's
 *   property. The naive `(?<![\w.$'"])` also blocks a SPREAD
 *   (`...process.env`), leaving it un-rewritten - a clean-looking run that then
 *   fails type-check on an import nothing uses.
 * - Not `typeof `, which in a type position accepts only a name. Rewriting
 *   `typeof process.emitWarning` to `typeof getNodeProcess().emitWarning` is a
 *   syntax error, and a type reference erases at build anyway.
 */
export const NOT_A_MEMBER_ACCESS = `(?<![\\w$'"])(?<!(?<![.][.])[.])(?<!typeof )`

/**
 * The import specifier for an accessor module, relative to the rewritten file.
 */
export function accessorSpecifier(
  filePath: string,
  moduleName: string,
): string {
  const from = path.dirname(path.resolve(REPO_ROOT, filePath))
  const to = path.resolve(REPO_ROOT, 'src', 'node', `${moduleName}.mjs`)
  const rel = path.relative(from, to).split(path.sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

// Match a complete string literal in source code — three alternatives joined by |:
//   '(?:[^'\\\n]|\\.)*'  single-quoted: any char except quote/backslash/newline, or an escape sequence
//   "(?:[^"\\\n]|\\.)*"  double-quoted: same rule for double-quote delimiters
//   `(?:[^`\\]|\\.)*`    template literal (no newline restriction): any char except backtick/backslash, or an escape
const STRING_LITERAL_RE =
  /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

/**
 * Replace every string literal with an opaque placeholder, and the inverse.
 *
 * A rewrite keyed on an identifier cannot tell code from the inside of a
 * string, and a bare builtin name is a common path segment: rewriting `fs` in
 * `'../../fs/promises/safe.mjs'` produced
 * `'../../getNodeFs().promises/safe.mjs'`, a module specifier pointing nowhere.
 * Masking first means the rewrite only ever sees code.
 */
export function maskStringLiterals(source: string): {
  literals: string[]
  masked: string
} {
  const literals: string[] = []
  const masked = source.replace(STRING_LITERAL_RE, literal => {
    literals.push(literal)
    return `\u0000S${literals.length - 1}\u0000`
  })
  return { literals, masked }
}

/**
 * Put masked string literals back.
 */
export function unmaskStringLiterals(
  masked: string,
  literals: readonly string[],
): string {
  return masked.replace(
    /\u0000S(\d+)\u0000/g,
    (_match: string, index: string) => literals[Number(index)] as string,
  )
}

/**
 * The source with every wrapped builtin import replaced by its accessor.
 *
 * Returns the input unchanged when the file imports no wrapped builtin, so a
 * caller can treat "same string" as "nothing to do".
 */
export function rewriteSource(source: string, filePath: string): string {
  let text = source
  const added: string[] = []
  for (const { 0: builtin, 1: getter, 2: moduleName } of BUILTIN_ACCESSORS) {
    const importRe = new RegExp(
      `^import\\s+(?!type\\b)(.+?)\\s+from\\s+'(?:node:)?${builtin.replace('/', '\\/')}'\\n`,
      'm',
    )
    const match = importRe.exec(text)
    if (!match) {
      continue
    }
    const clause = (match[1] ?? '').trim()
    // Drop the import BEFORE rewriting uses. Rewriting first would also edit
    // the specifier string in the import line itself.
    text = text.replace(importRe, '')
    // Rewrite identifiers over MASKED text, so a builtin's name appearing
    // inside a string (a path segment, a message) is never touched.
    const { literals, masked } = maskStringLiterals(text)
    text = masked
    if (clause.startsWith('{')) {
      const entries = clause
        .slice(1, -1)
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
      for (let i = 0, { length } = entries; i < length; i += 1) {
        const parts = (entries[i] as string).split(/\s+as\s+/)
        const imported = (parts[0] ?? '').trim()
        const local = (parts[parts.length - 1] ?? '').trim()
        const replacement = `${getter}().${imported}`
        text = text.replace(
          new RegExp(`${NOT_A_MEMBER_ACCESS}${local}\\b`, 'g'),
          () => replacement,
        )
      }
    } else {
      const namespace = clause.replace(/^\*\s+as\s+/, '').trim()
      text = text.replace(
        new RegExp(`${NOT_A_MEMBER_ACCESS}${namespace}\\.(\\w+)`, 'g'),
        (_match: string, member: string) => `${getter}().${member}`,
      )
    }
    text = unmaskStringLiterals(text, literals)
    const line = `import { ${getter} } from '${accessorSpecifier(filePath, moduleName)}'\n`
    // A file may already import the accessor for a builtin it uses both ways.
    if (!text.includes(line)) {
      added.push(line)
    }
  }
  if (!added.length) {
    return text === source ? source : text
  }
  const lines = text.split(/\r?\n/)
  let insertAt = 0
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i] as string
    if (line.startsWith('import ') || line.startsWith('} from ')) {
      insertAt = i + 1
    }
  }
  return `${lines.slice(0, insertAt).join('\n')}\n${added.join('')}${lines.slice(insertAt).join('\n')}`
}

function main(): void {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean' } },
  })
  if (!positionals.length) {
    logger.fail(
      'prefer-node-getter codemod: no file named.\n' +
        '  Where: the command line.\n' +
        '  Saw: no positional argument; wanted one or more source files.\n' +
        '  Fix: node scripts/repo/codemod/prefer-node-getter.mts src/state/db.mts',
    )
    process.exitCode = 1
    return
  }
  let changed = 0
  for (const file of positionals) {
    const source = readFileSync(path.resolve(REPO_ROOT, file), 'utf8')
    const next = rewriteSource(source, file)
    if (next === source) {
      logger.info(`unchanged ${file}`)
      continue
    }
    changed += 1
    if (values['dry-run'] !== true) {
      writeFileSync(path.resolve(REPO_ROOT, file), next)
    }
    logger.success(`rewrote ${file}`)
  }
  logger.info(
    `prefer-node-getter codemod: ${changed} file(s) rewritten. Run \`pnpm run fix\` to bind each accessor once per scope.`,
  )
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'rewrites direct node: builtin imports to their getNode* accessor, for the prefer-node-getter burn-down',
  help: `Usage: node scripts/repo/codemod/prefer-node-getter.mts <file>… [flags]

  file        a source file importing a wrapped node: builtin
  --dry-run   report what would change without writing`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
