/**
 * @file Themed hyperlink utilities for terminal output. Provides colored
 *   hyperlinks using theme configuration.
 */

import terminalLink from '../external/terminal-link.js'
import yoctocolorsCjs from '../external/yoctocolors-cjs.js'
import { ArrayIsArray } from '../primordials/array.mjs'
import { getTheme } from '../term/themes/context.mjs'
import { THEMES } from '../term/themes/themes.mjs'
import { resolveColor } from '../term/themes/resolve.mjs'

import type { ColorName } from '../term/colors/types.mjs'

import type { LinkOptions } from './types.mjs'

/**
 * Wrap `text` in an OSC 8 terminal hyperlink so it is CLICKABLE, falling back
 * to plain text where the terminal cannot render one.
 *
 * `link` colors, this one makes it clickable, and they compose in that order:
 * `hyperlink(link('Docs', url), url)`. Keeping them separate is deliberate —
 * color is a theme concern and clickability is a terminal-capability one, and a
 * caller often wants exactly one of them.
 *
 * Capability detection is delegated to `terminal-link`, which reads VTE and
 * iTerm versions, `TERM_PROGRAM_VERSION`, CI providers, and Windows build
 * numbers. A hand-rolled `TERM_PROGRAM` allowlist looks equivalent and is not:
 * it silently drops every capable terminal it forgot, and the failure is
 * invisible, because an undetected terminal renders a non-clickable string
 * that looks fine.
 *
 * @param text - Text to display.
 * @param url - URL the text points at.
 * @param options - `fallback: false` renders bare text on an unsupported
 *   terminal; the default appends the URL so it stays reachable.
 *
 * @returns `text` as a clickable hyperlink, or a plain-text fallback
 */
export function hyperlink(
  text: string,
  url: string,
  options?: { fallback?: boolean | undefined } | undefined,
): string {
  const opts = { __proto__: null, fallback: true, ...options } as {
    fallback: boolean
  }
  return terminalLink(text, url, {
    fallback: opts.fallback ? undefined : (linkText: string) => linkText,
  })
}

/**
 * Create a themed hyperlink for terminal output. The link text is colored using
 * the theme's link color.
 *
 * Note: this colors the text only. For a CLICKABLE link use `hyperlink` above,
 * which composes with this one: `hyperlink(link('Docs', url), url)`.
 *
 * @example
 *   ;```ts
 *   import { link } from '@socketsecurity/lib/links/create'
 *
 *   console.log(link('Documentation', 'https://socket.dev'))
 *
 *   console.log(link('API Docs', 'https://api.socket.dev', { theme: 'coana' }))
 *
 *   // "GitHub (https://github.com)"
 *   console.log(link('GitHub', 'https://github.com', { fallback: true }))
 *   ```
 *
 * @param text - Link text to display.
 * @param url - URL, which is included in fallback mode.
 * @param options - Link configuration options.
 *
 * @returns Colored link text
 */
export function link(
  text: string,
  url: string,
  options?: LinkOptions | undefined,
): string {
  const opts = { __proto__: null, fallback: false, ...options } as LinkOptions

  // Resolve theme
  const theme =
    typeof opts.theme === 'string'
      ? THEMES[opts.theme]
      : (opts.theme ?? getTheme())

  // Resolve link color
  const linkColor = resolveColor(theme!.colors.link, theme!.colors)

  // Apply color - for now just use cyan as a simple fallback
  // Note: RGB color support to be added in yoctocolors wrapper
  const colors = yoctocolorsCjs
  let colored: string
  if (typeof linkColor === 'string' && linkColor !== 'inherit') {
    // Use named color method if available
    const colorMethod = colors[linkColor as ColorName]
    colored = colorMethod ? colorMethod(text) : colors.cyan(text)
  } else if (ArrayIsArray(linkColor)) {
    // RGB color - for now fallback to cyan
    // Note: RGB color support to be implemented
    colored = colors.cyan(text)
  } else {
    colored = colors.cyan(text)
  }

  // Return with or without URL fallback
  return opts.fallback ? `${colored} (${url})` : colored
}

/**
 * Create multiple themed links from an array of link specifications.
 *
 * @example
 *   ;```ts
 *   import { links } from '@socketsecurity/lib/links/create'
 *
 *   const formatted = links([
 *     ['Documentation', 'https://socket.dev'],
 *     ['API Reference', 'https://api.socket.dev'],
 *     ['GitHub', 'https://github.com/SocketDev'],
 *   ])
 *
 *   formatted.forEach(link => console.log(link))
 *   ```
 *
 * @param linkSpecs - Array of [text, url] pairs.
 * @param options - Link configuration options.
 *
 * @returns Array of colored link texts
 */
export function links(
  linkSpecs: Array<[text: string, url: string]>,
  options?: LinkOptions | undefined,
): string[] {
  return linkSpecs.map(([text, url]) => link(text, url, options))
}
