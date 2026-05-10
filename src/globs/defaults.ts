/**
 * @fileoverview The npm-packlist-derived `defaultIgnore` list. Public
 * starting point for caller-customized ignore arrays — also consumed
 * internally by `_internal` (matcher / stream callers fall back to
 * this list when no `ignore` option is supplied).
 */

import { objectFreeze as ObjectFreeze } from '../objects/mutate'

export const defaultIgnore = ObjectFreeze([
  // https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files
  '**/.git',
  '**/.npmrc',
  '**/node_modules',
  // https://github.com/npm/npm-packlist/blob/v10.0.0/lib/index.js#L15-L38
  '**/.DS_Store',
  '**/.gitignore',
  '**/.hg',
  '**/.lock-wscript',
  '**/.npmignore',
  '**/.svn',
  '**/.wafpickle-*',
  '**/.*.swp',
  '**/._*/**',
  '**/archived-packages/**',
  '**/build/config.gypi',
  '**/CVS',
  '**/npm-debug.log',
  '**/*.orig',
  // Inline generic socket-registry .gitignore entries.
  '**/.env',
  '**/.eslintcache',
  '**/.nvm',
  '**/.tap',
  '**/.vscode',
  '**/*.tsbuildinfo',
  '**/Thumbs.db',
  // Inline additional ignores.
  '**/bower_components',
])
