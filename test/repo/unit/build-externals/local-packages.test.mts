import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import {
  getLocalPackagePath,
  resolveLocalEntryPoint,
} from '../../../../scripts/repo/build-externals/local-packages.mts'

test('ignores neighboring packages and resolves the contained workspace', async () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'local-package-boundary-'))
  try {
    const root = path.join(fixture, 'repository')
    const neighboring = path.join(fixture, 'packages/npm/example-module')
    mkdirSync(root)
    mkdirSync(neighboring, { recursive: true })
    writeFileSync(path.join(neighboring, 'package.json'), '{}')
    expect(
      await getLocalPackagePath('@socketregistry/example-module', root),
    ).toBeUndefined()
    const local = path.join(root, 'packages/npm/example-module')
    mkdirSync(local, { recursive: true })
    writeFileSync(path.join(local, 'package.json'), '{}')
    expect(
      await getLocalPackagePath('@socketregistry/example-module', root),
    ).toBe(local)
  } finally {
    safeDeleteSync(fixture)
  }
})

test('rejects a package entry outside its local source root', async () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'local-entry-boundary-'))
  try {
    writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ main: '../outside.js' }),
    )
    await expect(resolveLocalEntryPoint(fixture)).rejects.toThrow()
  } finally {
    safeDeleteSync(fixture)
  }
})

test.each(['package', 'manifest', 'entry'])(
  'rejects an external %s symlink',
  async kind => {
    const fixture = mkdtempSync(
      path.join(os.tmpdir(), 'local-symlink-boundary-'),
    )
    try {
      const root = path.join(fixture, 'repository')
      const local = path.join(root, 'packages/npm/example-module')
      const external = path.join(fixture, 'external')
      mkdirSync(path.dirname(local), { recursive: true })
      mkdirSync(external)
      writeFileSync(
        path.join(external, 'package.json'),
        JSON.stringify({ main: './index.js' }),
      )
      writeFileSync(path.join(external, 'index.js'), '')
      if (kind === 'package') {
        symlinkSync(external, local, 'junction')
      } else {
        mkdirSync(local)
        if (kind === 'manifest') {
          symlinkSync(
            path.join(external, 'package.json'),
            path.join(local, 'package.json'),
          )
        } else {
          writeFileSync(
            path.join(local, 'package.json'),
            JSON.stringify({ main: './index.js' }),
          )
          symlinkSync(
            path.join(external, 'index.js'),
            path.join(local, 'index.js'),
          )
        }
      }
      if (kind === 'entry') {
        await expect(resolveLocalEntryPoint(local)).rejects.toThrow()
      } else {
        expect(
          await getLocalPackagePath('@socketregistry/example-module', root),
        ).toBeUndefined()
      }
    } finally {
      safeDeleteSync(fixture)
    }
  },
)
