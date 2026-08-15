/**
 * @file Source-level unit tests for `hyperlink`, covering `src/links/create.ts`
 *   itself.
 *   Its sibling `create.test.mts` imports from `dist` on purpose, because the
 *   bug this feature kept hitting lived in the BUNDLE. That has a cost: dist is
 *   a different file, so `src/links/create.ts` scored zero coverage from it.
 *   This file closes that hole by mocking the bundled external, which is also
 *   what makes importing src possible at all — unmocked,
 *   `src/external/terminal-link` reaches the raw ESM packages and throws
 *   "hasFlag is not a function", since the stub swap only happens at bundle
 *   time.
 *   So the two files divide the work rather than duplicating it: this one pins
 *   `hyperlink`'s own logic, specifically how it translates the `fallback`
 *   option into terminal-link's callback protocol, and the dist file proves the
 *   bundle actually loads and emits.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const terminalLinkMock = vi.fn(
  (text: string, _url: string, _options?: unknown | undefined) => text,
)

// external-pack is the choke point: create.ts imports BOTH terminal-link and
// yoctocolors-cjs, and each re-exports from it, so mocking only terminal-link
// still pulled the raw ESM packages and threw. Mocking the pack covers both.
// The import() form requires a FULL module shape; these factories are
// deliberate partials and TS2769s.
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/external/external-pack', () => ({
  terminalLink: terminalLinkMock,
  yoctocolorsCjs: new Proxy({}, { get: () => (text: string) => text }),
}))

// The import() form requires a FULL module shape; these factories are
// deliberate partials and TS2769s.
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/external/terminal-link', () => ({
  default: terminalLinkMock,
}))

// The import() form requires a FULL module shape; these factories are
// deliberate partials and TS2769s.
// oxlint-disable-next-line socket/prefer-mock-import -- partial factory
vi.mock('../../../src/external/yoctocolors-cjs', () => ({
  default: new Proxy({}, { get: () => (text: string) => text }),
}))

const URL = 'https://socket.dev'

beforeEach(() => {
  terminalLinkMock.mockClear()
})

describe('links/create — hyperlink (source)', () => {
  it('delegates to terminal-link with the text and url unchanged', async () => {
    const { hyperlink } = await import('../../../src/links/create.mjs')
    hyperlink('Docs', URL)
    expect(terminalLinkMock).toHaveBeenCalledTimes(1)
    const [text, url] = terminalLinkMock.mock.calls[0]!
    expect(text).toBe('Docs')
    expect(url).toBe(URL)
  })

  it('leaves fallback undefined by default so terminal-link appends the url', async () => {
    // terminal-link's own default renders `text (url)`. Passing undefined keeps
    // it, which is what keeps a destination reachable on a plain terminal.
    const { hyperlink } = await import('../../../src/links/create.mjs')
    hyperlink('Docs', URL)
    const options = terminalLinkMock.mock.calls[0]![2] as {
      fallback?: unknown | undefined
    }
    expect(options.fallback).toBeUndefined()
  })

  it('passes an identity callback when fallback is disabled', async () => {
    // `fallback: false` has to become a FUNCTION returning its input, not the
    // boolean — terminal-link treats a falsy boolean as "use my default", so
    // passing `false` straight through would still append the url and silently
    // break a gate's copy-pasteable lane A.
    const { hyperlink } = await import('../../../src/links/create.mjs')
    hyperlink('Allow push to main', URL, { fallback: false })
    const options = terminalLinkMock.mock.calls[0]![2] as {
      fallback?: ((text: string, url: string) => string) | undefined
    }
    expect(typeof options.fallback).toBe('function')
    expect(options.fallback!('Allow push to main', URL)).toBe(
      'Allow push to main',
    )
  })

  it('treats an explicit fallback: true the same as the default', async () => {
    const { hyperlink } = await import('../../../src/links/create.mjs')
    hyperlink('Docs', URL, { fallback: true })
    const options = terminalLinkMock.mock.calls[0]![2] as {
      fallback?: unknown | undefined
    }
    expect(options.fallback).toBeUndefined()
  })

  it('returns whatever terminal-link produced, untouched', async () => {
    terminalLinkMock.mockReturnValueOnce('WRAPPED')
    const { hyperlink } = await import('../../../src/links/create.mjs')
    expect(hyperlink('Docs', URL)).toBe('WRAPPED')
  })
})

describe('links/create — link and links (source)', () => {
  // These predate hyperlink and had no source test. They are reachable now
  // that external-pack is mockable, so cover them rather than leave the file
  // half-instrumented.

  it('colors the text and returns it', async () => {
    const { link } = await import('../../../src/links/create.mjs')
    expect(link('Docs', URL)).toBe('Docs')
  })

  it('appends the url when fallback is requested', async () => {
    const { link } = await import('../../../src/links/create.mjs')
    expect(link('Docs', URL, { fallback: true })).toBe(`Docs (${URL})`)
  })

  it('accepts a theme by name', async () => {
    // The string branch indexes THEMES directly, so an unknown name yields
    // undefined and throws on theme!.colors. This pins the lookup against a
    // real theme rather than assuming a "default" key exists — there is none.
    const { link } = await import('../../../src/links/create.mjs')
    expect(link('Docs', URL, { theme: 'socket' })).toBe('Docs')
  })

  it('falls back to cyan when the theme link color is an RGB array', async () => {
    // The ArrayIsArray branch: RGB is not implemented yet and routes to cyan.
    // Mocked colors are identity, so the assertion is that it returns rather
    // than throwing on a non-string color.
    const { link } = await import('../../../src/links/create.mjs')
    expect(
      link('Docs', URL, {
        theme: { colors: { link: [255, 0, 0] } },
      } as unknown as Parameters<typeof link>[2]),
    ).toBe('Docs')
  })

  it('maps an array of specs through link', async () => {
    const { links } = await import('../../../src/links/create.mjs')
    expect(
      links([
        ['Docs', URL],
        ['API', 'https://api.socket.dev'],
      ]),
    ).toEqual(['Docs', 'API'])
  })

  it('threads options through to every spec', async () => {
    const { links } = await import('../../../src/links/create.mjs')
    expect(links([['Docs', URL]], { fallback: true })).toEqual([
      `Docs (${URL})`,
    ])
  })
})
