/**
 * Type surface for the bundled `terminal-link` external.
 *
 * `fallback` is the escape hatch that matters: on a terminal with no hyperlink
 * support, terminal-link renders `text (url)` by default. Passing a function
 * replaces that rendering, and passing one that returns its own input yields
 * bare text.
 */
export interface TerminalLinkOptions {
  target?: 'stdout' | 'stderr' | undefined
  fallback?: ((text: string, url: string) => string) | boolean | undefined
}

export interface TerminalLink {
  (text: string, url: string, options?: TerminalLinkOptions | undefined): string
  isSupported: boolean
  stderr: {
    (
      text: string,
      url: string,
      options?: TerminalLinkOptions | undefined,
    ): string
    isSupported: boolean
  }
}

declare const terminalLink: TerminalLink
export default terminalLink
