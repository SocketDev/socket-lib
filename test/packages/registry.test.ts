/**
 * @fileoverview Unit tests for Socket Registry class.
 */

import { describe, expect, it } from 'vitest'

import { SocketRegistry } from '@socketsecurity/lib/packages/registry'

describe('packages/registry', () => {
  describe('SocketRegistry', () => {
    it('should export SocketRegistry class', () => {
      expect(typeof SocketRegistry).toBe('function')
    })

    it('should be instantiable', () => {
      const registry = new SocketRegistry()
      expect(registry).toBeInstanceOf(SocketRegistry)
    })

    it('should be a class constructor', () => {
      expect(SocketRegistry.prototype).toBeDefined()
      expect(SocketRegistry.prototype.constructor).toBe(SocketRegistry)
    })

    it('should have a name property', () => {
      // Note: class name may be minified in production builds
      expect(typeof SocketRegistry.name).toBe('string')
      expect(SocketRegistry.name.length).toBeGreaterThan(0)
    })

    it('should create independent instances', () => {
      const registry1 = new SocketRegistry()
      const registry2 = new SocketRegistry()
      expect(registry1).not.toBe(registry2)
      expect(registry1).toBeInstanceOf(SocketRegistry)
      expect(registry2).toBeInstanceOf(SocketRegistry)
    })

    it('should support instanceof checks', () => {
      const registry = new SocketRegistry()
      expect(registry instanceof SocketRegistry).toBe(true)
      expect(registry instanceof Object).toBe(true)
    })
  })
})
