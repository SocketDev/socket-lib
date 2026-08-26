/**
 * @file Unit tests for prim's output formatters. `formatHuman` is what a
 *   developer actually reads after `prim audit`, so the tests assert the
 *   rendered text: which verb each finding kind earns, that the grouping is
 *   ordered by how often a primordial appears, that only the first three sites
 *   are listed, and that the singular/plural wording is right. `formatJson` is
 *   the machine half - the assertion is that it round-trips and stays indented,
 *   because consumers diff it.
 */

import { describe, expect, it } from 'vitest'

import { formatHuman, formatJson } from '../src/format.mts'

type Finding = {
  file: string
  kind: 'covered' | 'gap' | 'redeclaration'
  line: number
  pattern: string
  primordial: string
}

/**
 * Build `count` findings for one primordial. Each gets a distinct file + line
 * so the "first three sites" assertions can tell them apart.
 */
function findings(
  primordial: string,
  kind: Finding['kind'],
  count: number,
): Finding[] {
  const out: Finding[] = []
  for (let i = 0; i < count; i += 1) {
    out.push({
      file: `src/example-${i}.mts`,
      kind,
      line: i + 1,
      pattern: `${primordial.toLowerCase()}-site-${i}`,
      primordial,
    })
  }
  return out
}

describe('formatHuman with nothing to show', () => {
  it('calls a gaps run complete rather than empty', () => {
    expect(formatHuman([], { mode: 'gaps', targetName: 'example-pkg' })).toBe(
      'example-pkg: surface complete — no gaps.',
    )
  })

  it('explains why a coverage run found nothing', () => {
    // An empty coverage run has two very different causes, and the message
    // has to name both or the user assumes the tool broke.
    const text = formatHuman([], {
      mode: 'coverage',
      targetName: 'example-pkg',
    })
    expect(text.startsWith('example-pkg: no migration candidates found.')).toBe(
      true,
    )
    expect(text).toContain('already migrated')
  })

  it('falls back to a neutral line for an audit run', () => {
    expect(formatHuman([], { mode: 'audit', targetName: 'example-pkg' })).toBe(
      'example-pkg: nothing to report.',
    )
  })
})

describe('formatHuman header', () => {
  it('counts sites and distinct primordials separately', () => {
    const text = formatHuman(
      [
        ...findings('ArrayPrototypeMap', 'covered', 2),
        ...findings('StringPrototypeSlice', 'covered', 1),
      ],
      { mode: 'audit', targetName: 'example-pkg' },
    )
    expect(text.split(/\r?\n/)[0]).toBe(
      'example-pkg (audit): 3 site(s) → 2 distinct primordial(s)',
    )
  })
})

describe('formatHuman verbs per finding kind', () => {
  it('tells a covered site to be replaced, with its multiplier', () => {
    const text = formatHuman(findings('ArrayPrototypeMap', 'covered', 4), {
      mode: 'coverage',
      targetName: 'example-pkg',
    })
    expect(text).toContain('replace 4× with `ArrayPrototypeMap`')
  })

  it('tells a gap site to be added to the surface', () => {
    const text = formatHuman(findings('ArrayPrototypeToSorted', 'gap', 2), {
      mode: 'gaps',
      targetName: 'example-pkg',
    })
    expect(text).toContain(
      'add `ArrayPrototypeToSorted` to socket-lib/src/primordials.ts (2 call sites)',
    )
  })

  it('uses the singular for a lone gap call site', () => {
    const text = formatHuman(findings('ArrayPrototypeToSorted', 'gap', 1), {
      mode: 'gaps',
      targetName: 'example-pkg',
    })
    expect(text).toContain('(1 call site)')
    expect(text).not.toContain('call sites')
  })

  it('tells a redeclaration to import instead, plural', () => {
    const text = formatHuman(findings('ObjectKeys', 'redeclaration', 3), {
      mode: 'audit',
      targetName: 'example-pkg',
    })
    expect(text).toContain(
      'import `ObjectKeys` from `./primordials` (3 local redeclarations — drop the local alias)',
    )
  })

  it('uses the singular for a lone redeclaration', () => {
    const text = formatHuman(findings('ObjectKeys', 'redeclaration', 1), {
      mode: 'audit',
      targetName: 'example-pkg',
    })
    expect(text).toContain('(1 local redeclaration — drop the local alias)')
  })
})

describe('formatHuman grouping', () => {
  it('puts the most frequent primordial first', () => {
    // Frequency is the whole point of the grouping: the biggest win should
    // be the first thing on screen, whatever order the findings arrived in.
    const text = formatHuman(
      [
        ...findings('StringPrototypeSlice', 'covered', 1),
        ...findings('ArrayPrototypeMap', 'covered', 5),
        ...findings('ObjectKeys', 'covered', 3),
      ],
      { mode: 'audit', targetName: 'example-pkg' },
    )
    const order = ['ArrayPrototypeMap', 'ObjectKeys', 'StringPrototypeSlice']
    const positions = order.map(name => text.indexOf(`\`${name}\``))
    expect(positions).toEqual([...positions].toSorted((a, b) => a - b))
    expect(positions.every(p => p > 0)).toBe(true)
  })

  it('lists at most three sites and summarizes the rest', () => {
    const text = formatHuman(findings('ArrayPrototypeMap', 'covered', 7), {
      mode: 'audit',
      targetName: 'example-pkg',
    })
    const listed = text
      .split(/\r?\n/)
      .filter(line => line.startsWith('    src/example-'))
    expect(listed).toHaveLength(3)
    expect(text).toContain('… and 4 more')
  })

  it('omits the overflow line when exactly three sites exist', () => {
    const text = formatHuman(findings('ArrayPrototypeMap', 'covered', 3), {
      mode: 'audit',
      targetName: 'example-pkg',
    })
    expect(text).not.toContain('more')
  })

  it('renders each listed site as file:line then pattern', () => {
    const text = formatHuman(
      [
        {
          file: 'src/example.mts',
          kind: 'covered',
          line: 42,
          pattern: 'items.map(fn)',
          primordial: 'ArrayPrototypeMap',
        },
      ],
      { mode: 'audit', targetName: 'example-pkg' },
    )
    expect(text).toContain('    src/example.mts:42  items.map(fn)')
  })

  it('leaves no trailing blank line', () => {
    const text = formatHuman(findings('ArrayPrototypeMap', 'covered', 1), {
      mode: 'audit',
      targetName: 'example-pkg',
    })
    expect(text).toBe(text.trimEnd())
  })
})

describe('formatJson', () => {
  it('round-trips the payload', () => {
    const payload = { count: 2, findings: [{ file: 'src/example.mts' }] }
    expect(JSON.parse(formatJson(payload))).toEqual(payload)
  })

  it('indents two spaces so the output diffs cleanly', () => {
    expect(formatJson({ count: 1 })).toBe('{\n  "count": 1\n}')
  })
})
