/**
 * @fileoverview Default theme definitions for Socket libraries.
 * Provides pre-configured themes for Socket Security, Coana, Firewall, Python CLI, and special effects.
 */

import type { Theme } from './types'

/**
 * Socket Security theme (default).
 * Purple branding with shimmer effects.
 */
export const SOCKET_THEME: Theme = {
  name: 'socket',
  displayName: 'Socket Security',
  colors: {
    primary: [140, 82, 255],
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'blue',
    step: 'cyan',
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
    description: 'Official Socket Security theme with purple branding',
    version: '1.0.0',
  },
}

/**
 * Coana theme.
 * Blue branding for Coana analysis tools.
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
    description: 'Coana theme with blue branding',
    version: '1.0.0',
  },
}

/**
 * Socket Firewall theme.
 * Orange/red branding for security and firewall features.
 */
export const FIREWALL_THEME: Theme = {
  name: 'socket-firewall',
  displayName: 'Socket Firewall',
  colors: {
    primary: [255, 100, 50],
    secondary: [255, 150, 100],
    success: 'green',
    error: 'redBright',
    warning: 'yellow',
    info: 'blue',
    step: 'cyan',
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
    description: 'Socket Firewall theme with orange/red branding',
    version: '1.0.0',
  },
}

/**
 * Socket CLI Python theme.
 * Blue and yellow branding inspired by Python.
 */
export const PYTHON_THEME: Theme = {
  name: 'socket-cli-python',
  displayName: 'Socket Python',
  colors: {
    primary: [70, 130, 180],
    secondary: [255, 215, 0],
    success: 'green',
    error: 'red',
    warning: 'yellowBright',
    info: 'blueBright',
    step: 'cyan',
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
    description: 'Socket Python CLI theme with Python-inspired colors',
    version: '1.0.0',
  },
}

/**
 * Ultrathink theme.
 * Rainbow gradient effects for intensive operations.
 */
export const ULTRA_THEME: Theme = {
  name: 'ultra',
  displayName: 'Ultrathink',
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
    description: 'Rainbow gradient theme for intensive thinking operations',
    version: '1.0.0',
  },
}

/**
 * Theme registry mapping theme names to theme definitions.
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
 * Union type of all available theme names.
 */
export type ThemeName = keyof typeof THEMES
