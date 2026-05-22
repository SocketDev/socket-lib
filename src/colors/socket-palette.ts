/**
 * @file Socket terminal-color palette — mirrors the CSS design tokens defined
 *   in the fleet's `template/styles/tokens.css` (light / dark / synthwave
 *   themes). Each helper returns the input string wrapped in a 24-bit ANSI
 *   escape sequence so the rendered hex matches the brand exactly; no rounding
 *   to the legacy 8-color palette. Picocolors / yoctocolors only ship a fixed
 *   8-color ANSI set, which would collapse `#8c50ff` to a generic "magenta".
 *   This module sidesteps that by emitting `\x1b[38;2;R;G;Bm…\x1b[39m`
 *   directly. Zero runtime dependencies. Usage: import { getPalette } from
 *   '@socketsecurity/lib/colors/socket-palette' const palette =
 *   getPalette('dark') console.log(palette.success('Done')) // Or read raw hex
 *   values for callers building their own escape codes.
 *   console.log(palette.hex.socketPurple) // "#8c50ff" Pick a theme by passing
 *   `'light' | 'dark' | 'synthwave'`. Defaults to `'dark'` since terminals are
 *   dark-on-light far less often than the opposite.
 */

/**
 * Available palette themes — kept in sync with the CSS theme blocks in
 * template/styles/tokens.css.
 */
export type SocketPaletteTheme = 'dark' | 'light' | 'synthwave'

/**
 * Hex-color value for each named slot. Exposed so callers can build their own
 * ANSI escapes (e.g. for backgrounds, which this module doesn't wrap).
 */
export interface SocketPaletteHex {
  alert: string
  error: string
  info: string
  socketPink: string
  socketPurple: string
  success: string
  warning: string
}

/**
 * Color-application helpers. Each takes a string and returns it wrapped in the
 * matching 24-bit ANSI escape.
 */
export interface SocketPalette {
  alert: (s: string) => string
  error: (s: string) => string
  hex: SocketPaletteHex
  info: (s: string) => string
  socketPink: (s: string) => string
  socketPurple: (s: string) => string
  success: (s: string) => string
  warning: (s: string) => string
}

// Hex values cribbed from template/styles/tokens.css. Keep in sync —
// drift is what the contrast lint catches at the CSS layer; this is
// the terminal mirror, no automatic guard yet.
const HEX_BY_THEME: Record<SocketPaletteTheme, SocketPaletteHex> = {
  __proto__: null,
  // The dark theme is the default — bright values that pop on terminal
  // backgrounds (which are overwhelmingly dark).
  dark: {
    __proto__: null,
    alert: '#fb923c',
    error: '#f87171',
    info: '#60a5fa',
    socketPink: '#ff00aa',
    socketPurple: '#8c50ff',
    success: '#4ade80',
    warning: '#facc15',
  } as SocketPaletteHex,
  // Saturated, deep values for light terminals (rare but supported).
  light: {
    __proto__: null,
    alert: '#9a3412',
    error: '#b91c1c',
    info: '#1d4ed8',
    socketPink: '#ff00aa',
    socketPurple: '#8c50ff',
    success: '#15803d',
    warning: '#a16207',
  } as SocketPaletteHex,
  // Neon palette for celebratory / hero output.
  synthwave: {
    __proto__: null,
    alert: '#ffb86c',
    error: '#ff6b9d',
    info: '#8be9fd',
    socketPink: '#ff00aa',
    socketPurple: '#8c50ff',
    success: '#50fa7b',
    warning: '#f1fa8c',
  } as SocketPaletteHex,
} as Record<SocketPaletteTheme, SocketPaletteHex>

/**
 * Build an ANSI-wrapping function for a single hex color. Emits the 24-bit
 * sequence rather than rounding to the legacy 8-color palette so the rendered
 * output matches the CSS token byte-for-byte (modulo terminal gamut).
 * `\x1b[39m` resets fg to the terminal default — using `[0m` would also clear
 * bg / styles, which the caller may have set deliberately.
 */
/*@__NO_SIDE_EFFECTS__*/
export function colorizer(hex: string): (s: string) => string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const prefix = `\x1b[38;2;${r};${g};${b}m`
  const suffix = '\x1b[39m'
  return (s: string) => `${prefix}${s}${suffix}`
}

/**
 * Resolve a Socket palette for the requested theme. Defaults to `'dark'` — the
 * common case for terminal output.
 *
 * @example
 *   ;```typescript
 *   import { getPalette } from '@socketsecurity/lib/colors/socket-palette'
 *
 *   const palette = getPalette('dark')
 *   process.stdout.write(palette.success('Build complete\n'))
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPalette(theme: SocketPaletteTheme = 'dark'): SocketPalette {
  const hex = HEX_BY_THEME[theme]
  return {
    alert: colorizer(hex.alert),
    error: colorizer(hex.error),
    hex,
    info: colorizer(hex.info),
    socketPink: colorizer(hex.socketPink),
    socketPurple: colorizer(hex.socketPurple),
    success: colorizer(hex.success),
    warning: colorizer(hex.warning),
  }
}
