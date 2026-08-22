/**
 * @file Test262 frontmatter parsing.
 *   Every test262 file opens with a `/*---` … `---*\/` YAML block. Only the
 *   fields the runner acts on are read, so this is a targeted reader rather
 *   than a YAML parser: `includes`, `flags`, and `negative.type`.
 */

import type { TestMeta } from './types.mts'

const FRONTMATTER_RE = /\/\*---(?<body>[\s\S]*?)---\*\//

/**
 * The frontmatter body of a test262 source, or undefined when absent.
 */
export function frontmatterOf(source: string): string | undefined {
  const match = FRONTMATTER_RE.exec(source)
  return match?.groups?.['body']
}

/**
 * The `includes` list from a frontmatter body. Handles both spellings test262
 * uses: an inline `[a.js, b.js]` and a `-` bulleted block.
 */
export function parseIncludes(body: string): string[] {
  const inline = /includes:\s*\[(?<list>[^\]]*)\]/.exec(body)
  if (inline) {
    const items = (inline.groups?.['list'] ?? '').split(',')
    const out: string[] = []
    for (let i = 0, { length } = items; i < length; i += 1) {
      const name = items[i]!.trim()
      if (name) {
        out.push(name)
      }
    }
    return out
  }
  const block = /includes:\s*\n(?<items>(?:\s*-\s*\S+\n?)+)/.exec(body)
  if (!block) {
    return []
  }
  const lines = (block.groups?.['items'] ?? '').split(/\r?\n/)
  const out: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const name = /^\s*-\s*(?<name>\S+)/.exec(lines[i]!)?.groups?.['name']
    if (name) {
      out.push(name)
    }
  }
  return out
}

/**
 * The `flags` list from a frontmatter body.
 */
export function parseFlags(body: string): string[] {
  const match = /flags:\s*\[(?<list>[^\]]*)\]/.exec(body)
  if (!match) {
    return []
  }
  const items = (match.groups?.['list'] ?? '').split(',')
  const out: string[] = []
  for (let i = 0, { length } = items; i < length; i += 1) {
    const flag = items[i]!.trim()
    if (flag) {
      out.push(flag)
    }
  }
  return out
}

/**
 * Parse a test262 source into the metadata the runner acts on. A file with no
 * frontmatter is treated as a plain non-negative script, which is what test262
 * does with its own fixture files.
 */
export function parseTestMeta(source: string): TestMeta {
  const body = frontmatterOf(source)
  if (body === undefined) {
    return {
      async: false,
      includes: [],
      module: false,
      negative: false,
      noStrict: false,
      onlyStrict: false,
    }
  }
  const flags = parseFlags(body)
  const negativeType = /negative:[\s\S]*?type:\s*(?<type>\S+)/.exec(body)
    ?.groups?.['type']
  return {
    async: flags.includes('async'),
    includes: parseIncludes(body),
    module: flags.includes('module'),
    negative: body.includes('negative:'),
    negativeType,
    noStrict: flags.includes('noStrict') || flags.includes('raw'),
    onlyStrict: flags.includes('onlyStrict'),
  }
}
