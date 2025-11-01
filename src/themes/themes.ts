/**
 * @fileoverview Elegant theme definitions for Socket libraries.
 * Sophisticated color palettes crafted for clarity and visual harmony.
 *
 * Philosophy: Every color choice serves a purpose. Bright variants ensure
 * terminal legibility without compromising sophistication. Minimal emoji use,
 * refined symbols with color—elegance in restraint.
 */

import type { Theme } from './types'

/**
 * Socket Security — The signature theme.
 * Refined violet with subtle shimmer, designed for focus and elegance.
 */
export const SOCKET_THEME: Theme = {
  name: 'socket',
  displayName: 'Socket Security',
  colors: {
    primary: [140, 82, 255],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  effects: {
    spinner: {
      color: 'primary',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'inherit',
      direction: 'ltr',
      speed: 0.33,
    },
  },
  meta: {
    description: 'Signature theme with refined violet and subtle shimmer',
    version: '1.0.0',
  },
}

/**
 * Coana — Analytical intelligence.
 * Crisp azure tones for precision and clarity in code analysis.
 */
export const COANA_THEME: Theme = {
  name: 'coana',
  displayName: 'Coana',
  colors: {
    primary: [100, 200, 255],
    secondary: [50, 150, 200],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  effects: {
    spinner: {
      color: 'primary',
      style: 'dots',
    },
  },
  meta: {
    description: 'Analytical theme with crisp azure for precision',
    version: '1.0.0',
  },
}

/**
 * Socket Firewall — Vigilant protection.
 * Warm ember tones balanced with cool accents for security with confidence.
 */
export const FIREWALL_THEME: Theme = {
  name: 'socket-firewall',
  displayName: 'Socket Firewall',
  colors: {
    primary: [255, 100, 50],
    secondary: [255, 150, 100],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'secondary',
    prompt: 'primary',
  },
  effects: {
    spinner: {
      color: 'primary',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'inherit',
      direction: 'ltr',
      speed: 0.5,
    },
  },
  meta: {
    description: 'Protective theme with warm ember and balanced contrast',
    version: '1.0.0',
  },
}

/**
 * Socket Python — Elegant simplicity.
 * Steel blue with golden accents, embodying Python's philosophy of clarity.
 */
export const PYTHON_THEME: Theme = {
  name: 'socket-cli-python',
  displayName: 'Socket Python',
  colors: {
    primary: [70, 130, 180],
    secondary: [255, 215, 0],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyanBright',
    text: 'white',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  effects: {
    spinner: {
      color: 'primary',
      style: 'dots',
    },
  },
  meta: {
    description: 'Python-inspired theme with steel blue and golden harmony',
    version: '1.0.0',
  },
}

/**
 * Ultra — Premium intensity.
 * Prismatic shimmer for deep analysis, where complexity meets elegance.
 */
export const ULTRA_THEME: Theme = {
  name: 'ultra',
  displayName: 'Ultra',
  colors: {
    primary: [140, 82, 255],
    success: 'greenBright',
    error: 'redBright',
    warning: 'yellowBright',
    info: 'cyanBright',
    step: 'magentaBright',
    text: 'whiteBright',
    textDim: 'gray',
    link: 'cyanBright',
    prompt: 'primary',
  },
  effects: {
    spinner: {
      color: 'inherit',
      style: 'socket',
    },
    shimmer: {
      enabled: true,
      color: 'rainbow',
      direction: 'bi',
      speed: 0.5,
    },
  },
  meta: {
    description: 'Premium theme with prismatic shimmer for deep analysis',
    version: '1.0.0',
  },
}

/**
 * Theme registry — Curated palette collection.
 */
export const THEMES = {
  __proto__: null,
  socket: SOCKET_THEME,
  coana: COANA_THEME,
  'socket-firewall': FIREWALL_THEME,
  'socket-cli-python': PYTHON_THEME,
  ultra: ULTRA_THEME,
} as const

/**
 * Available theme identifiers.
 */
export type ThemeName = keyof typeof THEMES
