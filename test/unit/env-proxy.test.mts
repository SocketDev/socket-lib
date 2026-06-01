/**
 * @file Unit tests for createEnvProxy() — a Proxy that wraps an env-like record
 *   to add case-insensitive lookups for known Windows-sensitive keys (PATH,
 *   APPDATA, etc.) and an overrides layer. Split out of env.test.mts to stay
 *   under the per-file line cap; conversion and lookup helpers live there.
 */

import { createEnvProxy } from '../../src/env/proxy'
import { describe, expect, it } from 'vitest'

describe('createEnvProxy', () => {
  describe('basic functionality', () => {
    it('should return proxy that reads from base env', () => {
      const base = { PATH: '/usr/bin', HOME: '/home/user' }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBe('/usr/bin')
      expect(proxy['HOME']).toBe('/home/user')
    })

    it('should return proxy that reads from overrides', () => {
      const base = { PATH: '/usr/bin' }
      const overrides = { NODE_ENV: 'test' }
      const proxy = createEnvProxy(base, overrides)
      expect(proxy['NODE_ENV']).toBe('test')
      expect(proxy['PATH']).toBe('/usr/bin')
    })

    it('should prioritize overrides over base', () => {
      const base = { PATH: '/usr/bin', HOME: '/home/user' }
      const overrides = { PATH: '/custom/bin' }
      const proxy = createEnvProxy(base, overrides)
      expect(proxy['PATH']).toBe('/custom/bin')
      expect(proxy['HOME']).toBe('/home/user')
    })

    it('should return undefined for non-existent keys', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect(proxy['NONEXISTENT']).toBeUndefined()
    })

    it('should work without overrides', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBe('/usr/bin')
    })
  })

  describe('case-insensitive lookups', () => {
    it('should find PATH with different cases', () => {
      const base = { Path: 'C:\\Windows' }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBe('C:\\Windows')
      expect(proxy['Path']).toBe('C:\\Windows')
      expect(proxy['path']).toBe('C:\\Windows')
    })

    it('should find TEMP with different cases', () => {
      const base = { Temp: 'C:\\Temp' }
      const proxy = createEnvProxy(base)
      expect(proxy['TEMP']).toBe('C:\\Temp')
      expect(proxy['temp']).toBe('C:\\Temp')
    })

    it('should find HOME with different cases', () => {
      const base = { home: '/home/user' }
      const proxy = createEnvProxy(base)
      expect(proxy['HOME']).toBe('/home/user')
      expect(proxy['Home']).toBe('/home/user')
    })

    it('should prioritize exact match over case-insensitive', () => {
      const base = { PATH: '/exact', Path: '/alt' }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBe('/exact')
      expect(proxy['Path']).toBe('/alt')
    })

    it('should check overrides for case-insensitive matches', () => {
      const base = { path: '/base/path' }
      const overrides = { Path: '/override/path' }
      const proxy = createEnvProxy(base, overrides)
      // Access with 'PATH' should find 'Path' in overrides via case-insensitive lookup.
      expect(proxy['PATH']).toBe('/override/path')
    })

    it('should not do case-insensitive lookup for non-Windows vars', () => {
      const base = { myVar: 'value' }
      const proxy = createEnvProxy(base)
      expect(proxy['MYVAR']).toBeUndefined()
      expect(proxy['myVar']).toBe('value')
    })
  })

  describe('Proxy handlers', () => {
    it('should support "in" operator', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect('PATH' in proxy).toBe(true)
      expect('HOME' in proxy).toBe(false)
    })

    it('should support "in" operator with case-insensitive keys', () => {
      const base = { Path: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect('PATH' in proxy).toBe(true)
      expect('path' in proxy).toBe(true)
    })

    it('should support Object.keys', () => {
      const base = { PATH: '/usr/bin', HOME: '/home/user' }
      const overrides = { NODE_ENV: 'test' }
      const proxy = createEnvProxy(base, overrides)
      const keys = Object.keys(proxy)
      expect(keys).toContain('PATH')
      expect(keys).toContain('HOME')
      expect(keys).toContain('NODE_ENV')
      expect(keys).toHaveLength(3)
    })

    it('should deduplicate keys in Object.keys', () => {
      const base = { PATH: '/usr/bin' }
      const overrides = { PATH: '/custom/bin' }
      const proxy = createEnvProxy(base, overrides)
      const keys = Object.keys(proxy)
      expect(keys.filter(k => k === 'PATH')).toHaveLength(1)
    })

    it('should support Object.getOwnPropertyDescriptor', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      const descriptor = Object.getOwnPropertyDescriptor(proxy, 'PATH')
      expect(descriptor).toBeDefined()
      expect(descriptor?.value).toBe('/usr/bin')
      expect(descriptor?.enumerable).toBe(true)
      expect(descriptor?.configurable).toBe(true)
      expect(descriptor?.writable).toBe(true)
    })

    it('should return undefined descriptor for non-existent keys', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      const descriptor = Object.getOwnPropertyDescriptor(proxy, 'NONEXISTENT')
      expect(descriptor).toBeUndefined()
    })

    it('should support set operation with overrides', () => {
      const base = { PATH: '/usr/bin' }
      const overrides: Record<string, string | undefined> = {
        NODE_ENV: 'test',
      }
      const proxy = createEnvProxy(base, overrides)
      proxy['NEW_VAR'] = 'new-value'
      expect(proxy['NEW_VAR']).toBe('new-value')
      expect(overrides['NEW_VAR']).toBe('new-value')
    })

    it('should not support set operation without overrides', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      const result = Reflect.set(proxy, 'NEW_VAR', 'value')
      expect(result).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle empty base and overrides', () => {
      const proxy = createEnvProxy({})
      expect(proxy['PATH']).toBeUndefined()
      expect(Object.keys(proxy)).toHaveLength(0)
    })

    it('should handle non-string property access', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect(proxy[Symbol.iterator as unknown as string]).toBeUndefined()
    })

    it('returns undefined descriptor for Symbol keys', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      const sym = Symbol('test')
      const descriptor = Object.getOwnPropertyDescriptor(proxy, sym)
      expect(descriptor).toBeUndefined()
    })

    it('reports false for Symbol keys via `in` operator', () => {
      const base = { PATH: '/usr/bin' }
      const proxy = createEnvProxy(base)
      const sym = Symbol('test')
      expect(sym in proxy).toBe(false)
    })

    it('finds keys via case-insensitive lookup in overrides', () => {
      const base = { PATH: '/usr/bin' }
      const overrides = { Path: '/override' }
      const proxy = createEnvProxy(base, overrides)
      // Trigger case-insensitive `has` path: query upper-cased name
      // present only via mixed-case override.
      expect('PATH' in proxy).toBe(true)
    })

    it('should handle undefined values in base', () => {
      const base: NodeJS.ProcessEnv = {
        PATH: undefined,
        HOME: '/home/user',
      }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBeUndefined()
      expect(proxy['HOME']).toBe('/home/user')
    })

    it('should handle undefined values in overrides', () => {
      const base = { PATH: '/usr/bin' }
      const overrides = { NODE_ENV: undefined }
      const proxy = createEnvProxy(base, overrides)
      expect(proxy['NODE_ENV']).toBeUndefined()
      expect(proxy['PATH']).toBe('/usr/bin')
    })

    it('should enumerate all unique keys', () => {
      const base = { A: '1', B: '2', C: '3' }
      const overrides = { B: '20', D: '4' }
      const proxy = createEnvProxy(base, overrides)
      const keys = Object.keys(proxy).toSorted()
      expect(keys).toEqual(['A', 'B', 'C', 'D'])
    })

    it('should handle case-insensitive has check', () => {
      const base = { Path: '/usr/bin' }
      const proxy = createEnvProxy(base)
      expect('PATH' in proxy).toBe(true)
      expect('path' in proxy).toBe(true)
      expect('Path' in proxy).toBe(true)
    })

    it('should handle all Windows environment variables', () => {
      const base = {
        APPDATA: 'C:\\Users\\user\\AppData',
        COMSPEC: 'C:\\Windows\\system32\\cmd.exe',
        HOME: 'C:\\Users\\user',
        LOCALAPPDATA: 'C:\\Users\\user\\AppData\\Local',
        PATH: 'C:\\Windows',
        PATHEXT: '.COM;.EXE;.BAT',
        PROGRAMFILES: 'C:\\Program Files',
        SYSTEMROOT: 'C:\\Windows',
        TEMP: 'C:\\Temp',
        TMP: 'C:\\Temp',
        USERPROFILE: 'C:\\Users\\user',
        WINDIR: 'C:\\Windows',
      }
      const proxy = createEnvProxy(base)

      // Test case-insensitive access for all Windows vars.
      expect(proxy['appdata']).toBe(base.APPDATA)
      expect(proxy['comspec']).toBe(base.COMSPEC)
      expect(proxy['home']).toBe(base.HOME)
      expect(proxy['localappdata']).toBe(base.LOCALAPPDATA)
      expect(proxy['path']).toBe(base.PATH)
      expect(proxy['pathext']).toBe(base.PATHEXT)
      expect(proxy['programfiles']).toBe(base.PROGRAMFILES)
      expect(proxy['systemroot']).toBe(base.SYSTEMROOT)
      expect(proxy['temp']).toBe(base.TEMP)
      expect(proxy['tmp']).toBe(base.TMP)
      expect(proxy['userprofile']).toBe(base.USERPROFILE)
      expect(proxy['windir']).toBe(base.WINDIR)
    })
  })

  describe('Windows compatibility', () => {
    it('should handle mixed case PATH variations', () => {
      const base = { Path: 'C:\\Windows;C:\\Program Files' }
      const proxy = createEnvProxy(base)
      expect(proxy['PATH']).toBe(base.Path)
      expect(proxy['path']).toBe(base.Path)
      expect(proxy['PaTh']).toBe(base.Path)
    })

    it('should preserve case when setting via proxy', () => {
      const base = { PATH: '/usr/bin' }
      const overrides: Record<string, string | undefined> = {}
      const proxy = createEnvProxy(base, overrides)
      proxy['NewVar'] = 'value'
      expect(overrides['NewVar']).toBe('value')
      expect(proxy['NewVar']).toBe('value')
    })
  })
})
