/**
 * @file Shared rig for the browser-bundle e2e arms. Every arm does the same
 *   four things — symlink the local lib so the bundle exercises THIS repo's
 *   dist and browser field, bundle for the browser with the browser condition
 *   first, assert it emitted no errors, and hand back the emitted source for
 *   execution in a bare `node:vm`. Keeping that in one place is what lets an
 *   arm be the ten lines that are actually about its subject.
 *   TWO BUNDLERS, ONE CONTRACT. {@link bundleForWeb} runs webpack at
 *   `target: 'web'` and {@link bundleForWebWithEsbuild} runs esbuild at
 *   `platform: 'browser'`. They share the {@link BundleResult} shape on
 *   purpose: an arm takes a {@link WebBundler} and every assertion body is
 *   written once and run by both. Two independent resolvers agreeing that a
 *   `browser` condition picks the browser twin is a far stronger claim than
 *   either one alone, because a bundler-specific resolution quirk cannot
 *   produce it.
 */

import { mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'
import webpack from 'webpack'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

const testDir = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot: string = path.resolve(testDir, '..', '..')
export const fixtureDir: string = path.resolve(
  repoRoot,
  'test',
  'fixtures',
  'browser',
)

/**
 * Resolve `@socketsecurity/lib` to THIS repo. The self-dep otherwise symlinks
 * to the published version, which would bundle someone else's dist and prove
 * nothing about the working tree.
 */
export function linkLocalLib(): void {
  const scopeDir = path.join(fixtureDir, 'node_modules', '@socketsecurity')
  mkdirSync(scopeDir, { recursive: true })
  const link = path.join(scopeDir, 'lib')
  safeDeleteSync(link)
  symlinkSync(repoRoot, link, 'dir')
}

/**
 * One bundling run's outcome. `errors` is undefined on success, so an arm
 * asserts `expect(result.errors).toBeUndefined()` and gets webpack's own
 * formatted error text in the failure message when it isn't.
 */
export interface BundleResult {
  errors: string | undefined
  outFile: string
  source: string
}

export interface BundleOptions {
  entry: string
  // Emitted filename, also used to name the temp output directory.
  filename: string
  // When set, the bundler emits a `var <library>` global so a vm context can
  // reach the entry's exports. Omit for an arm that only proves it bundles.
  library?: string | undefined
}

/**
 * The one shape an arm depends on. Both bundlers implement it, so an arm is
 * parameterized by its bundler instead of being written twice.
 */
export type WebBundler = (options: BundleOptions) => Promise<BundleResult>

/**
 * The resolution conditions a browser build must apply, browser first.
 *
 * This is the entire point of both rigs: an export whose `browser` condition
 * points at a Node file resolves it HERE, and the bundle then fails on a
 * `node:` specifier instead of shipping the mistake to a consumer.
 */
const browserConditions = ['browser', 'import', 'require', 'default']

/**
 * A temp output directory for one bundling run, emptied first so a stale
 * artifact from an earlier run can never be mistaken for this run's output.
 */
function freshOutDir(prefix: string, filename: string): string {
  const outDir = path.join(os.tmpdir(), `${prefix}-${filename}`)
  safeDeleteSync(outDir)
  return outDir
}

/**
 * Bundle one fixture entry for the browser with webpack and return the
 * emitted source.
 *
 * `conditionNames` is {@link browserConditions}, browser first.
 */
export async function bundleForWeb(
  options: BundleOptions,
): Promise<BundleResult> {
  linkLocalLib()
  const outDir = freshOutDir('socket-lib-webpack-e2e', options.filename)
  const config: webpack.Configuration = {
    entry: options.entry,
    mode: 'production',
    output: {
      filename: options.filename,
      globalObject: 'globalThis',
      path: outDir,
      publicPath: '',
      ...(options.library
        ? { library: { name: options.library, type: 'var' as const } }
        : {}),
    },
    resolve: { conditionNames: [...browserConditions] },
    target: 'web',
  }
  const stats = await new Promise<webpack.Stats | undefined>(
    (resolve, reject) => {
      webpack(config, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    },
  )
  const outFile = path.join(outDir, options.filename)
  if (stats?.hasErrors()) {
    return {
      errors: stats.toString({ all: false, errors: true }),
      outFile,
      source: '',
    }
  }
  return { errors: undefined, outFile, source: readFileSync(outFile, 'utf8') }
}

/**
 * Bundle one fixture entry for the browser with esbuild and return the
 * emitted source.
 *
 * A SECOND, INDEPENDENT RESOLVER over the same exports map. esbuild has its
 * own implementation of conditional exports and of the `browser` field's
 * object form, so an arm that passes under both bundlers cannot be passing on
 * a webpack-specific resolution quirk.
 *
 * `format: 'iife'` plus `globalName` is esbuild's equivalent of webpack's
 * `library: { type: 'var' }`: the bundle declares one top-level `var`, which
 * in a `vm` context lands as a property on the sandbox exactly the way the
 * webpack arms already rely on.
 *
 * `platform: 'browser'` is what supplies the `browser` condition here, not the
 * `conditions` list — esbuild ADDS that list to the platform's own defaults
 * rather than replacing them. The list is passed anyway so both rigs name the
 * same conditions in the same order, but changing `platform` is the only edit
 * that can take the browser resolution away.
 *
 * Esbuild throws a `BuildFailure` instead of reporting errors in a result, so
 * the throw is caught and formatted back into the `errors` string that
 * {@link BundleResult} promises. An arm asserting `errors` is undefined then
 * gets esbuild's own message text on failure rather than a bare rejection.
 */
export async function bundleForWebWithEsbuild(
  options: BundleOptions,
): Promise<BundleResult> {
  linkLocalLib()
  const outDir = freshOutDir('socket-lib-esbuild-e2e', options.filename)
  const outFile = path.join(outDir, options.filename)
  try {
    await esbuild.build({
      absWorkingDir: fixtureDir,
      bundle: true,
      conditions: [...browserConditions],
      entryPoints: [options.entry],
      format: 'iife',
      outfile: outFile,
      platform: 'browser',
      write: true,
      ...(options.library ? { globalName: options.library } : {}),
    })
  } catch (error) {
    const failure = error as { errors?: esbuild.Message[] | undefined }
    const messages = esbuild.formatMessagesSync(failure.errors ?? [], {
      color: false,
      kind: 'error',
    })
    // A throw with no `errors` array is not a build failure at all, so its own
    // text is the only honest thing to report.
    return {
      errors: messages.length ? messages.join('\n') : String(error),
      outFile,
      source: '',
    }
  }
  return { errors: undefined, outFile, source: readFileSync(outFile, 'utf8') }
}
