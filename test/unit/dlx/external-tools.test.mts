/**
 * @fileoverview Unit tests for external-tools loader.
 */

import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ExternalToolsError,
  loadExternalTools,
} from '@socketsecurity/lib/dlx/external-tools'

async function withScratch<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const scratch = await fs.mkdtemp(path.join(tmpdir(), 'socket-lib-ext-tools-'))
  try {
    return await fn(scratch)
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
  }
}

describe('dlx/external-tools', () => {
  it('loads tools and freezes the result', async () => {
    await withScratch(async scratch => {
      const file = path.join(scratch, 'external-tools.json')
      await fs.writeFile(
        file,
        JSON.stringify({
          tools: {
            claude: {
              packageManager: 'npm',
              package: '@anthropic-ai/claude-code',
              version: '2.1.92',
            },
          },
        }),
      )
      const tools = await loadExternalTools(file)
      expect(tools['claude']).toEqual({
        packageManager: 'npm',
        package: '@anthropic-ai/claude-code',
        version: '2.1.92',
      })
      expect(Object.isFrozen(tools)).toBe(true)
      expect(Object.isFrozen(tools['claude'])).toBe(true)
    })
  })

  it('resolves relative lockfile paths against the document directory', async () => {
    await withScratch(async scratch => {
      const file = path.join(scratch, 'external-tools.json')
      await fs.writeFile(
        file,
        JSON.stringify({
          tools: {
            claude: {
              packageManager: 'npm',
              package: '@anthropic-ai/claude-code',
              lockfile: './claude/package-lock.json',
            },
          },
        }),
      )
      const tools = await loadExternalTools(file)
      expect(tools['claude']?.lockfile).toBe(
        path.resolve(scratch, 'claude/package-lock.json'),
      )
    })
  })

  it('leaves absolute lockfile paths untouched', async () => {
    await withScratch(async scratch => {
      const file = path.join(scratch, 'external-tools.json')
      const abs = '/tmp/absolute-lock.json'
      await fs.writeFile(
        file,
        JSON.stringify({ tools: { a: { lockfile: abs } } }),
      )
      const tools = await loadExternalTools(file)
      expect(tools['a']?.lockfile).toBe(abs)
    })
  })

  it('follows extends chain (child overrides parent)', async () => {
    await withScratch(async scratch => {
      const baseFile = path.join(scratch, 'base.json')
      const childFile = path.join(scratch, 'child.json')
      await fs.writeFile(
        baseFile,
        JSON.stringify({
          tools: {
            a: { packageManager: 'npm', package: 'a', version: '1.0.0' },
            b: { packageManager: 'npm', package: 'b', version: '1.0.0' },
          },
        }),
      )
      await fs.writeFile(
        childFile,
        JSON.stringify({
          extends: './base.json',
          tools: {
            b: { packageManager: 'npm', package: 'b', version: '2.0.0' },
            c: { packageManager: 'npm', package: 'c', version: '1.0.0' },
          },
        }),
      )
      const tools = await loadExternalTools(childFile)
      expect(tools['a']?.version).toBe('1.0.0')
      expect(tools['b']?.version).toBe('2.0.0')
      expect(tools['c']?.version).toBe('1.0.0')
    })
  })

  it('throws ExternalToolsError on circular extends', async () => {
    await withScratch(async scratch => {
      const a = path.join(scratch, 'a.json')
      const b = path.join(scratch, 'b.json')
      await fs.writeFile(a, JSON.stringify({ extends: './b.json', tools: {} }))
      await fs.writeFile(b, JSON.stringify({ extends: './a.json', tools: {} }))
      await expect(loadExternalTools(a)).rejects.toThrow(ExternalToolsError)
    })
  })

  it('throws on malformed JSON', async () => {
    await withScratch(async scratch => {
      const file = path.join(scratch, 'bad.json')
      await fs.writeFile(file, '{not json')
      await expect(loadExternalTools(file)).rejects.toThrow(ExternalToolsError)
    })
  })

  it('throws on missing tools field', async () => {
    await withScratch(async scratch => {
      const file = path.join(scratch, 'empty.json')
      await fs.writeFile(file, '{}')
      await expect(loadExternalTools(file)).rejects.toThrow(ExternalToolsError)
    })
  })

  it('throws on missing file', async () => {
    await withScratch(async scratch => {
      await expect(
        loadExternalTools(path.join(scratch, 'nope.json')),
      ).rejects.toThrow(ExternalToolsError)
    })
  })
})
