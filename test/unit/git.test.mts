import { realpathSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { makeGitRepo } from './fixture/git.mts'
import type { GitRepoFixture } from './fixture/git.mts'

import {
  getChangedFiles,
  getChangedFilesSync,
  isChanged,
  isChangedSync,
} from '../../src/git/changed.mjs'
import { findGitRoot } from '../../src/git/repo.mjs'
import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'
import {
  getStagedFiles,
  getStagedFilesSync,
  isStaged,
  isStagedSync,
} from '../../src/git/staged.mjs'
import {
  getUnstagedFiles,
  getUnstagedFilesSync,
  isUnstaged,
  isUnstagedSync,
} from '../../src/git/unstaged.mjs'

describe('git status against a private repository', () => {
  let fixture: GitRepoFixture
  let projectRoot: string

  beforeAll(() => {
    fixture = makeGitRepo({ prefix: 'socket-lib-git-tests-' })
    projectRoot = normalizePath(realpathSync(fixture.dir))
    fixture.writeFile('package.json', '{"name":"example-module"}\n')
    fixture.writeFile('README.md', 'Example module\n')
    fixture.writeFile('pnpm-lock.yaml', 'lockfileVersion: 9\n')
    fixture.writeFile('src/logger/node.mts', 'export const exampleLogger = 1\n')
    fixture.git('add', '.')
    fixture.git('commit', '-qm', 'test: seed git fixture')
    fixture.writeFile('pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    fixture.git('add', 'pnpm-lock.yaml')
    fixture.writeFile(
      'package.json',
      '{"name":"example-module","private":true}\n',
    )
  })

  afterAll(() => fixture?.cleanup())

  it.each([
    {
      name: 'getChangedFiles',
      read: getChangedFiles,
      expected: ['package.json', 'pnpm-lock.yaml'],
    },
    {
      name: 'getChangedFilesSync',
      read: getChangedFilesSync,
      expected: ['package.json', 'pnpm-lock.yaml'],
    },
    {
      name: 'getStagedFiles',
      read: getStagedFiles,
      expected: ['pnpm-lock.yaml'],
    },
    {
      name: 'getStagedFilesSync',
      read: getStagedFilesSync,
      expected: ['pnpm-lock.yaml'],
    },
    {
      name: 'getUnstagedFiles',
      read: getUnstagedFiles,
      expected: ['package.json'],
    },
    {
      name: 'getUnstagedFilesSync',
      read: getUnstagedFilesSync,
      expected: ['package.json'],
    },
  ] as const)(
    '$name returns exact relative and absolute status paths',
    async ({ read, expected }) => {
      expect(await read({ cwd: projectRoot })).toEqual(expected)
      expect(await read({ absolute: true, cwd: projectRoot })).toEqual(
        expected.map(filename =>
          normalizePath(path.join(projectRoot, filename)),
        ),
      )
    },
  )

  it.each([
    { name: 'isChanged', check: isChanged, expected: [true, true, false] },
    {
      name: 'isChangedSync',
      check: isChangedSync,
      expected: [true, true, false],
    },
    { name: 'isStaged', check: isStaged, expected: [false, true, false] },
    {
      name: 'isStagedSync',
      check: isStagedSync,
      expected: [false, true, false],
    },
    { name: 'isUnstaged', check: isUnstaged, expected: [true, false, false] },
    {
      name: 'isUnstagedSync',
      check: isUnstagedSync,
      expected: [true, false, false],
    },
  ] as const)(
    '$name distinguishes staged, unstaged, and committed files',
    async ({ check, expected }) => {
      const filenames = ['package.json', 'pnpm-lock.yaml', 'README.md']
      for (const [index, filename] of filenames.entries()) {
        expect(await check(filename, { cwd: projectRoot })).toBe(
          expected[index],
        )
        expect(
          await check(path.join(projectRoot, filename), { cwd: projectRoot }),
        ).toBe(expected[index])
      }
      expect(await check('src/logger/node.mts', { cwd: projectRoot })).toBe(
        false,
      )
    },
  )

  it.each([
    { name: 'isChanged', check: isChanged },
    { name: 'isStaged', check: isStaged },
    { name: 'isUnstaged', check: isUnstaged },
  ] as const)('$name rejects missing files with ENOENT', async ({ check }) => {
    await expect(
      check('missing-file.mts', { cwd: projectRoot }),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['', 'test/registry', 'src/constants'])(
    'findGitRoot locates the repository from %s',
    relative => {
      expect(findGitRoot(path.join(projectRoot, relative))).toBe(projectRoot)
    },
  )

  it('findGitRoot preserves the filesystem root when it has no parent repository', () => {
    const root = normalizePath(path.parse(projectRoot).root)
    expect(findGitRoot(root)).toBe(root)
  })

  it('concurrent status calls retain the distinct staged and unstaged results', async () => {
    expect(
      await Promise.all([
        getChangedFiles({ cache: false, cwd: projectRoot }),
        getStagedFiles({ cache: false, cwd: projectRoot }),
        getUnstagedFiles({ cache: false, cwd: projectRoot }),
      ]),
    ).toEqual([
      ['package.json', 'pnpm-lock.yaml'],
      ['pnpm-lock.yaml'],
      ['package.json'],
    ])
  })

  it('concurrent file checks distinguish changed and committed files', async () => {
    expect(
      await Promise.all(
        ['package.json', 'pnpm-lock.yaml', 'README.md'].map(file =>
          isChanged(file, { cwd: projectRoot }),
        ),
      ),
    ).toEqual([true, true, false])
  })
})
