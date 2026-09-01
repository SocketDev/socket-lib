/**
 * @file Repo-local rule: reach a Node builtin through its `getNode*()` accessor
 *   (`src/node/*`), never a direct `import fs from 'node:fs'`.
 *   Two things break when a module imports the builtin directly. A browser
 *   bundle resolves `node:fs` to a scheme it cannot load and throws at import
 *   time, which is exactly what the accessors exist to avoid: each one requires
 *   the bare specifier behind an `IS_NODE` guard, so a browser build carries an
 *   `undefined` rather than a hard failure. And a direct import binds the real
 *   module object, so a test has nothing to stand in for it — a spy
 *   attaches to the accessor, not to the binding.
 *   The baseline below records the modules that predate the rule. It shrinks
 *   only: an entry that stops importing a builtin directly must leave the list,
 *   and nothing may be added. New code has no baseline to hide in.
 *   Not fixable. Replacing the import means introducing a binding at every use
 *   site, and the safe placement is inside the function that uses it rather
 *   than at module scope (a module-scope `const fs = getNodeFs()` runs at load
 *   and is `undefined` in a browser, which is the failure this rule prevents).
 *   An automatic rewrite would have to guess, so the rule names the accessor
 *   and leaves the edit to a human.
 */

import type {
  AstNode,
  RuleContext,
} from '../../../fleet/oxlint-plugin/lib/rule-types.mts'

/**
 * Builtin specifier (with or without the `node:` prefix) to the accessor that
 * wraps it. A builtin absent from this map has no accessor, so importing it
 * directly is the only option and the rule stays quiet.
 */
export const BUILTIN_TO_GETTER: Record<string, string> = {
  __proto__: null,
  async_hooks: 'getNodeAsyncHooks',
  child_process: 'getNodeChildProcess',
  crypto: 'getNodeCrypto',
  events: 'getNodeEvents',
  fs: 'getNodeFs',
  'fs/promises': 'getNodeFsPromises',
  http: 'getNodeHttp',
  https: 'getNodeHttps',
  module: 'getNodeModule',
  os: 'getNodeOs',
  path: 'getNodePath',
  process: 'getNodeProcess',
  'timers/promises': 'getNodeTimersPromises',
  url: 'getNodeUrl',
  util: 'getNodeUtil',
  // The `__proto__: null` literal has no index signature of its own, so the
  // widening goes through `unknown`. Null-prototype matters here: a lookup of
  // `constructor` or `toString` must answer undefined, not an inherited
  // function that would read as a real accessor name.
} as unknown as Record<string, string>

/**
 * Modules that imported a builtin directly before this rule existed. Shrink
 * only — never add.
 */
export const DIRECT_IMPORT_BASELINE: readonly string[] = [
  'src/ai/agent-context.mts',
  'src/ai/discover.mts',
  'src/ai/spawn.mts',
  'src/ai/worktree.mts',
  'src/archives/shared.mts',
  'src/archives/tar.mts',
  'src/cli/check-primordials.mts',
  'src/cli/is-main-module.mts',
  'src/cli/main.mts',
  'src/cli/socket-lib.mts',
  'src/compression/brotli.mts',
  'src/compression/gzip.mts',
  'src/compression/shared.mts',
  'src/constants/node.mts',
  'src/constants/platform.mts',
  'src/cover/code.mts',
  'src/cover/type.mts',
  'src/crypto/integrity.mts',
  'src/dlx/binary-cache.mts',
  'src/dlx/binary-download.mts',
  'src/dlx/binary.mts',
  'src/dlx/lockfile.mts',
  'src/eco/npm/script.mts',
  'src/env/node-version-managers.mts',
  'src/env/package-manager.mts',
  'src/events/warning/suppress.mts',
  'src/exe/argv/flag-predicates.mts',
  'src/exe/argv/parse.mts',
  'src/exe/path/find.mts',
  'src/exe/path/sanitize.mts',
  'src/exe/path/which.mts',
  'src/exe/sea/detect.mts',
  'src/exe/shadow/skip.mts',
  'src/external-tools/bazel/read-bazel-version-file.mts',
  'src/external-tools/bazel/resolve-bazel-version.mts',
  'src/external-tools/cdxgen/from-download.mts',
  'src/external-tools/from-download.mts',
  'src/external-tools/from-pip-venv.mts',
  'src/external-tools/janus/from-download.mts',
  'src/external-tools/jre/detect-platform-arch.mts',
  'src/external-tools/jre/from-download.mts',
  'src/external-tools/jre/from-java-home.mts',
  'src/external-tools/jre/from-path.mts',
  'src/external-tools/jre/from-vfs.mts',
  'src/external-tools/opengrep/from-download.mts',
  'src/external-tools/python/asset-names.mts',
  'src/external-tools/python/from-download.mts',
  'src/external-tools/python/pin.mts',
  'src/external-tools/python/pip-install.mts',
  'src/external-tools/python/uv-install.mts',
  'src/external-tools/sbt/from-download.mts',
  'src/external-tools/skillspector/from-dlx.mts',
  'src/external-tools/skillspector/from-uv.mts',
  'src/external-tools/socket-keychain/from-download.mts',
  'src/external-tools/trivy/from-download.mts',
  'src/external-tools/trufflehog/from-download.mts',
  'src/external-tools/uv/from-download.mts',
  'src/fs/find.mts',
  'src/fs/read-json-cache.mts',
  'src/fs/resolve-module.mts',
  'src/git/isolated-index.mts',
  'src/github/ghsa.mts',
  'src/github/refs.mts',
  'src/hooks/dispatch-failure.mts',
  'src/http-request/download.mts',
  'src/http-request/request.mts',
  'src/http-request/user-agent.mts',
  'src/ipc/directory.mts',
  'src/ipc/paths.mts',
  'src/ipc/write.mts',
  'src/json/edit.mts',
  'src/logger/console.mts',
  'src/native-messaging/host.mts',
  'src/native-messaging/install.mts',
  'src/packages/find.mts',
  'src/paths/walk.mts',
  'src/perf/timer.mts',
  'src/primordials/checks/primordials.mts',
  'src/process/open-url.mts',
  'src/process/spawn/child.mts',
  'src/process/spawn/pty.mts',
  'src/process/spawn/run.mts',
  'src/process/spawn/shared.mts',
  'src/process/spawn/windows-shell.mts',
  'src/process/transient.mts',
  'src/releases/github-auth.mts',
  'src/releases/github-downloads.mts',
  'src/secrets/addon.mts',
  'src/secrets/broker.mts',
  'src/secrets/compare.mts',
  'src/secrets/keychain.mts',
  'src/secrets/oauth-pkce.mts',
  'src/secrets/rc.mts',
  'src/secrets/windows.mts',
  'src/spinner/with.mts',
  'src/state/db.mts',
  'src/stdio/clear.mts',
  'src/stdio/progress.mts',
  'src/stdio/stderr.mts',
  'src/stdio/stdout.mts',
]

const baseline = new Set(DIRECT_IMPORT_BASELINE)

/**
 * Whether this file is exempt: the accessors themselves must import the
 * builtin, and anything outside `src/` is not part of the published module
 * shape. Paths arrive absolute, so the match is on a normalized suffix.
 */
export function isExemptFile(filename: string): boolean {
  const normalized = filename.split('\\').join('/')
  const index = normalized.lastIndexOf('/src/')
  if (index === -1) {
    return true
  }
  // Only the published library is browser-bound. A nested `src/` under tools,
  // scripts, or test belongs to something that runs in Node and nowhere else,
  // and matching a bare `/src/` anywhere would drag all of it in.
  const before = normalized.slice(0, index)
  if (
    before.includes('/tools/') ||
    before.includes('/scripts/') ||
    before.includes('/test/') ||
    before.includes('/node_modules/')
  ) {
    return true
  }
  const rel = `src${normalized.slice(index + '/src'.length)}`
  return rel.startsWith('src/node/') || baseline.has(rel)
}

/**
 * The builtin an import specifier names, with the `node:` prefix stripped, or
 * undefined when the specifier is not a builtin this repo wraps.
 */
export function wrappedBuiltinOf(source: string): string | undefined {
  const bare = source.startsWith('node:')
    ? source.slice('node:'.length)
    : source
  return BUILTIN_TO_GETTER[bare] === undefined ? undefined : bare
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Reach a Node builtin through its `getNode*()` accessor (`src/node/*`) so browser bundles stay loadable and tests can stand one in.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      directImport:
        "`import … from '{{source}}'` binds the builtin directly. Import `{{getter}}` from `src/node/{{module}}.mjs` and call it where the module is used, so a browser build does not resolve the builtin and a test can stand one in.",
    },
    schema: [],
  },

  create(context: RuleContext) {
    const filename = context.getFilename
      ? context.getFilename()
      : (context.filename ?? '')
    if (isExemptFile(filename)) {
      return {}
    }
    return {
      ImportDeclaration(node: AstNode) {
        const source = node.source?.value
        if (typeof source !== 'string') {
          return
        }
        const builtin = wrappedBuiltinOf(source)
        if (builtin === undefined) {
          return
        }
        // A type-only import erases at build time, so it reaches no runtime
        // resolver and cannot break a browser bundle.
        if (node.importKind === 'type') {
          return
        }
        context.report({
          node,
          messageId: 'directImport',
          data: {
            getter: BUILTIN_TO_GETTER[builtin]!,
            module: builtin,
            source,
          },
        })
      },
    }
  },
}

// oxlint's plugin contract requires a default-exported rule object.
// oxlint-disable-next-line socket/no-default-export -- plugin contract
export default rule
