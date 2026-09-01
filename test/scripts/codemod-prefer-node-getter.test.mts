/**
 * @file Tests for the prefer-node-getter codemod's pure rewrite.
 *   Two of these cases are regressions from the burn-down run that produced the
 *   script: a spread (`...process.env`) went un-rewritten and left an import
 *   nothing used, and a file that already imported the accessor got a second
 *   copy of the same import line.
 */

import { describe, expect, it } from 'vitest'

import {
  accessorSpecifier,
  rewriteSource,
} from '../../scripts/repo/codemod/prefer-node-getter.mts'

describe('accessorSpecifier', () => {
  it('resolves a relative specifier from the rewritten file', () => {
    expect(accessorSpecifier('src/state/db.mts', 'path')).toBe(
      '../node/path.mjs',
    )
  })

  it('reaches up out of a nested directory', () => {
    expect(accessorSpecifier('src/eco/npm/script.mts', 'process')).toBe(
      '../../node/process.mjs',
    )
  })
})

describe('rewriteSource', () => {
  it('swaps a default import for its accessor', () => {
    const out = rewriteSource(
      "import path from 'node:path'\n\nexport const x = path.join('a', 'b')\n",
      'src/state/db.mts',
    )
    expect(out).toContain("import { getNodePath } from '../node/path.mjs'")
    expect(out).toContain("getNodePath().join('a', 'b')")
    expect(out).not.toContain("from 'node:path'")
  })

  it('swaps a named import, keeping the imported name', () => {
    const out = rewriteSource(
      "import { existsSync } from 'node:fs'\n\nexport const x = existsSync('a')\n",
      'src/state/db.mts',
    )
    expect(out).toContain("import { getNodeFs } from '../node/fs.mjs'")
    expect(out).toContain("getNodeFs().existsSync('a')")
  })

  it('rewrites behind a spread', () => {
    const out = rewriteSource(
      "import process from 'node:process'\n\nexport const x = { ...process.env }\n",
      'src/state/db.mts',
    )
    expect(out).toContain('...getNodeProcess().env')
  })

  it('leaves a same-named member access alone', () => {
    const out = rewriteSource(
      "import path from 'node:path'\n\nexport const x = (o: { path: string }) => o.path + path.sep\n",
      'src/state/db.mts',
    )
    expect(out).toContain('o.path +')
    expect(out).toContain('getNodePath().sep')
  })

  it('does not add an accessor import the file already has', () => {
    const out = rewriteSource(
      "import { getNodeFs } from '../node/fs.mjs'\nimport { existsSync } from 'node:fs'\n\nexport const x = existsSync('a')\n",
      'src/state/db.mts',
    )
    expect(
      out.split("import { getNodeFs } from '../node/fs.mjs'").length - 1,
    ).toBe(1)
  })

  it('returns the source unchanged when no wrapped builtin is imported', () => {
    const source = "import { z } from './z.mjs'\n\nexport const x = z\n"
    expect(rewriteSource(source, 'src/state/db.mts')).toBe(source)
  })

  it('leaves a type-only import alone', () => {
    const source =
      "import type * as NodePath from 'node:path'\n\nexport type X = NodePath.PlatformPath\n"
    expect(rewriteSource(source, 'src/state/db.mts')).toBe(source)
  })
})
