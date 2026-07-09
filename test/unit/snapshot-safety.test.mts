/**
 * @file Regression guard against eager native-handle capture at module-eval.
 *   V8 `node --build-snapshot` refuses to serialize a heap that pins a live
 *   native handle (`[Foreign]`) or a bound native function (an unresolvable
 *   external reference). Several library leaves used to construct such handles
 *   at MODULE SCOPE, so merely IMPORTING them — or any module transitively
 *   importing them — aborted snapshot serialization:
 *
 *   - The default `Spinner` (wraps yocto-spinner; live stream handle).
 *   - The shared process `AbortSignal` (`getAbortSignal()`).
 *   - The `Intl.Segmenter` in `strings/width` (live ICU handle).
 *   - `AsyncLocalStorage` singletons in `env/rewire` and `themes/context`.
 *   - The pre-bound `console.*` methods in `logger/_internal`. Each is now
 *     acquired LAZILY at first use. Two layers of tests assert the contract:
 *
 *   1. Unit: importing the module must NOT trigger the deferred construction;
 *      calling the using function MUST.
 *   2. E2E: `node --build-snapshot` of the real built dist module succeeds — the
 *      ground-truth proof that no handle is pinned at import time.
 */

import * as realAsyncHooks from 'node:async_hooks'
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SpinnerInstance } from '../../src/spinner/types'

// Minimal fake covering the spinner surface the wrapped consumers touch
// (isSpinning / start / stop). Cast through the real type so the partial mock
// satisfies the module's declared SpinnerInstance return.
const fakeSpinner = {
  isSpinning: false,
  start: vi.fn(),
  stop: vi.fn(),
} as unknown as SpinnerInstance
const getDefaultSpinner = vi.fn(() => fakeSpinner)
vi.mock(import('../../src/spinner/default'), () => ({ getDefaultSpinner }))

// Spy on the shared process AbortSignal accessor so we can observe whether a
// consuming module grabs it at import time vs. at call time.
const getAbortSignal = vi.fn(() => new AbortController().signal)
vi.mock(import('../../src/process/abort'), async importOriginal => ({
  ...(await importOriginal()),
  getAbortSignal,
}))

// Spy on the Intl.Segmenter constructor (strings/width's only live ICU handle).
// A plain `function` spy is `new`-able (arrow functions are not) and, by
// returning a real Intl.Segmenter, the `new` expression yields a fully working
// instance while the spy still records each construction.
const IntlSegmenter = vi.fn(function (
  ...args: ConstructorParameters<typeof Intl.Segmenter>
) {
  return new Intl.Segmenter(...args)
}) as unknown as typeof Intl.Segmenter
vi.mock(import('../../src/primordials/intl'), async importOriginal => ({
  ...(await importOriginal()),
  IntlSegmenter,
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Drop the module registry so the next dynamic import re-evaluates the module
  // top-level under clean spies, letting us observe import-time side effects.
  vi.resetModules()
})

describe('snapshot safety — lazy default-spinner acquisition', () => {
  describe('process/spawn/child', () => {
    it('does not construct the default spinner at module-eval', async () => {
      await import('../../src/process/spawn/child')
      expect(getDefaultSpinner).not.toHaveBeenCalled()
    })

    it('acquires the default spinner when spawn() runs without an override', async () => {
      const { spawn } = await import('../../src/process/spawn/child')
      expect(getDefaultSpinner).not.toHaveBeenCalled()

      // Resolve a trivial child so the promise settles; spawn() acquires the
      // spinner synchronously at the top of the call before any awaiting.
      await spawn(process.execPath, ['-e', '0']).catch(() => {})
      expect(getDefaultSpinner).toHaveBeenCalled()
    })
  })

  describe('stdio/prompts', () => {
    it('does not construct the default spinner at module-eval', async () => {
      await import('../../src/stdio/prompts')
      expect(getDefaultSpinner).not.toHaveBeenCalled()
    })

    it('acquires the default spinner when a wrapped prompt runs without a context spinner', async () => {
      const { wrapPrompt } = await import('../../src/stdio/prompts')
      expect(getDefaultSpinner).not.toHaveBeenCalled()

      const wrapped = wrapPrompt(vi.fn().mockResolvedValue('ok'))
      await wrapped({ message: 'go?' })
      expect(getDefaultSpinner).toHaveBeenCalled()
    })
  })
})

describe('snapshot safety — lazy abort-signal acquisition', () => {
  // Each module previously captured `const abortSignal = getAbortSignal()` at
  // module scope. The signal must instead be read inside the function that
  // forwards it to a node:fs / pacote / iteration call. Each case imports the
  // module (asserting import alone is signal-free) then runs its using
  // function (asserting the signal is read by call time). The using calls hit
  // a missing path / fake spec, so they reject — caught and ignored; we only
  // assert WHEN the shared signal was read.
  const assertLazy = (
    name: string,
    importModule: () => Promise<unknown>,
    runUsage: () => Promise<unknown>,
  ) =>
    describe(name, () => {
      it('does not read the shared abort signal at module-eval', async () => {
        await importModule()
        expect(getAbortSignal).not.toHaveBeenCalled()
      })

      it('reads the shared abort signal when the using function runs', async () => {
        await importModule()
        expect(getAbortSignal).not.toHaveBeenCalled()
        await runUsage().catch(() => {})
        expect(getAbortSignal).toHaveBeenCalled()
      })
    })

  // findUp resolves the default signal synchronously while destructuring
  // options at the top of the call.
  assertLazy(
    'fs/find',
    () => import('../../src/fs/find'),
    async () =>
      (await import('../../src/fs/find')).findUp('definitely-not-a-real-file'),
  )
  assertLazy(
    'fs/read-file',
    () => import('../../src/fs/read-file'),
    async () =>
      (await import('../../src/fs/read-file')).readFileUtf8('/no/such/path'),
  )
  assertLazy(
    'packages/tarball',
    () => import('../../src/packages/tarball'),
    async () =>
      (await import('../../src/packages/tarball')).packPackage(
        'definitely-not-a-real-pkg',
      ),
  )
  assertLazy(
    'promises/options',
    () => import('../../src/promises/options'),
    async () =>
      (await import('../../src/promises/options')).normalizeIterationOptions(1),
  )
})

describe('snapshot safety — lazy Intl.Segmenter in strings/width', () => {
  it('does not construct the segmenter at module-eval', async () => {
    await import('../../src/strings/width')
    expect(IntlSegmenter).not.toHaveBeenCalled()
  })

  it('constructs the segmenter on the first stringWidth() call and reuses it', async () => {
    const { stringWidth } = await import('../../src/strings/width')
    expect(IntlSegmenter).not.toHaveBeenCalled()

    // 'héllo'(5) + ' '(1) + '漢字'(4, CJK ×2 cols) + ' '(1) + '👍🏽'(2, one
    // emoji grapheme) = 13. Exercises the grapheme-segmentation path so the
    // segmenter actually gets used.
    expect(stringWidth('héllo 漢字 👍🏽')).toBe(13)
    expect(IntlSegmenter).toHaveBeenCalledTimes(1)

    // Memoized: a second call reuses the same instance.
    stringWidth('again')
    expect(IntlSegmenter).toHaveBeenCalledTimes(1)
  })
})

describe('snapshot safety — lazy AsyncLocalStorage singletons', () => {
  // env/rewire and themes/context construct their AsyncLocalStorage through the
  // node/async-hooks lazy loader. With the construction deferred, importing the
  // module must not pull in async_hooks at all; the first withEnv()/getTheme()
  // call does. Spying on the loader is the cleanest observable proxy for "was
  // the store constructed at import time".
  const getNodeAsyncHooks = vi.fn(() => realAsyncHooks)

  beforeEach(() => {
    vi.doMock(import('../../src/node/async-hooks'), () => ({
      getNodeAsyncHooks,
    }))
    getNodeAsyncHooks.mockClear()
  })

  afterEach(() => {
    vi.doUnmock(import('../../src/node/async-hooks'))
  })

  it('env/rewire does not construct its store at module-eval', async () => {
    await import('../../src/env/rewire')
    expect(getNodeAsyncHooks).not.toHaveBeenCalled()
  })

  it('env/rewire constructs its store on first withEnv()', async () => {
    const { withEnv } = await import('../../src/env/rewire')
    expect(getNodeAsyncHooks).not.toHaveBeenCalled()
    await withEnv({ EXAMPLE: '1' }, () => {})
    expect(getNodeAsyncHooks).toHaveBeenCalled()
  })

  it('themes/context does not construct its store at module-eval', async () => {
    await import('../../src/themes/context')
    expect(getNodeAsyncHooks).not.toHaveBeenCalled()
  })

  it('themes/context constructs its store on first getTheme()', async () => {
    const { getTheme } = await import('../../src/themes/context')
    expect(getNodeAsyncHooks).not.toHaveBeenCalled()
    getTheme()
    expect(getNodeAsyncHooks).toHaveBeenCalled()
  })
})

describe('snapshot safety — lazy bound console methods (logger/_internal)', () => {
  // logger/_internal used to build `console.method.bind(globalConsole)` at
  // module-eval; a bound native function serializes as an unresolvable external
  // reference and aborts --build-snapshot. The binds are now built lazily by
  // getBoundConsoleEntries(). Counting Function.prototype.bind invocations that
  // target the captured console is the cleanest observable for "were the binds
  // built at import vs. at first use".

  let bindCount = 0
  let originalBind: typeof Function.prototype.bind

  beforeEach(() => {
    bindCount = 0
    originalBind = Function.prototype.bind
    // oxlint-disable-next-line no-extend-native -- deliberate test instrumentation: counts console binds at module-eval; restored in afterEach.
    Function.prototype.bind = function (
      this: (...args: unknown[]) => unknown,
      thisArg,
      ...rest
    ) {
      if (thisArg === globalThis.console) {
        bindCount += 1
      }
      return originalBind.call(this, thisArg, ...rest)
    } as typeof Function.prototype.bind
  })

  afterEach(() => {
    // oxlint-disable-next-line no-extend-native -- restores the original bind captured in beforeEach.
    Function.prototype.bind = originalBind
  })

  it('does not bind console methods at module-eval', async () => {
    await import('../../src/logger/_internal')
    expect(bindCount).toBe(0)
  })

  it('binds console methods on the first getBoundConsoleEntries() call and memoizes', async () => {
    const { getBoundConsoleEntries } =
      await import('../../src/logger/_internal')
    expect(bindCount).toBe(0)

    const entries = getBoundConsoleEntries()
    expect(bindCount).toBeGreaterThan(0)
    expect(entries.length).toBeGreaterThan(0)

    // Memoized: a second call reuses the same array and binds nothing further.
    const boundOnFirstCall = bindCount
    expect(getBoundConsoleEntries()).toBe(entries)
    expect(bindCount).toBe(boundOnFirstCall)
  })
})

describe('snapshot safety — lazy vendored-semver require (versions/*)', () => {
  // versions/_internal used to `require('../external/semver')` at module-eval
  // and versions/compare used to `impl.eq.bind(impl)` at module scope. The
  // vendored semver resolves through the npm-pack bundle, whose eval builds a
  // live native [Foreign] handle — pinning it aborts --build-snapshot. The
  // require + the smol-vs-semver pick are now deferred to first call. Spying on
  // the smol-versions loader (called inside getImpl()) is the cleanest
  // observable: it stays unread at import and is read on the first op.
  const getSmolVersions = vi.fn(() => undefined)

  beforeEach(() => {
    vi.doMock(import('../../src/smol/versions'), () => ({ getSmolVersions }))
    getSmolVersions.mockClear()
  })

  afterEach(() => {
    vi.doUnmock(import('../../src/smol/versions'))
  })

  it('versions/compare does not resolve the version impl at module-eval', async () => {
    await import('../../src/versions/compare')
    expect(getSmolVersions).not.toHaveBeenCalled()
  })

  it('versions/compare resolves the impl on the first eq() call and reuses it', async () => {
    const { eq } = await import('../../src/versions/compare')
    expect(getSmolVersions).not.toHaveBeenCalled()

    expect(eq('1.2.3', '1.2.3')).toBe(true)
    expect(getSmolVersions).toHaveBeenCalledTimes(1)

    // Memoized: a second op reuses the resolved impl, no re-probe.
    expect(eq('1.0.0', '2.0.0')).toBe(false)
    expect(getSmolVersions).toHaveBeenCalledTimes(1)
  })

  it('versions/range does not resolve the version impl at module-eval', async () => {
    await import('../../src/versions/range')
    expect(getSmolVersions).not.toHaveBeenCalled()
  })

  it('versions/range resolves the impl on the first satisfiesVersion() call', async () => {
    const { satisfiesVersion } = await import('../../src/versions/range')
    expect(getSmolVersions).not.toHaveBeenCalled()
    expect(satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(getSmolVersions).toHaveBeenCalled()
  })
})

describe('snapshot safety — lazy vendored-cacache require (cacache/_internal)', () => {
  // cacache/_internal used to `import cacache from '../external/cacache'` at
  // module-eval, constructing the npm-pack bundle's native [Foreign] handle at
  // import. The require is now deferred + memoized in getCacache().
  //
  // The vendored cacache loads through a raw CJS `require('../external/cacache')`
  // that neither the ESM module-mocker nor a Module.prototype.require wrap can
  // observe in this runner (vitest resolves the require through its own
  // registry). So the import-time module-eval guarantee for cacache is proven
  // by the ground-truth `node --build-snapshot` of the built dist below (which
  // aborts on a pinned [Foreign] handle); this unit case asserts the lazy
  // accessor's observable contract: it yields the real cacache surface and
  // memoizes a single instance across calls.
  it('getCacache yields the cacache surface and memoizes one instance', async () => {
    const { getCacache } = await import('../../src/cacache/_internal')
    const first = getCacache()
    expect(typeof first.get).toBe('function')
    expect(typeof first.put).toBe('function')
    // Memoized: every call returns the same module object.
    expect(getCacache()).toBe(first)
  })
})

describe('snapshot safety — built dist survives node --build-snapshot', () => {
  // Ground truth: snapshot the REAL built CJS module (not a src spy). A pinned
  // [Foreign] handle or unresolvable external reference aborts serialization
  // with a non-zero exit, so exit 0 proves the import path is handle-free.
  //
  // node --build-snapshot's minimal CJS loader cannot resolve nested user
  // requires, but createRequire() inside the snapshot main script can, so the
  // harness requires the dist module through a createRequire bound to dist/.
  // SharedArrayBuffer is shimmed because the snapshot main context omits it
  // (an unrelated primordials concern, out of scope here).
  const distDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../dist',
  )
  const hasDist = existsSync(distDir)

  // Modules that previously aborted snapshot and must now pass clean. The
  // versions/* + cacache/* leaves abort via the npm-pack bundle's module-eval
  // native [Foreign] handle (cacache/pacote/make-fetch-happen) — pulled in by
  // the vendored semver/cacache requires the leaves used to run at module load.
  const modules = [
    'strings/width',
    'spinner/default',
    'spinner/spinner',
    'stdio/prompts',
    'process/spawn/child',
    'env/rewire',
    'themes/context',
    'logger/symbols',
    'logger/logger',
    'stdio/footer',
    'versions/_internal',
    'versions/compare',
    'versions/parse',
    'versions/range',
    'versions/modify',
    'cacache/_internal',
    'cacache/read',
    'cacache/write',
  ]

  let workDir: string

  beforeEach(() => {
    if (hasDist) {
      workDir = mkdtempSync(path.join(os.tmpdir(), 'sl-snap-'))
    }
  })

  afterEach(() => {
    if (workDir) {
      rmSync(workDir, { force: true, recursive: true })
    }
  })

  for (let i = 0, { length } = modules; i < length; i += 1) {
    const mod = modules[i]!
    it.skipIf(!hasDist)(`${mod} does not pin a native handle at import`, () => {
      const entry = path.join(workDir, 'snap-entry.cjs')
      writeFileSync(
        entry,
        `const { createRequire } = require('node:module')\n` +
          `globalThis.SharedArrayBuffer = globalThis.SharedArrayBuffer || ArrayBuffer\n` +
          `const req = createRequire(${JSON.stringify(distDir + path.sep)})\n` +
          `req(${JSON.stringify('./' + mod + '.js')})\n`,
      )
      const { status, stderr } = spawnSync(
        process.execPath,
        [
          '--snapshot-blob',
          path.join(workDir, 'snap.blob'),
          '--build-snapshot',
          entry,
        ],
        { encoding: 'utf8' },
      )
      // Self-debugging: surface the exact serialization error on failure.
      expect(
        status,
        `node --build-snapshot of dist/${mod}.js aborted:\n${stderr}`,
      ).toBe(0)
    })
  }
})
