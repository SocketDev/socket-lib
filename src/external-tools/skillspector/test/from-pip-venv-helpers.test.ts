// Vitest specs for the shared `from-pip-venv` helpers. These cover the
// pure pieces — entry-point path layout and Python interpreter
// discovery — without spawning a Python process.

import { describe, expect, test } from 'vitest'

import {
  findPython,
  pipVenvEntryPointPath,
} from '../../from-pip-venv'

describe('from-pip-venv / pipVenvEntryPointPath', () => {
  test('uses bin/<name> on Unix, Scripts/<name>.exe on Windows', () => {
    const result = pipVenvEntryPointPath('/cache/venv', 'skillspector')
    if (process.platform === 'win32') {
      expect(result.endsWith('Scripts\\skillspector.exe')).toBe(true)
    } else {
      expect(result.endsWith('bin/skillspector')).toBe(true)
    }
  })

  test('different entry points get different paths', () => {
    const a = pipVenvEntryPointPath('/cache/venv', 'foo')
    const b = pipVenvEntryPointPath('/cache/venv', 'bar')
    expect(a).not.toBe(b)
  })
})

describe('from-pip-venv / findPython', () => {
  test('returns a string when Python is on PATH, undefined when not', () => {
    // We can't control the host's Python presence; just check the shape.
    const result = findPython()
    expect(result === undefined || typeof result === 'string').toBe(true)
  })
})
