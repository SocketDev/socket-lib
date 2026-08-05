/**
 * @file Unit tests for `hyperlink` — wrapping text in an OSC 8 terminal
 *   hyperlink, degrading on terminals that cannot render one, and composing
 *   with `link`'s coloring.
 *   These drive the BUNDLED external, not the raw npm package, because the
 *   defect this feature kept hitting lived in the bundle rather than in the
 *   source: terminal-link and its deps are ESM-only, and bundled, `require`
 *   returned a namespace where a function was called. A test against the
 *   unbundled package would have passed the whole time.
 */

import { describe, expect, it, vi } from 'vitest'

// dist, NOT src: the stub swap that makes terminal-link loadable happens at
// BUNDLE time, so `src/external/*` still resolves to the raw ESM packages and
// throws "hasFlag is not a function". Importing dist tests the artifact that
// actually ships, which is where the defect lived.
import { hyperlink, link, links } from '../../../dist/links/create.js'

type LinksModule = {
  hyperlink: (
    text: string,
    url: string,
    options?: { fallback?: boolean | undefined } | undefined,
  ) => string
  link: (text: string, url: string) => string
}

const ESC = '\u001B'
const BEL = '\u0007'
const URL = 'https://socket.dev'

/**
 * `terminal-link` resolves support once at module load, so an env var set after
 * import cannot change it. Each case therefore runs in a fresh module registry
 * with the env already in place.
 */
async function withHyperlinkEnv<T>(
  value: string | undefined,
  fn: (mod: LinksModule) => T,
): Promise<T> {
  const previous = process.env['FORCE_HYPERLINK']
  if (value === undefined) {
    delete process.env['FORCE_HYPERLINK']
  } else {
    process.env['FORCE_HYPERLINK'] = value
  }
  vi.resetModules()
  try {
    return fn((await import('../../../dist/links/create.js')) as LinksModule)
  } finally {
    if (previous === undefined) {
      delete process.env['FORCE_HYPERLINK']
    } else {
      process.env['FORCE_HYPERLINK'] = previous
    }
    vi.resetModules()
  }
}

describe('links/create — hyperlink', () => {
  it('wraps text in an OSC 8 sequence on a supporting terminal', async () => {
    await withHyperlinkEnv('1', mod => {
      const out = mod.hyperlink('Docs', URL)
      expect(out).toBe(`${ESC}]8;;${URL}${BEL}Docs${ESC}]8;;${BEL}`)
    })
  })

  it('keeps the display text intact inside the sequence', async () => {
    // The escape carries the URL; the visible text must survive unchanged, or a
    // copy-pasteable phrase stops being copy-pasteable.
    await withHyperlinkEnv('1', mod => {
      expect(mod.hyperlink('Allow push to main', URL)).toContain(
        'Allow push to main',
      )
    })
  })

  it('composes with link so color and clickability stack', async () => {
    // The documented usage: hyperlink(link(text, url), url). The color codes
    // sit INSIDE the hyperlink wrapper, so neither feature eats the other.
    await withHyperlinkEnv('1', mod => {
      const out = mod.hyperlink(mod.link('Docs', URL), URL)
      expect(out.startsWith(`${ESC}]8;;${URL}${BEL}`)).toBe(true)
      expect(out.endsWith(`${ESC}]8;;${BEL}`)).toBe(true)
      expect(out).toContain('Docs')
    })
  })

  it('appends the URL when the terminal cannot render a link', async () => {
    // Default fallback keeps the destination reachable rather than dropping it.
    await withHyperlinkEnv('0', mod => {
      const out = mod.hyperlink('Docs', URL)
      expect(out).not.toContain(ESC)
      expect(out).toContain(URL)
    })
  })

  it('renders bare text when fallback is disabled', async () => {
    // What a gate's lane A needs: the phrase alone, with nothing appended, so
    // it stays verbatim-copyable on a terminal without hyperlink support.
    await withHyperlinkEnv('0', mod => {
      expect(
        mod.hyperlink('Allow push to main', URL, { fallback: false }),
      ).toBe('Allow push to main')
    })
  })

  it('is exported alongside link and links', () => {
    // Guards the barrel: the bundled external resolving to a namespace instead
    // of a callable is exactly how this module failed to load before the stubs.
    expect(typeof hyperlink).toBe('function')
    expect(typeof link).toBe('function')
    expect(typeof links).toBe('function')
  })
})
