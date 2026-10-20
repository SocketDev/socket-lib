#!/usr/bin/env node
import { createRequire } from "node:module";
import crypto from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process$1 from "node:process";
import { constants, lstatSync, realpathSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import { execFile } from "node:child_process";
import { getCACertificates } from "node:tls";
import { promisify } from "node:util";

var __commonJSMin$1 = (cb, mod) => () => (
  mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), (cb = null)),
  mod.exports
);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();

/**
 * @file Entrypoint detection for fleet scripts. The naive
 *   `import.meta.url === file://argv[1]` comparison is symlink-fragile:
 *   Node resolves the REAL path for a module's `import.meta.url` while
 *   `process.argv[1]` keeps the path as invoked, so a script spawned via a
 *   symlinked location (macOS `/var` → `/private/var`, the shape every
 *   mkdtemp-based integration test hits) never matches and `main()` silently
 *   does not run. Compare realpaths on both sides instead.
 *   V8 startup-snapshot guard: when a fleet script is bundled into the
 *   snapshot dispatch pack (e.g. `ai-balancer/probe.mts` is imported by the
 *   `ai-balancer-proxy-start` hook), `node --build-snapshot <bundle.cjs>`
 *   sets `process.argv[1]` to the bundle path. A bundled module's
 *   `import.meta.url` is rewritten to `pathToFileURL(__filename).href`, which
 *   also resolves to the bundle path, so `isMainModule` returns true and
 *   `runMain(main)` fires at module-eval — calling `probeHealth()` which
 *   loads `node:http`, creating `HTTPParser` and `net.Socket` native handles
 *   V8 refuses to serialize (`CheckGlobalAndEternalHandles` fatal). The
 *   guard mirrors `isGuardRunContext` in `guard.mts`: a snapshot BUILD pass
 *   is never a run context for a standalone script.
 */
/**
 * True when the module at `importMetaUrl` is the process entrypoint.
 * `entryPath` defaults to `process.argv[1]`; injectable for tests.
 *
 * Returns false during a V8 `--build-snapshot` pass: a bundled script's
 * `import.meta.url` and `process.argv[1]` both resolve to the bundle file,
 * so the entrypoint test would hold and `runMain` would execute `main()` at
 * module-eval — loading `node:http` (native `HTTPParser` / `Socket` handles
 * V8 refuses to serialize) and aborting `CheckGlobalAndEternalHandles`. A
 * deserialized process sees the real entrypoint comparison.
 */
function isMainModule(importMetaUrl, entryPath) {
  if (v8.startupSnapshot.isBuildingSnapshot()) return false;
  const entry = entryPath ?? process$1.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(entry);
  } catch {
    return false;
  }
}

var require_sentinels = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Core primitives and fundamental constants. Holds sentinels,
   *   unknown/empty tokens, the internals symbol, and a few shared env-var name
   *   strings. Intentionally kept small - prefer moving constants to a more
   *   specific `src/constants/*` module when possible.
   */
  const kInternalsSymbol = Symbol("@socketregistry.constants.internals");
  const LOOP_SENTINEL = 1e6;
  const UNKNOWN_ERROR = "Unknown error";
  const UNKNOWN_VALUE = "<unknown>";
  const EMPTY_FILE = "/* empty */\n";
  const EMPTY_VALUE = "<value>";
  const UNDEFINED_TOKEN = void 0;
  const COLUMN_LIMIT = 80;
  const V = "v";
  const NODE_AUTH_TOKEN = "NODE_AUTH_TOKEN";
  const NODE_ENV = "NODE_ENV";
  exports.COLUMN_LIMIT = COLUMN_LIMIT;
  exports.EMPTY_FILE = EMPTY_FILE;
  exports.EMPTY_VALUE = EMPTY_VALUE;
  exports.LOOP_SENTINEL = LOOP_SENTINEL;
  exports.NODE_AUTH_TOKEN = NODE_AUTH_TOKEN;
  exports.NODE_ENV = NODE_ENV;
  exports.UNDEFINED_TOKEN = UNDEFINED_TOKEN;
  exports.UNKNOWN_ERROR = UNKNOWN_ERROR;
  exports.UNKNOWN_VALUE = UNKNOWN_VALUE;
  exports.V = V;
  exports.kInternalsSymbol = kInternalsSymbol;
});

var require_runtime = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Runtime environment detection constants. All checks use only
   *   `typeof`-safe global probes so this module is safe to import in browser,
   *   Node.js, Deno, Bun, and bundled contexts alike.
   */
  /**
   * True when running inside a Node.js process. Detected via
   * `process.versions.node` — present in Node, absent in browsers and Deno/Bun
   * which expose a different `process.versions` shape (or no `process` at all).
   */
  const IS_NODE =
    typeof process !== "undefined" &&
    typeof process.versions !== "undefined" &&
    typeof process.versions.node === "string";
  /**
   * True when running in a browser context (window + document both defined).
   * Note: Chrome extensions have `window` in popup contexts but not in service
   * workers — check `IS_SERVICE_WORKER` for that case.
   */
  const IS_BROWSER =
    typeof globalThis !== "undefined" &&
    "window" in globalThis &&
    typeof globalThis.window !== "undefined" &&
    "document" in globalThis &&
    typeof globalThis.document !== "undefined";
  /**
   * True when running inside a Web Worker / Chrome MV3 service worker. `self` is
   * defined without `window` in worker contexts.
   */
  const IS_WORKER =
    "self" in globalThis &&
    typeof globalThis.self !== "undefined" &&
    !("window" in globalThis) &&
    !("document" in globalThis);
  exports.IS_BROWSER = IS_BROWSER;
  exports.IS_NODE = IS_NODE;
  exports.IS_WORKER = IS_WORKER;
});

var require_module = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_runtime = require_runtime();
  let module$1 = __require("module");
  /**
   * @file Accessors for `node:module` that work across runtimes. Ambient
   *   `require` is bound in CommonJS but unbound in ESM and inside
   *   ahead-of-time-compiled package modules (e.g. Perry), where reading it
   *   throws. And Perry's `require('module')` value omits `isBuiltin`. So instead
   *   of the ambient `require('module')` lazy-loader, `isBuiltin`/`createRequire`
   *   are imported as named values from the bare `module` specifier — which
   *   resolves on Node and Perry, and which browser bundlers can stub via
   *   resolve.fallback (a `node:` prefix would throw UnhandledSchemeError
   *   there).
   *   `require` is DIRECTORY-SPECIFIC: `createRequire(base)` resolves relative
   *   specifiers (`./x`, `../y`) from `base`'s directory. For builtins and bare
   *   packages that's irrelevant since they resolve the same anywhere, so the
   *   cached `getRequire` / `requireBuiltin` bind to THIS file. A RELATIVE
   *   specifier must resolve from the CALLER's directory, so use `requireFrom`
   *   with the caller's `import.meta.url` — binding such a load to this file
   *   would resolve it against `src/node/` instead. Bundled, every module
   *   collapses to one base and either works; unbundled (e.g. AOT-compiled from
   *   source), each module sits at its own nested path and the base matters.
   */
  let cachedModule;
  let cachedRequire;
  /**
   * Bind a working `require`. Ambient `require` exists in CommonJS; in ESM and
   * ahead-of-time-compiled package modules it is unbound (reading it throws or
   * yields undefined), so fall back to `createRequire`. Returns undefined off
   * Node and in browsers, where neither is available.
   *
   * `fromUrl` sets the resolution base — pass a caller's `import.meta.url` to
   * resolve that caller's RELATIVE specifiers. When omitted, the base is this
   * file, which is correct only for builtins / bare packages (dir-independent).
   * With `fromUrl` the ambient `require` is skipped: it is bound to THIS file, so
   * it would resolve a relative specifier from the wrong directory.
   */
  function bindRequire(fromUrl) {
    if (!require_constants_runtime.IS_NODE) return;
    if (!fromUrl && typeof __require === "function") return __require;
    if (typeof module$1.createRequire === "function")
      try {
        return (0, module$1.createRequire)(
          fromUrl ?? __require("url").pathToFileURL(__filename).href,
        );
      } catch {
        return;
      }
  }
  /**
   * Returns `node:module` loaded through the bound `require`, or undefined off
   * Node. Cached across calls.
   */
  function getNodeModule() {
    return (cachedModule ??= requireBuiltin("module"));
  }
  /**
   * Returns a working `require` bound to THIS file, binding one on first call
   * (see bindRequire). Cached across calls; undefined off Node / in browsers.
   *
   * For builtins and bare packages only — the resolution base is this file, so a
   * relative specifier would resolve from `src/node/`. Use `requireFrom` for
   * relative loads.
   */
  function getRequire() {
    if (cachedRequire === void 0) cachedRequire = bindRequire();
    return cachedRequire;
  }
  /**
   * Is `name` a Node built-in module? Resolved from the statically-imported
   * `isBuiltin`, so it works on Node and on ahead-of-time-compiled binaries
   * (Perry), where ambient `require('module')` would lack `isBuiltin`. Returns
   * false in browsers, where the bare `module` import is stubbed away.
   *
   * Single source of truth for "is this a Node builtin?" probes across socket-lib
   * (used by the smol-binding loaders to gate their `node:smol-*` loads).
   */
  function isNodeBuiltin(name) {
    if (
      !require_constants_runtime.IS_NODE ||
      typeof module$1.isBuiltin !== "function"
    )
      return false;
    return (0, module$1.isBuiltin)(name);
  }
  /**
   * Load a built-in module by *computed* specifier through the bound `require`
   * (see getRequire). The specifier is a parameter — never a literal at the call
   * site — so browser bundlers neither walk nor bundle it. Returns undefined
   * where no `require` can be bound.
   *
   * Builtins / bare packages only (dir-independent); for a relative specifier use
   * `requireFrom`. Used by `getNodeModule` for `node:module`, and by the
   * smol-binding loaders for the optional `node:smol-*` native bindings (gated
   * behind `isNodeBuiltin`, true only on socket-btm's smol Node binary).
   */
  function requireBuiltin(specifier) {
    const req = getRequire();
    if (req) return req(specifier);
  }
  /**
   * Load a module by specifier from a CALLER-supplied base (its
   * `import.meta.url`). Use this for RELATIVE specifiers (`./x`, `../y`), whose
   * resolution depends on the caller's directory — `requireBuiltin` binds to this
   * file and would resolve them from `src/node/`. Not cached: the binding is
   * per-caller. Returns undefined where no `require` can be bound.
   */
  function requireFrom(fromUrl, specifier) {
    const req = bindRequire(fromUrl);
    if (req) return req(specifier);
  }
  exports.bindRequire = bindRequire;
  exports.getNodeModule = getNodeModule;
  exports.getRequire = getRequire;
  exports.isNodeBuiltin = isNodeBuiltin;
  exports.requireBuiltin = requireBuiltin;
  exports.requireFrom = requireFrom;
});

var require_detect = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_module = require_module();
  /**
   * @file Smol detection + lazy-loader for `node:smol-util`. Two
   *   responsibilities:
   *
   *   1. `isSmol()` — memoized boolean detector for socket-btm's smol Node binary.
   *      Mirrors `isSeaBinary()` from `src/sea.ts`. Probes via
   *      `node:module.isBuiltin('node:smol-util')` since only the smol binary
   *      registers any `node:smol-*` builtins.
   *   2. `getSmolUtil()` — lazy-loader for the `node:smol-util` binding, which
   *      provides native `uncurryThis` and `applyBind` (single V8 dispatch via
   *      `args.Data()` + `v8::Function::Call`, skipping the BoundFunction
   *      adapter
   *
   *   - `Function.prototype.call` trampoline that the JS form `bind.bind(call)(fn)`
   *     hits twice per invocation). ~2x faster on hot uncurried-call sites.
   *     `getSmolUtil()` returns `undefined` on stock Node
   *   - non-Node runtimes. Result is cached across calls; the lazy-loader follows
   *     the same shape as `src/node/fs.ts` etc.
   *
   * @see https://github.com/SocketDev/socket-btm — socket-btm builds
   *   the smol binary that exposes the `node:smol-util` binding.
   */
  /**
   * Cached smol-binary detection result.
   */
  let isSmolCache;
  /**
   * Cached `node:smol-util` binding. `null` = probed and unavailable; `undefined`
   * = not yet probed. JS truthiness collapses both to "no binding" at the call
   * site.
   */
  let smolUtilCache;
  let smolUtilProbed = false;
  /**
   * Returns `node:smol-util` when running on the smol Node binary, otherwise
   * `undefined`. Result is cached across calls.
   */
  function getSmolUtil() {
    if (!smolUtilProbed) {
      smolUtilProbed = true;
      /* c8 ignore start - smol Node binary only. */
      if (require_node_module.isNodeBuiltin("node:smol-util"))
        smolUtilCache = require_node_module.requireBuiltin("node:smol-util");
    }
    return smolUtilCache;
  }
  /**
   * Detect if the current process is running on socket-btm's smol Node binary.
   * Memoized on first call.
   *
   * Defensive across runtimes: returns `false` on stock Node, browsers (no
   * `node:module`), Deno and Bun, whose module resolution differs, and worker
   * threads, each of which has its own builtin table.
   *
   * @example
   *   ;```ts
   *   import { isSmol } from '@socketsecurity/lib/exe/smol/detect'
   *
   *   if (isSmol()) {
   *     // running on the smol binary; native fast paths available
   *   }
   *   ```
   */
  function isSmol() {
    if (isSmolCache === void 0)
      isSmolCache = require_node_module.isNodeBuiltin("node:smol-util");
    return isSmolCache;
  }
  exports.getSmolUtil = getSmolUtil;
  exports.isSmol = isSmol;
});

var require_uncurry = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file `uncurryThis` and the cluster of helpers built atop it. Mirrors
   *   Node.js's internal/per_context/primordials.js. Every other primordials leaf
   *   depends on `uncurryThis` to expose prototype-method primordials, so this
   *   file must be import-safe before any of them. Smol fast paths
   *   (`node:smol-util`) replace the JS forms when running on socket-btm's smol
   *   Node binary; stock Node and other runtimes fall back to the standard
   *   `bind.bind(call)` shape. **IMPORTANT**: do not destructure on `globalThis`
   *   or `Reflect` here. tsgo has a bug that mis-transpiles destructured exports.
   *   See: https://github.com/SocketDev/socket-packageurl-js/issues/3.
   */
  const smolUtil = require_detect().getSmolUtil();
  const { apply, bind, call } = Function.prototype;
  const uncurryThis = smolUtil?.uncurryThis ?? bind.bind(call);
  const applyBind = smolUtil?.applyBind ?? bind.bind(apply);
  const applyBoundForSafe = applyBind;
  const applySafe =
    smolUtil?.applySafe ??
    ((fn) => {
      const apply2 = applyBoundForSafe(fn);
      return (self, args) => {
        try {
          return apply2(self, args);
        } catch {
          return;
        }
      };
    });
  const bindCallFallback = (fn, thisArg, ...presetArgs) =>
    Function.prototype.bind.apply(fn, [thisArg, ...presetArgs]);
  const bindCall = smolUtil?.bindCall ?? bindCallFallback;
  const weakRefSafe =
    smolUtil?.weakRefSafe ??
    ((target) => {
      try {
        return new WeakRef(target);
      } catch {
        return;
      }
    });
  exports.applyBind = applyBind;
  exports.applySafe = applySafe;
  exports.bindCall = bindCall;
  exports.uncurryThis = uncurryThis;
  exports.weakRefSafe = weakRefSafe;
});

var require_object = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `Object` static methods and prototype methods. Annex
   *   B legacy accessor methods (`__defineGetter__`, `__lookupGetter__`, etc.)
   *   are exposed alongside the canonical static methods — implementations exist
   *   in V8, SpiderMonkey, and JavaScriptCore even though the spec calls them
   *   "normative optional".
   */
  const ObjectCtor = Object;
  const ObjectAssign = Object.assign;
  const ObjectCreate = Object.create;
  const ObjectDefineProperties = Object.defineProperties;
  const ObjectDefineProperty = Object.defineProperty;
  const ObjectEntries = Object.entries;
  const ObjectFreeze = Object.freeze;
  const ObjectFromEntries = Object.fromEntries;
  const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
  const ObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
  const ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
  const ObjectGetPrototypeOf = Object.getPrototypeOf;
  const ObjectHasOwn = Object.hasOwn;
  const ObjectIs = Object.is;
  const ObjectIsExtensible = Object.isExtensible;
  const ObjectIsFrozen = Object.isFrozen;
  const ObjectIsSealed = Object.isSealed;
  const ObjectKeys = Object.keys;
  const ObjectPreventExtensions = Object.preventExtensions;
  const ObjectSeal = Object.seal;
  const ObjectSetPrototypeOf = Object.setPrototypeOf;
  const ObjectValues = Object.values;
  const ObjectPrototype = Object.prototype;
  const ObjectPrototypeHasOwnProperty = require_primordials_uncurry.uncurryThis(
    Object.prototype.hasOwnProperty,
  );
  const ObjectPrototypeIsPrototypeOf = require_primordials_uncurry.uncurryThis(
    Object.prototype.isPrototypeOf,
  );
  const ObjectPrototypePropertyIsEnumerable =
    require_primordials_uncurry.uncurryThis(
      Object.prototype.propertyIsEnumerable,
    );
  const ObjectPrototypeToString = require_primordials_uncurry.uncurryThis(
    Object.prototype.toString,
  );
  const ObjectPrototypeValueOf = require_primordials_uncurry.uncurryThis(
    Object.prototype.valueOf,
  );
  const objectProto = Object.prototype;
  const ObjectPrototypeDefineGetter = require_primordials_uncurry.uncurryThis(
    objectProto.__defineGetter__,
  );
  const ObjectPrototypeDefineSetter = require_primordials_uncurry.uncurryThis(
    objectProto.__defineSetter__,
  );
  const ObjectPrototypeLookupGetter = require_primordials_uncurry.uncurryThis(
    objectProto.__lookupGetter__,
  );
  const ObjectPrototypeLookupSetter = require_primordials_uncurry.uncurryThis(
    objectProto.__lookupSetter__,
  );
  exports.ObjectAssign = ObjectAssign;
  exports.ObjectCreate = ObjectCreate;
  exports.ObjectCtor = ObjectCtor;
  exports.ObjectDefineProperties = ObjectDefineProperties;
  exports.ObjectDefineProperty = ObjectDefineProperty;
  exports.ObjectEntries = ObjectEntries;
  exports.ObjectFreeze = ObjectFreeze;
  exports.ObjectFromEntries = ObjectFromEntries;
  exports.ObjectGetOwnPropertyDescriptor = ObjectGetOwnPropertyDescriptor;
  exports.ObjectGetOwnPropertyDescriptors = ObjectGetOwnPropertyDescriptors;
  exports.ObjectGetOwnPropertyNames = ObjectGetOwnPropertyNames;
  exports.ObjectGetOwnPropertySymbols = ObjectGetOwnPropertySymbols;
  exports.ObjectGetPrototypeOf = ObjectGetPrototypeOf;
  exports.ObjectHasOwn = ObjectHasOwn;
  exports.ObjectIs = ObjectIs;
  exports.ObjectIsExtensible = ObjectIsExtensible;
  exports.ObjectIsFrozen = ObjectIsFrozen;
  exports.ObjectIsSealed = ObjectIsSealed;
  exports.ObjectKeys = ObjectKeys;
  exports.ObjectPreventExtensions = ObjectPreventExtensions;
  exports.ObjectPrototype = ObjectPrototype;
  exports.ObjectPrototypeDefineGetter = ObjectPrototypeDefineGetter;
  exports.ObjectPrototypeDefineSetter = ObjectPrototypeDefineSetter;
  exports.ObjectPrototypeHasOwnProperty = ObjectPrototypeHasOwnProperty;
  exports.ObjectPrototypeIsPrototypeOf = ObjectPrototypeIsPrototypeOf;
  exports.ObjectPrototypeLookupGetter = ObjectPrototypeLookupGetter;
  exports.ObjectPrototypeLookupSetter = ObjectPrototypeLookupSetter;
  exports.ObjectPrototypePropertyIsEnumerable =
    ObjectPrototypePropertyIsEnumerable;
  exports.ObjectPrototypeToString = ObjectPrototypeToString;
  exports.ObjectPrototypeValueOf = ObjectPrototypeValueOf;
  exports.ObjectSeal = ObjectSeal;
  exports.ObjectSetPrototypeOf = ObjectSetPrototypeOf;
  exports.ObjectValues = ObjectValues;
});

var require_error$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Safe references to `Error` and its subclass constructors, plus V8's
   *   stack-trace API. `Error.isError` is ES2025; `captureStackTrace` /
   *   `prepareStackTrace` / `stackTraceLimit` are V8 extensions absent on
   *   JavaScriptCore and SpiderMonkey. Each is typed `Function | undefined` so
   *   non-V8 importers stay safe.
   */
  const ErrorCtor = Error;
  const AggregateErrorCtor = AggregateError;
  const EvalErrorCtor = EvalError;
  const RangeErrorCtor = RangeError;
  const ReferenceErrorCtor = ReferenceError;
  const SyntaxErrorCtor = SyntaxError;
  const TypeErrorCtor = TypeError;
  const URIErrorCtor = URIError;
  const ErrorIsError = Error.isError;
  const ErrorCaptureStackTrace = Error.captureStackTrace;
  const ErrorPrepareStackTrace = Error.prepareStackTrace;
  const stackTraceLimitGetter = (() => {
    const getter = Error.__lookupGetter__?.("stackTraceLimit");
    /* c8 ignore start */
    if (typeof getter === "function") return () => getter.call(Error);
    /* c8 ignore stop */
  })();
  function ErrorStackTraceLimit() {
    /* c8 ignore start - non-V8 fallback path unreachable under test */
    if (stackTraceLimitGetter) return stackTraceLimitGetter();
    return Error.stackTraceLimit;
    /* c8 ignore stop */
  }
  exports.AggregateErrorCtor = AggregateErrorCtor;
  exports.ErrorCaptureStackTrace = ErrorCaptureStackTrace;
  exports.ErrorCtor = ErrorCtor;
  exports.ErrorIsError = ErrorIsError;
  exports.ErrorPrepareStackTrace = ErrorPrepareStackTrace;
  exports.ErrorStackTraceLimit = ErrorStackTraceLimit;
  exports.EvalErrorCtor = EvalErrorCtor;
  exports.RangeErrorCtor = RangeErrorCtor;
  exports.ReferenceErrorCtor = ReferenceErrorCtor;
  exports.SyntaxErrorCtor = SyntaxErrorCtor;
  exports.TypeErrorCtor = TypeErrorCtor;
  exports.URIErrorCtor = URIErrorCtor;
});

var require_primordial = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_module = require_module();
  /**
   * @file Lazy-loader for socket-btm's `node:smol-primordial` binding.
   *   `node:smol-primordial` provides V8 Fast API typed implementations of Math.*
   *   and Number.is* primordials, registered with `CFunction::Make()` so TurboFan
   *   inlines them directly into JIT- compiled JS callers. Bypasses the
   *   FunctionCallbackInfo trampoline entirely — ~30-50% gain on hot loops where
   *   V8 doesn't already auto-inline. Returns `undefined` on stock Node +
   *   non-Node runtimes. Result is cached across calls.
   *
   * @internal — used by `src/primordials.ts` to resolve smol-aware
   *   Math.* / Number.is* fast paths. Most callers should use the
   *   standard `primordials` exports, which already route through this
   *   when smol is present.
   *
   * @see https://v8.dev/blog/v8-release-99 — V8 Fast API Calls overview
   */
  let smolPrimordial;
  let smolPrimordialProbed = false;
  /**
   * Returns `node:smol-primordial` when running on the smol Node binary,
   * otherwise `undefined`. Result is cached across calls.
   */
  function getSmolPrimordial() {
    if (!smolPrimordialProbed) {
      smolPrimordialProbed = true;
      /* c8 ignore start - smol Node binary only. */
      if (require_node_module.isNodeBuiltin("node:smol-primordial"))
        smolPrimordial = require_node_module.requireBuiltin(
          "node:smol-primordial",
        );
    }
    return smolPrimordial;
  }
  exports.getSmolPrimordial = getSmolPrimordial;
});

var require_string$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `String` static methods and prototype methods.
   *   `StringPrototypeCharCodeAt` prefers the smol Fast API binding for ASCII
   *   inputs, which reduces to a single byte load, and translates the `-1` Fast
   *   API sentinel back to `NaN` to preserve spec parity. Two-byte strings fall
   *   back to the uncurried `String.prototype.charCodeAt`.
   *
   *   ## Fast API surface — and why it's small
   *
   *   Mirrors the design rationale from socket-btm's `primordial_binding.cc`
   *   (lines 41-72). The smol Fast API exposes exactly one string op
   *   (`stringCharCodeAt`) because that's the one shape where the C++ trampoline
   *   genuinely beats V8's existing hot path: a single ASCII byte load, no
   *   encoding dispatch, no HandleScope, returns a primitive. String **searches**
   *   (`startsWith` / `endsWith` / `includes` / `indexOf` / `lastIndexOf`) are
   *   intentionally NOT exposed. V8's existing hot path dispatches on encoding
   *   and runs native SIMD memcmp — a Fast API binding would add overhead without
   *   winning. Same for `Map.has` / `Set.has` / `Array.includes`. Fast API also
   *   has a hard constraint: a fast-path function cannot return a new V8 object —
   *   only primitives, Local<Value/Object/Array>, or FastOneByteString. That
   *   rules out anything that produces a new string (`slice`, `substring`,
   *   `toUpperCase`, `concat`, `repeat`, `padStart`/`padEnd`, formatted-number)
   *   from ever being a Fast API win on the return path. Net: the current surface
   *   is approximately the ceiling. Adding more Fast API string ops without a
   *   flamegraph showing the cost is a regression risk, not a perf win. See
   *   `socket-btm/packages/node-smol-builder/additions/source-patched/`
   *   `src/socketsecurity/primordial/primordial_binding.cc:41-72` for the
   *   canonical design statement.
   */
  const smolPrimordial = require_primordial().getSmolPrimordial();
  const StringCtor = String;
  const StringFromCharCode = String.fromCharCode;
  const StringFromCodePoint = String.fromCodePoint;
  const StringRaw = String.raw;
  const StringPrototypeAt = require_primordials_uncurry.uncurryThis(
    String.prototype.at,
  );
  const StringPrototypeCharAt = require_primordials_uncurry.uncurryThis(
    String.prototype.charAt,
  );
  const smolCharCodeAt = smolPrimordial?.stringCharCodeAt;
  /* c8 ignore start - the smol Fast API binding ships only on socket-btm's smol Node binary, so this body cannot run under the stock-Node runner */
  function smolStringCharCodeAt(s, i) {
    const code = smolCharCodeAt(s, i);
    return code === -1 ? NaN : code;
  }
  /* c8 ignore stop */
  const StringPrototypeCharCodeAt = smolCharCodeAt
    ? smolStringCharCodeAt
    : require_primordials_uncurry.uncurryThis(String.prototype.charCodeAt);
  const StringPrototypeCodePointAt = require_primordials_uncurry.uncurryThis(
    String.prototype.codePointAt,
  );
  const StringPrototypeConcat = require_primordials_uncurry.uncurryThis(
    String.prototype.concat,
  );
  const StringPrototypeEndsWith = require_primordials_uncurry.uncurryThis(
    String.prototype.endsWith,
  );
  const StringPrototypeIncludes = require_primordials_uncurry.uncurryThis(
    String.prototype.includes,
  );
  const StringPrototypeIndexOf = require_primordials_uncurry.uncurryThis(
    String.prototype.indexOf,
  );
  const StringPrototypeIsWellFormed =
    smolPrimordial?.stringIsWellFormed ??
    require_primordials_uncurry.uncurryThis(String.prototype.isWellFormed);
  const StringPrototypeLastIndexOf = require_primordials_uncurry.uncurryThis(
    String.prototype.lastIndexOf,
  );
  const StringPrototypeLocaleCompare = require_primordials_uncurry.uncurryThis(
    String.prototype.localeCompare,
  );
  const StringPrototypeMatch = require_primordials_uncurry.uncurryThis(
    String.prototype.match,
  );
  const StringPrototypeMatchAll = require_primordials_uncurry.uncurryThis(
    String.prototype.matchAll,
  );
  const StringPrototypeNormalize = require_primordials_uncurry.uncurryThis(
    String.prototype.normalize,
  );
  const StringPrototypePadEnd = require_primordials_uncurry.uncurryThis(
    String.prototype.padEnd,
  );
  const StringPrototypePadStart = require_primordials_uncurry.uncurryThis(
    String.prototype.padStart,
  );
  const StringPrototypeRepeat = require_primordials_uncurry.uncurryThis(
    String.prototype.repeat,
  );
  const StringPrototypeReplace = require_primordials_uncurry.uncurryThis(
    String.prototype.replace,
  );
  const StringPrototypeReplaceAll = require_primordials_uncurry.uncurryThis(
    String.prototype.replaceAll,
  );
  const StringPrototypeSearch = require_primordials_uncurry.uncurryThis(
    String.prototype.search,
  );
  const StringPrototypeSlice = require_primordials_uncurry.uncurryThis(
    String.prototype.slice,
  );
  const StringPrototypeSplit = require_primordials_uncurry.uncurryThis(
    String.prototype.split,
  );
  const StringPrototypeStartsWith = require_primordials_uncurry.uncurryThis(
    String.prototype.startsWith,
  );
  const StringPrototypeSubstring = require_primordials_uncurry.uncurryThis(
    String.prototype.substring,
  );
  const StringPrototypeToLocaleLowerCase =
    require_primordials_uncurry.uncurryThis(String.prototype.toLocaleLowerCase);
  const StringPrototypeToLocaleUpperCase =
    require_primordials_uncurry.uncurryThis(String.prototype.toLocaleUpperCase);
  const StringPrototypeToLowerCase = require_primordials_uncurry.uncurryThis(
    String.prototype.toLowerCase,
  );
  const StringPrototypeToString = require_primordials_uncurry.uncurryThis(
    String.prototype.toString,
  );
  const StringPrototypeToUpperCase = require_primordials_uncurry.uncurryThis(
    String.prototype.toUpperCase,
  );
  const StringPrototypeToWellFormed = require_primordials_uncurry.uncurryThis(
    String.prototype.toWellFormed,
  );
  const StringPrototypeTrim = require_primordials_uncurry.uncurryThis(
    String.prototype.trim,
  );
  const StringPrototypeTrimEnd = require_primordials_uncurry.uncurryThis(
    String.prototype.trimEnd,
  );
  const StringPrototypeTrimStart = require_primordials_uncurry.uncurryThis(
    String.prototype.trimStart,
  );
  const StringPrototypeValueOf = require_primordials_uncurry.uncurryThis(
    String.prototype.valueOf,
  );
  exports.StringCtor = StringCtor;
  exports.StringFromCharCode = StringFromCharCode;
  exports.StringFromCodePoint = StringFromCodePoint;
  exports.StringPrototypeAt = StringPrototypeAt;
  exports.StringPrototypeCharAt = StringPrototypeCharAt;
  exports.StringPrototypeCharCodeAt = StringPrototypeCharCodeAt;
  exports.StringPrototypeCodePointAt = StringPrototypeCodePointAt;
  exports.StringPrototypeConcat = StringPrototypeConcat;
  exports.StringPrototypeEndsWith = StringPrototypeEndsWith;
  exports.StringPrototypeIncludes = StringPrototypeIncludes;
  exports.StringPrototypeIndexOf = StringPrototypeIndexOf;
  exports.StringPrototypeIsWellFormed = StringPrototypeIsWellFormed;
  exports.StringPrototypeLastIndexOf = StringPrototypeLastIndexOf;
  exports.StringPrototypeLocaleCompare = StringPrototypeLocaleCompare;
  exports.StringPrototypeMatch = StringPrototypeMatch;
  exports.StringPrototypeMatchAll = StringPrototypeMatchAll;
  exports.StringPrototypeNormalize = StringPrototypeNormalize;
  exports.StringPrototypePadEnd = StringPrototypePadEnd;
  exports.StringPrototypePadStart = StringPrototypePadStart;
  exports.StringPrototypeRepeat = StringPrototypeRepeat;
  exports.StringPrototypeReplace = StringPrototypeReplace;
  exports.StringPrototypeReplaceAll = StringPrototypeReplaceAll;
  exports.StringPrototypeSearch = StringPrototypeSearch;
  exports.StringPrototypeSlice = StringPrototypeSlice;
  exports.StringPrototypeSplit = StringPrototypeSplit;
  exports.StringPrototypeStartsWith = StringPrototypeStartsWith;
  exports.StringPrototypeSubstring = StringPrototypeSubstring;
  exports.StringPrototypeToLocaleLowerCase = StringPrototypeToLocaleLowerCase;
  exports.StringPrototypeToLocaleUpperCase = StringPrototypeToLocaleUpperCase;
  exports.StringPrototypeToLowerCase = StringPrototypeToLowerCase;
  exports.StringPrototypeToString = StringPrototypeToString;
  exports.StringPrototypeToUpperCase = StringPrototypeToUpperCase;
  exports.StringPrototypeToWellFormed = StringPrototypeToWellFormed;
  exports.StringPrototypeTrim = StringPrototypeTrim;
  exports.StringPrototypeTrimEnd = StringPrototypeTrimEnd;
  exports.StringPrototypeTrimStart = StringPrototypeTrimStart;
  exports.StringPrototypeValueOf = StringPrototypeValueOf;
  exports.StringRaw = StringRaw;
  exports.smolStringCharCodeAt = smolStringCharCodeAt;
});

var require_predicates$2 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_object = require_object();
  const require_primordials_error = require_error$1();
  const require_primordials_string = require_string$1();
  /**
   * @file Error type-guard predicates — `isError` (with the `isErrorBuiltin` /
   *   `isErrorShim` building blocks) and the libuv errno-code narrower
   *   `isErrnoException`. Both are cross-realm-safe (they use `[[ErrorData]]`
   *   slot semantics rather than `instanceof Error`).
   */
  /**
   * Reference to the native ES2025 `Error.isError` when the running engine ships
   * it, otherwise `undefined`. Consumes the single primordial snapshot
   * ({@link ErrorIsError}) rather than re-probing the global — one capture point.
   * Exposed separately so tests and callers can detect the fast-path.
   */
  const isErrorBuiltin = require_primordials_error.ErrorIsError;
  /**
   * Narrow a caught value to a Node.js `ErrnoException` — an Error with a `.code`
   * string set by libuv/syscall failures (e.g. `'ENOENT'`, `'EACCES'`, `'EBUSY'`,
   * `'EPERM'`). Cross-realm safe (builds on {@link isError}), and checks that
   * `code` is a string so a merely branded Error without a real errno code
   * returns `false`.
   *
   * @example
   *   try {
   *     await fsPromises.readFile(path)
   *   } catch (e) {
   *     if (isErrnoException(e) && e.code === 'ENOENT') {
   *       // … retry, or return default …
   *     } else {
   *       throw e
   *     }
   *   }
   */
  function isErrnoException(value) {
    if (!isError(value)) return false;
    const code = value.code;
    if (typeof code !== "string" || code.length === 0) return false;
    const first = require_primordials_string.StringPrototypeCharCodeAt(code, 0);
    return first >= 65 && first <= 90;
  }
  /**
   * `Error.isError` fallback shim — the in-language approximation used when the
   * native ES2025 method isn't available.
   *
   * Exported separately so test suites on engines that ship the native method can
   * still exercise the shim branch directly. Consumers should prefer
   * {@link isError}, which picks the native method when present.
   */
  function isErrorShim(value) {
    if (value === null || typeof value !== "object") return false;
    return (
      require_primordials_object.ObjectPrototypeToString(value) ===
      "[object Error]"
    );
  }
  /**
   * Prefer the native ES2025 `Error.isError` when available (exact
   * `[[ErrorData]]` slot check, cross-realm-safe); fall back to
   * {@link isErrorShim} otherwise.
   */
  const isError = isErrorBuiltin ?? isErrorShim;
  exports.isErrnoException = isErrnoException;
  exports.isError = isError;
  exports.isErrorBuiltin = isErrorBuiltin;
  exports.isErrorShim = isErrorShim;
});

var require_map_set = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  const require_primordials_object = require_object();
  const require_primordials_error = require_error$1();
  /**
   * @file Safe references to `Map`, `Set`, `WeakMap`, `WeakSet`, and `WeakRef`.
   *   Constructors plus uncurried prototype methods. `WeakRef` exposes only its
   *   constructor — there's a separate `weakRefSafe` wrapper in `./uncurry` for
   *   the throws-on-non-Object case.
   */
  const MapCtor = Map;
  const SetCtor = Set;
  const WeakMapCtor = WeakMap;
  const WeakRefCtor = WeakRef;
  const WeakSetCtor = WeakSet;
  const MapPrototypeClear = require_primordials_uncurry.uncurryThis(
    Map.prototype.clear,
  );
  const MapPrototypeDelete = require_primordials_uncurry.uncurryThis(
    Map.prototype.delete,
  );
  const MapPrototypeEntries = require_primordials_uncurry.uncurryThis(
    Map.prototype.entries,
  );
  const MapPrototypeForEach = require_primordials_uncurry.uncurryThis(
    Map.prototype.forEach,
  );
  const MapPrototypeGet = require_primordials_uncurry.uncurryThis(
    Map.prototype.get,
  );
  const MapPrototypeGetOrInsert =
    Map.prototype.getOrInsert === void 0
      ? mapGetOrInsertFallback
      : require_primordials_uncurry.uncurryThis(Map.prototype.getOrInsert);
  const MapPrototypeGetOrInsertComputed =
    Map.prototype.getOrInsertComputed === void 0
      ? mapGetOrInsertComputedFallback
      : require_primordials_uncurry.uncurryThis(
          Map.prototype.getOrInsertComputed,
        );
  const MapPrototypeHas = require_primordials_uncurry.uncurryThis(
    Map.prototype.has,
  );
  const MapPrototypeKeys = require_primordials_uncurry.uncurryThis(
    Map.prototype.keys,
  );
  const MapPrototypeSet = require_primordials_uncurry.uncurryThis(
    Map.prototype.set,
  );
  const MapPrototypeValues = require_primordials_uncurry.uncurryThis(
    Map.prototype.values,
  );
  const SetPrototypeAdd = require_primordials_uncurry.uncurryThis(
    Set.prototype.add,
  );
  const SetPrototypeClear = require_primordials_uncurry.uncurryThis(
    Set.prototype.clear,
  );
  const SetPrototypeDelete = require_primordials_uncurry.uncurryThis(
    Set.prototype.delete,
  );
  const SetPrototypeDifference = require_primordials_uncurry.uncurryThis(
    Set.prototype.difference,
  );
  const SetPrototypeEntries = require_primordials_uncurry.uncurryThis(
    Set.prototype.entries,
  );
  const SetPrototypeForEach = require_primordials_uncurry.uncurryThis(
    Set.prototype.forEach,
  );
  const SetPrototypeHas = require_primordials_uncurry.uncurryThis(
    Set.prototype.has,
  );
  const SetPrototypeIntersection = require_primordials_uncurry.uncurryThis(
    Set.prototype.intersection,
  );
  const SetPrototypeIsDisjointFrom = require_primordials_uncurry.uncurryThis(
    Set.prototype.isDisjointFrom,
  );
  const SetPrototypeIsSubsetOf = require_primordials_uncurry.uncurryThis(
    Set.prototype.isSubsetOf,
  );
  const SetPrototypeIsSupersetOf = require_primordials_uncurry.uncurryThis(
    Set.prototype.isSupersetOf,
  );
  const SetPrototypeKeys = require_primordials_uncurry.uncurryThis(
    Set.prototype.keys,
  );
  const SetPrototypeSymmetricDifference =
    require_primordials_uncurry.uncurryThis(Set.prototype.symmetricDifference);
  const SetPrototypeUnion = require_primordials_uncurry.uncurryThis(
    Set.prototype.union,
  );
  const SetPrototypeValues = require_primordials_uncurry.uncurryThis(
    Set.prototype.values,
  );
  const SetPrototypeSizeGetter = require_primordials_uncurry.uncurryThis(
    require_primordials_object.ObjectGetOwnPropertyDescriptor(
      Set.prototype,
      "size",
    ).get,
  );
  const WeakMapPrototypeDelete = require_primordials_uncurry.uncurryThis(
    WeakMap.prototype.delete,
  );
  const WeakMapPrototypeGet = require_primordials_uncurry.uncurryThis(
    WeakMap.prototype.get,
  );
  const WeakMapPrototypeGetOrInsert =
    WeakMap.prototype.getOrInsert === void 0
      ? weakMapGetOrInsertFallback
      : require_primordials_uncurry.uncurryThis(WeakMap.prototype.getOrInsert);
  const WeakMapPrototypeGetOrInsertComputed =
    WeakMap.prototype.getOrInsertComputed === void 0
      ? weakMapGetOrInsertComputedFallback
      : require_primordials_uncurry.uncurryThis(
          WeakMap.prototype.getOrInsertComputed,
        );
  const WeakMapPrototypeHas = require_primordials_uncurry.uncurryThis(
    WeakMap.prototype.has,
  );
  const WeakMapPrototypeSet = require_primordials_uncurry.uncurryThis(
    WeakMap.prototype.set,
  );
  const WeakSetPrototypeAdd = require_primordials_uncurry.uncurryThis(
    WeakSet.prototype.add,
  );
  const WeakSetPrototypeDelete = require_primordials_uncurry.uncurryThis(
    WeakSet.prototype.delete,
  );
  const WeakSetPrototypeHas = require_primordials_uncurry.uncurryThis(
    WeakSet.prototype.has,
  );
  function mapGetOrInsertComputedFallback(map, key, callbackfn) {
    if (typeof callbackfn !== "function")
      throw new require_primordials_error.TypeErrorCtor(
        `getOrInsertComputed takes a callback. Saw ${typeof callbackfn}, wanted a function computing the value to insert.`,
      );
    if (MapPrototypeHas(map, key)) return MapPrototypeGet(map, key);
    const value = callbackfn(key);
    MapPrototypeSet(map, key, value);
    return value;
  }
  function mapGetOrInsertFallback(map, key, value) {
    if (MapPrototypeHas(map, key)) return MapPrototypeGet(map, key);
    MapPrototypeSet(map, key, value);
    return value;
  }
  function weakMapGetOrInsertComputedFallback(map, key, callbackfn) {
    if (typeof callbackfn !== "function")
      throw new require_primordials_error.TypeErrorCtor(
        `getOrInsertComputed takes a callback. Saw ${typeof callbackfn}, wanted a function computing the value to insert.`,
      );
    if (WeakMapPrototypeHas(map, key)) return WeakMapPrototypeGet(map, key);
    const value = callbackfn(key);
    WeakMapPrototypeSet(map, key, value);
    return value;
  }
  function weakMapGetOrInsertFallback(map, key, value) {
    if (WeakMapPrototypeHas(map, key)) return WeakMapPrototypeGet(map, key);
    WeakMapPrototypeSet(map, key, value);
    return value;
  }
  exports.MapCtor = MapCtor;
  exports.MapPrototypeClear = MapPrototypeClear;
  exports.MapPrototypeDelete = MapPrototypeDelete;
  exports.MapPrototypeEntries = MapPrototypeEntries;
  exports.MapPrototypeForEach = MapPrototypeForEach;
  exports.MapPrototypeGet = MapPrototypeGet;
  exports.MapPrototypeGetOrInsert = MapPrototypeGetOrInsert;
  exports.MapPrototypeGetOrInsertComputed = MapPrototypeGetOrInsertComputed;
  exports.MapPrototypeHas = MapPrototypeHas;
  exports.MapPrototypeKeys = MapPrototypeKeys;
  exports.MapPrototypeSet = MapPrototypeSet;
  exports.MapPrototypeValues = MapPrototypeValues;
  exports.SetCtor = SetCtor;
  exports.SetPrototypeAdd = SetPrototypeAdd;
  exports.SetPrototypeClear = SetPrototypeClear;
  exports.SetPrototypeDelete = SetPrototypeDelete;
  exports.SetPrototypeDifference = SetPrototypeDifference;
  exports.SetPrototypeEntries = SetPrototypeEntries;
  exports.SetPrototypeForEach = SetPrototypeForEach;
  exports.SetPrototypeHas = SetPrototypeHas;
  exports.SetPrototypeIntersection = SetPrototypeIntersection;
  exports.SetPrototypeIsDisjointFrom = SetPrototypeIsDisjointFrom;
  exports.SetPrototypeIsSubsetOf = SetPrototypeIsSubsetOf;
  exports.SetPrototypeIsSupersetOf = SetPrototypeIsSupersetOf;
  exports.SetPrototypeKeys = SetPrototypeKeys;
  exports.SetPrototypeSizeGetter = SetPrototypeSizeGetter;
  exports.SetPrototypeSymmetricDifference = SetPrototypeSymmetricDifference;
  exports.SetPrototypeUnion = SetPrototypeUnion;
  exports.SetPrototypeValues = SetPrototypeValues;
  exports.WeakMapCtor = WeakMapCtor;
  exports.WeakMapPrototypeDelete = WeakMapPrototypeDelete;
  exports.WeakMapPrototypeGet = WeakMapPrototypeGet;
  exports.WeakMapPrototypeGetOrInsert = WeakMapPrototypeGetOrInsert;
  exports.WeakMapPrototypeGetOrInsertComputed =
    WeakMapPrototypeGetOrInsertComputed;
  exports.WeakMapPrototypeHas = WeakMapPrototypeHas;
  exports.WeakMapPrototypeSet = WeakMapPrototypeSet;
  exports.WeakRefCtor = WeakRefCtor;
  exports.WeakSetCtor = WeakSetCtor;
  exports.WeakSetPrototypeAdd = WeakSetPrototypeAdd;
  exports.WeakSetPrototypeDelete = WeakSetPrototypeDelete;
  exports.WeakSetPrototypeHas = WeakSetPrototypeHas;
  exports.mapGetOrInsertComputedFallback = mapGetOrInsertComputedFallback;
  exports.mapGetOrInsertFallback = mapGetOrInsertFallback;
  exports.weakMapGetOrInsertComputedFallback =
    weakMapGetOrInsertComputedFallback;
  exports.weakMapGetOrInsertFallback = weakMapGetOrInsertFallback;
});

var require_pony_cause$1 = /* @__PURE__ */ __commonJSMin$1(
  (exports, module) => {
    const { SetCtor: _p_SetCtor } = require_map_set();
    var __commonJSMin = (cb, mod) => () => (
      mod || (cb((mod = { exports: {} }).exports, mod), (cb = null)),
      mod.exports
    );
    var require_error_with_cause = /* @__PURE__ */ __commonJSMin(
      (exports, module) => {
        module.exports = {
          ErrorWithCause: class ErrorWithCause extends Error {
            /**
             * @param {string} message
             * @param {{ cause?: T }} options
             */
            constructor(message, { cause } = {}) {
              super(message);
              /** @type {string} */
              this.name = ErrorWithCause.name;
              if (cause)
                /** @type {T} */
                this.cause = cause;
              /** @type {string} */
              this.message = message;
            }
          },
        };
      },
    );
    var require_helpers = /* @__PURE__ */ __commonJSMin((exports, module) => {
      const isError =
        typeof Error.isError === "function"
          ? Error.isError
          : (v) =>
              v !== null &&
              typeof v === "object" &&
              Object.prototype.toString.call(v) === "[object Error]";
      /**
       * @template {Error} T
       * @param {unknown} err
       * @param {new(...args: any[]) => T} reference
       * @returns {T|undefined}
       */
      const findCauseByReference = (err, reference) => {
        if (!err || !reference) return;
        if (!isError(err)) return;
        if (!(reference.prototype instanceof Error) && reference !== Error)
          return;
        /**
         * Ensures we don't go circular
         *
         * @type {Set<Error>}
         */
        const seen = /* @__PURE__ */ new _p_SetCtor();
        /** @type {Error|undefined} */
        let currentErr = err;
        while (currentErr && !seen.has(currentErr)) {
          seen.add(currentErr);
          if (currentErr instanceof reference) return currentErr;
          currentErr = getErrorCause(currentErr);
        }
      };
      /**
       * @param {Error|{ cause?: unknown|(()=>err)}} err
       * @returns {Error|undefined}
       */
      const getErrorCause = (err) => {
        if (!err || typeof err !== "object" || !("cause" in err)) return;
        if (typeof err.cause === "function") {
          const causeResult = err.cause();
          return isError(causeResult) ? causeResult : void 0;
        } else return isError(err.cause) ? err.cause : void 0;
      };
      /**
       * Internal method that keeps a track of which error we have already added, to avoid circular recursion
       *
       * @private
       * @param {Error} err
       * @param {Set<Error>} seen
       * @returns {string}
       */
      const _stackWithCauses = (err, seen) => {
        if (!isError(err)) return "";
        const stack = err.stack || "";
        if (seen.has(err)) return stack + "\ncauses have become circular...";
        const cause = getErrorCause(err);
        if (cause) {
          seen.add(err);
          return stack + "\ncaused by: " + _stackWithCauses(cause, seen);
        } else return stack;
      };
      /**
       * @param {Error} err
       * @returns {string}
       */
      const stackWithCauses = (err) =>
        _stackWithCauses(err, /* @__PURE__ */ new _p_SetCtor());
      /**
       * Internal method that keeps a track of which error we have already added, to avoid circular recursion
       *
       * @private
       * @param {Error} err
       * @param {Set<Error>} seen
       * @param {boolean} [skip]
       * @returns {string}
       */
      const _messageWithCauses = (err, seen, skip) => {
        if (!isError(err)) return "";
        const message = skip ? "" : err.message || "";
        if (seen.has(err)) return message + ": ...";
        const cause = getErrorCause(err);
        if (cause) {
          seen.add(err);
          const skipIfVErrorStyleCause =
            "cause" in err && typeof err.cause === "function";
          return (
            message +
            (skipIfVErrorStyleCause ? "" : ": ") +
            _messageWithCauses(cause, seen, skipIfVErrorStyleCause)
          );
        } else return message;
      };
      /**
       * @param {Error} err
       * @returns {string}
       */
      const messageWithCauses = (err) =>
        _messageWithCauses(err, /* @__PURE__ */ new _p_SetCtor());
      module.exports = {
        findCauseByReference,
        getErrorCause,
        stackWithCauses,
        messageWithCauses,
      };
    });
    var require_pony_cause = /* @__PURE__ */ __commonJSMin(
      (exports, module) => {
        const { ErrorWithCause } = require_error_with_cause();
        const {
          findCauseByReference,
          getErrorCause,
          messageWithCauses,
          stackWithCauses,
        } = require_helpers();
        module.exports = {
          ErrorWithCause,
          findCauseByReference,
          getErrorCause,
          stackWithCauses,
          messageWithCauses,
        };
      },
    );
    module.exports = require_pony_cause();
  },
);

var require_message = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_sentinels = require_sentinels();
  const require_errors_predicates = require_predicates$2();
  let src_external_pony_cause_js = require_pony_cause$1();
  /**
   * @file Human-readable error-message extractor. `errorMessage` walks the
   *   `cause` chain via pony-cause's `messageWithCauses` for Errors and falls
   *   back to the shared `UNKNOWN_ERROR` sentinel for everything else.
   *   `messageWithCauses` and `UNKNOWN_ERROR` are re-exported for callers that
   *   need them directly.
   */
  /**
   * Extract a human-readable message from any caught value.
   *
   * Walks the `cause` chain for Errors (via {@link messageWithCauses}); coerces
   * primitives and objects to string; returns {@link UNKNOWN_ERROR} for `null`,
   * `undefined`, empty strings, `[object Object]`, or Errors with no message.
   *
   * @example
   *   try {
   *     await readConfig(path)
   *   } catch (e) {
   *     throw new ErrorCtor(`Failed to read ${path}: ${errorMessage(e)}`, {
   *       cause: e,
   *     })
   *   }
   */
  function errorMessage(value) {
    if (require_errors_predicates.isError(value))
      return (
        (0, src_external_pony_cause_js.messageWithCauses)(value) ||
        "Unknown error"
      );
    if (value === null || value === void 0)
      return require_constants_sentinels.UNKNOWN_ERROR;
    const s = String(value);
    if (s === "" || s === "[object Object]")
      return require_constants_sentinels.UNKNOWN_ERROR;
    return s;
  }
  exports.UNKNOWN_ERROR = require_constants_sentinels.UNKNOWN_ERROR;
  exports.errorMessage = errorMessage;
  exports.messageWithCauses = src_external_pony_cause_js.messageWithCauses;
});

var import_message = require_message();
const DISTRUSTED_CA_SPKI_SHA256 = [
  "8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782",
  "bd153ed7b0434f6886b17bce8bbe84ed340c7132d702a8f4fa318f756ecbd6f3",
  "c619e4780ed8e0abeda24ad732567de4383a7ea941338f6d1a7d1b49ac792fe9",
];
const DISTRUSTED_SPKI_SHA256 = new Set(DISTRUSTED_CA_SPKI_SHA256);
const CERTIFICATE_PATTERN =
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [^-]*PRIVATE KEY-----/;
function extractCertificatePems(body, options) {
  const config = {
    __proto__: null,
    ...options,
  };
  if (PRIVATE_KEY_PATTERN.test(body))
    throw new Error(
      "TLS trust input contains private key material; provide public CA certificates only.",
    );
  const certificates = body.match(CERTIFICATE_PATTERN) ?? [];
  if (
    body
      .replace(CERTIFICATE_PATTERN, "")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
      .join("\n")
      .trim()
  )
    throw new Error(
      "TLS trust input contains data outside PEM certificates; provide a public CA PEM bundle.",
    );
  if (!certificates.length) {
    if (config.requireNonEmpty === false && !body.trim()) return [];
    throw new Error(
      "TLS trust input has no PEM CA certificates; provide a valid public CA bundle.",
    );
  }
  return certificates;
}
function parseTlsCertificate(pem, options) {
  const config = {
    __proto__: null,
    ...options,
  };
  let certificate;
  try {
    certificate = new crypto.X509Certificate(pem);
  } catch {
    throw new Error(
      "TLS trust input contains a malformed certificate; provide a valid public CA PEM bundle.",
    );
  }
  const spki = certificate.publicKey.export({
    type: "spki",
    format: "der",
  });
  const fingerprint = crypto.createHash("sha256").update(spki).digest("hex");
  if (DISTRUSTED_SPKI_SHA256.has(fingerprint))
    return { rejectedFingerprint: fingerprint };
  if (!certificate.ca) {
    if (config.skipNonCa) return {};
    throw new Error(
      "TLS trust input contains a non-CA certificate; provide CA certificates only.",
    );
  }
  return { certificate };
}
function filterTlsCertificates(body, options = {}) {
  const pems = extractCertificatePems(body, options);
  if (!pems.length)
    return {
      pem: "",
      certificates: [],
      rejectedFingerprints: [],
    };
  const accepted = [];
  const rejectedFingerprints = [];
  const seen = /* @__PURE__ */ new Set();
  for (const pem of pems) {
    const parsed = parseTlsCertificate(pem, { skipNonCa: options.skipNonCa });
    if (parsed.rejectedFingerprint) {
      rejectedFingerprints.push(parsed.rejectedFingerprint);
      continue;
    }
    if (!parsed.certificate) continue;
    const certificateFingerprint = crypto
      .createHash("sha256")
      .update(parsed.certificate.raw)
      .digest("hex");
    if (!seen.has(certificateFingerprint)) {
      seen.add(certificateFingerprint);
      accepted.push(pem.trim());
    }
  }
  if (!accepted.length && options.requireNonEmpty !== false)
    throw new Error(
      "TLS trust input has no trusted CA certificates after policy filtering.",
    );
  return {
    pem: accepted.length ? `${accepted.join("\n")}\n` : "",
    certificates: accepted,
    rejectedFingerprints,
  };
}
function optionTokens(value) {
  if (!value) return [];
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const character of value)
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") escaped = true;
    else if (quote) {
      if (character === quote) quote = "";
      else token += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else token += character;
  if (token) tokens.push(token);
  return tokens;
}
function inspectNodeOptions(args) {
  const conflicts = [];
  const errors = [];
  const conflictingFlags = args.filter((argument) => {
    return /^--(?:no[-_]use[-_]openssl[-_]ca|use[-_]bundled[-_]ca|use[-_]system[-_]ca)(?:=|$)/.test(
      argument,
    );
  });
  if (conflictingFlags.length) {
    conflicts.push(...conflictingFlags);
    errors.push(
      `Node TLS startup flags conflict with the filtered CA policy: ${conflictingFlags.join(", ")}.`,
    );
  }
  if (!args.some((argument) => /^--use[-_]openssl[-_]ca$/.test(argument)))
    errors.push("Node startup options must include --use-openssl-ca.");
  const rejectUnauthorizedIndex = args.findIndex((argument) =>
    /^--tls-reject[-_]unauthorized(?:=|$)/.test(argument),
  );
  const rejectUnauthorizedFlag = args[rejectUnauthorizedIndex];
  if (
    rejectUnauthorizedIndex >= 0 &&
    rejectUnauthorizedFlag !== void 0 &&
    (/^--tls-reject[-_]unauthorized=0$/.test(rejectUnauthorizedFlag) ||
      args[rejectUnauthorizedIndex + 1] === "0")
  ) {
    conflicts.push(rejectUnauthorizedFlag);
    errors.push("Node startup options disable TLS certificate checks.");
  }
  return {
    conflicts,
    errors,
  };
}
function inspectVerificationEnvironment(env) {
  const conflicts = [];
  const errors = [];
  if (env["NODE_TLS_REJECT_UNAUTHORIZED"] === "0") {
    conflicts.push("NODE_TLS_REJECT_UNAUTHORIZED=0");
    errors.push(
      "NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate checks.",
    );
  }
  if (env["NODE_USE_SYSTEM_CA"] === "1") {
    conflicts.push("NODE_USE_SYSTEM_CA=1");
    errors.push(
      "NODE_USE_SYSTEM_CA=1 adds system roots outside the filtered CA bundle.",
    );
  }
  const gitVerify = env["GIT_SSL_NO_VERIFY"];
  if (gitVerify !== void 0 && !/^(?:0|false|no|off)$/i.test(gitVerify.trim())) {
    conflicts.push("GIT_SSL_NO_VERIFY disables certificate checks");
    errors.push("GIT_SSL_NO_VERIFY disables TLS certificate checks.");
  }
  if (/^(?:0|false)$/i.test(env["CARGO_HTTP_SSL_VERIFY"]?.trim() ?? "")) {
    conflicts.push("CARGO_HTTP_SSL_VERIFY disables certificate checks");
    errors.push("CARGO_HTTP_SSL_VERIFY disables TLS certificate checks.");
  }
  if (env["UV_INSECURE_HOST"] !== void 0) {
    conflicts.push("UV_INSECURE_HOST disables certificate checks for a host");
    errors.push("UV_INSECURE_HOST bypasses TLS verification for a host.");
  }
  return {
    conflicts,
    errors,
  };
}
function inspectCertificateDirectory(env, controlledSslCertDir) {
  const conflicts = [];
  const errors = [];
  const warnings = [];
  const sslCertDir = env["SSL_CERT_DIR"];
  if (!sslCertDir)
    errors.push(
      "SSL_CERT_DIR must point to the managed empty certificate directory.",
    );
  else if (controlledSslCertDir && sslCertDir !== controlledSslCertDir) {
    conflicts.push("SSL_CERT_DIR is not the managed empty directory");
    errors.push(
      "SSL_CERT_DIR does not point to the managed empty certificate directory.",
    );
  } else if (!controlledSslCertDir) {
    conflicts.push("SSL_CERT_DIR is not verified empty");
    warnings.push(
      "SSL_CERT_DIR requires validation as an empty certificate directory.",
    );
  }
  return {
    conflicts,
    errors,
    warnings,
  };
}
function inspectTlsEnvironment(env, options = {}) {
  const config = {
    __proto__: null,
    ...options,
  };
  const parts = [
    inspectNodeOptions([
      ...optionTokens(env["NODE_OPTIONS"]),
      ...(config.execArgv ?? []),
    ]),
    inspectVerificationEnvironment(env),
  ];
  const conflicts = parts.flatMap((part) => part.conflicts);
  const errors = parts.flatMap((part) => part.errors);
  const directory = inspectCertificateDirectory(
    env,
    config.controlledSslCertDir,
  );
  conflicts.push(...directory.conflicts);
  errors.push(...directory.errors);
  const warnings = [...directory.warnings];
  if (config.platform === "win32")
    warnings.push(
      "Windows TLS trust persistence needs runtime-specific verification before it can be reported as enforced.",
    );
  return {
    ok: errors.length === 0 && conflicts.length === 0,
    conflicts,
    errors,
    warnings,
  };
}

/**
 * @file Dependency-free reads of platform CAs under their original environment.
 */
const execFileAsync = promisify(execFile);
const SYSTEM_CA_KEYS = ["SSL_CERT_FILE", "SSL_CERT_DIR"];
function captureTlsPlatformEnvironment(env) {
  return {
    SSL_CERT_FILE: env["SSL_CERT_FILE"] ?? null,
    SSL_CERT_DIR: env["SSL_CERT_DIR"] ?? null,
  };
}
async function readTlsPlatformRoots(kind, environment) {
  if (kind === "bundled" || !environment)
    return getCACertificates(kind).join("\n");
  const env = { ...process$1.env };
  for (const key of SYSTEM_CA_KEYS) {
    const value = environment[key];
    if (value === null) delete env[key];
    else if (typeof value === "string") env[key] = value;
    else
      throw new Error(
        "Original platform CA environment is invalid; rerun TLS trust setup.",
      );
  }
  return (
    await execFileAsync(
      process$1.execPath,
      [
        "--input-type=module",
        "--eval",
        "import { getCACertificates } from 'node:tls'; process.stdout.write(getCACertificates('system').join('\\n'));",
      ],
      {
        env,
        encoding: "utf8",
        timeout: 1e4,
        maxBuffer: 4194304,
      },
    )
  ).stdout;
}

/**
 * @file Dependency-free bounded public CA file reads for the setup action.
 */
const MAX_CA_BYTES = 4194304;
async function readTlsBootstrapCaFile(file, optional = false) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (
      optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return;
    throw new Error(`TLS trust source is unreadable: ${file}`);
  }
  try {
    if (!(await handle.stat()).isFile())
      throw new Error(`TLS trust source is not a regular file: ${file}`);
    const bytes = Buffer.alloc(4194305);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        length,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_CA_BYTES)
      throw new Error(`TLS trust source exceeds 4 MiB: ${file}`);
    return bytes.subarray(0, length).toString("utf8");
  } finally {
    await handle.close();
  }
}
async function validateTlsBootstrapSources(sources) {
  for (const source of sources) {
    if (source.key.startsWith("node-")) {
      const kind = source.key.slice(5);
      if (kind === "system" && !source.environment)
        throw new Error(
          "Original system CA environment is missing; rerun the setup action.",
        );
      const current = filterTlsCertificates(
        await readTlsPlatformRoots(kind, source.environment),
        {
          requireNonEmpty: false,
          skipNonCa: true,
        },
      ).pem;
      if (
        crypto.createHash("sha256").update(current).digest("hex") !==
        source.sha256
      )
        throw new Error(
          "Node platform CA trust changed; rerun the setup action.",
        );
      continue;
    }
    const current = await readTlsBootstrapCaFile(
      source.path,
      source.sha256 === "missing",
    );
    if (
      source.sha256 === "missing"
        ? current !== void 0
        : current === void 0 ||
          crypto.createHash("sha256").update(current).digest("hex") !==
            source.sha256
    )
      throw new Error(
        `TLS trust input changed: ${source.path}; rerun the setup action.`,
      );
  }
}

const TLS_CA_INPUT_KEYS = [
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
  "GIT_SSL_CAINFO",
  "GIT_PROXY_SSL_CAINFO",
  "CURL_CA_BUNDLE",
  "REQUESTS_CA_BUNDLE",
  "CARGO_HTTP_CAINFO",
  "CARGO_HTTP_PROXY_CAINFO",
  "SSL_CERT_DIR",
  "GIT_SSL_CAPATH",
  "SFW_CA_CERT_PATH",
];
const TLS_CA_FILE_KEYS = Object.freeze(
  TLS_CA_INPUT_KEYS.filter(
    (key) => key !== "SSL_CERT_DIR" && key !== "GIT_SSL_CAPATH",
  ),
);
const TLS_CA_SOURCE_KEYS = Object.freeze(
  TLS_CA_FILE_KEYS.filter((key) => key !== "SFW_CA_CERT_PATH"),
);
const TLS_SFW_BUNDLE_KEYS = Object.freeze(
  TLS_CA_SOURCE_KEYS.filter(
    (key) =>
      key === "SSL_CERT_FILE" ||
      key === "GIT_SSL_CAINFO" ||
      key === "GIT_PROXY_SSL_CAINFO" ||
      key === "CARGO_HTTP_CAINFO",
  ),
);
const TLS_MAX_CA_BYTES = 4194304;
const TLS_TRUST_DIRECTORY_NAME = "fleet-tls-trust";
const TLS_TRUST_EMPTY_DIRECTORY_NAME = "empty-ca-dir";
const TLS_TRUST_STATE_NAME = "state.json";
const TLS_TRUST_BASH_ENV_NAME = "bash-env";
const TLS_TRUST_HELPER_NAME = "tls-trust-bootstrap.generated.mjs";
const TLS_RUNTIME_DIRECTORY_PREFIX = "fleet-tls-runtime-";
function getTlsTrustRootPath(tempDirectory) {
  return path.join(tempDirectory, TLS_TRUST_DIRECTORY_NAME);
}
function getDefaultSfwCaCertificatePath(homeDirectory) {
  return path.join(homeDirectory, ".socket", "sfw", "ca.crt");
}
function getTlsTrustEmptyDirectoryPath(directory) {
  return path.join(directory, TLS_TRUST_EMPTY_DIRECTORY_NAME);
}
function getTlsTrustStatePath(directory) {
  return path.join(directory, TLS_TRUST_STATE_NAME);
}
function getTlsTrustBashEnvPath(directory) {
  return path.join(directory, TLS_TRUST_BASH_ENV_NAME);
}
function getTlsTrustHelperPath(directory) {
  return path.join(directory, TLS_TRUST_HELPER_NAME);
}
function getTlsTrustBundlePath(
  directory,
  key,
  sslCertFileName = "ca-bundle.pem",
) {
  const name =
    key === "SSL_CERT_FILE"
      ? sslCertFileName
      : `${key.toLowerCase().replaceAll("_", "-")}.pem`;
  return path.join(directory, name);
}
function getTlsRuntimeDirectoryPrefix(directory) {
  return path.join(directory, TLS_RUNTIME_DIRECTORY_PREFIX);
}

/**
 * @file Build independently filtered bundles for each configured CA source.
 */
const CA_SOURCE_KEYS = TLS_CA_SOURCE_KEYS;
async function readTlsTrustFile(file, options = {}) {
  const config = {
    __proto__: null,
    optional: false,
    ...options,
  };
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (
      config.optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return;
    throw new Error(`TLS trust source is unreadable: ${file}`);
  }
  try {
    if (!(await handle.stat()).isFile())
      throw new Error(`TLS trust source is not a regular file: ${file}`);
    const buffer = Buffer.alloc(TLS_MAX_CA_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      if (!result.bytesRead) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > 4194304)
      throw new Error(`TLS trust source exceeds 4 MiB: ${file}`);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}
function digest$1(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function savedInput(name, state) {
  return state?.sources.find(
    (source) => source.kind === "file" && source.name === name,
  )?.path;
}
function inputPath(name, env, state, trustDirectory) {
  const current = env[name];
  if (current === state?.bundlePaths[name]) return savedInput(name, state);
  if (current) {
    if (
      path
        .resolve(current)
        .startsWith(`${path.resolve(trustDirectory)}${path.sep}`)
    )
      throw new Error(
        `Managed TLS output has no valid source metadata: ${current}`,
      );
    return current;
  }
}
async function loadSource(name, file, options = {}) {
  const config = {
    __proto__: null,
    optional: false,
    ...options,
  };
  let body;
  try {
    body = await readTlsTrustFile(file, config);
    if (body === void 0)
      return {
        pem: "",
        source: {
          kind: "file",
          name,
          path: file,
          sha256: "missing",
        },
        rejected: [],
      };
  } catch (error) {
    if (
      config.optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return {
        pem: "",
        source: {
          kind: "file",
          name,
          path: file,
          sha256: "missing",
        },
        rejected: [],
      };
    throw error;
  }
  const filtered = filterTlsCertificates(body);
  return {
    pem: filtered.pem,
    source: {
      kind: "file",
      name,
      path: file,
      sha256: digest$1(body),
    },
    rejected: filtered.rejectedFingerprints,
  };
}
async function loadPlatformRoots(environment) {
  const pem = [];
  const sources = [];
  const rejected = [];
  const rootKinds = ["bundled", "system"];
  for (let index = 0; index < rootKinds.length; index += 1) {
    const name = rootKinds[index];
    const body = await readTlsPlatformRoots(
      name,
      name === "system" ? environment : void 0,
    );
    const filtered = filterTlsCertificates(body, {
      requireNonEmpty: false,
      skipNonCa: true,
    });
    if (filtered.pem) {
      pem.push(filtered.pem);
      rejected.push(...filtered.rejectedFingerprints);
    }
    sources.push({
      kind: "node-ca",
      name,
      ...(name === "system" ? { environment } : {}),
      sha256: digest$1(filtered.pem),
    });
  }
  return {
    pem: pem.join("\n"),
    sources,
    rejected,
  };
}
async function buildTlsBundles(config) {
  const { env, homeDir, state, trustDirectory } = config;
  const platformEnvironment =
    state?.sources.find(
      (source) => source.kind === "node-ca" && source.name === "system",
    )?.environment ?? captureTlsPlatformEnvironment(env);
  const sfw = await loadSource(
    "SFW_CA_CERT_PATH",
    env["SFW_CA_CERT_PATH"] ?? getDefaultSfwCaCertificatePath(homeDir),
    { optional: !env["SFW_CA_CERT_PATH"] },
  );
  const sources = sfw.source ? [sfw.source] : [];
  const rejected = [...sfw.rejected];
  const bundlePaths = {
    SSL_CERT_FILE: getTlsTrustBundlePath(trustDirectory, "SSL_CERT_FILE"),
  };
  const bundles = Object.create(null);
  const append = (name, pem) => {
    const filtered = filterTlsCertificates(
      [pem, sfw.pem].filter(Boolean).join("\n"),
    );
    bundles[name] = filtered.pem;
    rejected.push(...filtered.rejectedFingerprints);
  };
  const sslFile = inputPath("SSL_CERT_FILE", env, state, trustDirectory);
  if (sslFile) {
    const source = await loadSource("SSL_CERT_FILE", sslFile, {
      optional: false,
    });
    sources.push(source.source);
    rejected.push(...source.rejected);
    append("SSL_CERT_FILE", source.pem);
  } else {
    const platform = await loadPlatformRoots(platformEnvironment);
    sources.push(...platform.sources);
    rejected.push(...platform.rejected);
    append("SSL_CERT_FILE", platform.pem);
  }
  const extraCaKeys = CA_SOURCE_KEYS.slice(1);
  for (let index = 0; index < extraCaKeys.length; index += 1) {
    const name = extraCaKeys[index];
    const file = inputPath(name, env, state, trustDirectory);
    if (file) {
      const source = await loadSource(name, file, { optional: false });
      sources.push(source.source);
      rejected.push(...source.rejected);
      bundlePaths[name] = getTlsTrustBundlePath(trustDirectory, name);
      append(name, source.pem);
    } else {
      bundlePaths[name] = getTlsTrustBundlePath(trustDirectory, name);
      append(name, bundles["SSL_CERT_FILE"]);
    }
  }
  return {
    bundlePaths,
    bundles,
    sources,
    rejected: [...new Set(rejected)],
  };
}

/**
 * @file Dependency-free cleanup for trust files owned by one bootstrap call.
 */
/**
 * @param {string | undefined} directory
 * @param {string | undefined} [inheritedDirectory]
 *
 * @returns {void}
 */
function cleanupRuntimeTlsTrust(directory, inheritedDirectory) {
  if (!directory || directory === inheritedDirectory) return;
  if (
    realpathSync(path.dirname(directory)) !== realpathSync(os.tmpdir()) ||
    !/^fleet-tls-runtime-[A-Za-z0-9]+$/.test(path.basename(directory))
  )
    throw new Error("TLS bootstrap cleanup refused an unowned directory.");
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 63) !== 0)
    throw new Error("TLS bootstrap cleanup requires a private real directory.");
  rmSync(directory, {
    recursive: true,
    force: true,
  });
}

var require_fs$4 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const nodeFs = require_runtime().IS_NODE
    ? /*@__PURE__*/ __require("fs")
    : void 0;
  function getNodeFs() {
    return nodeFs;
  }
  const FsAccessSync = nodeFs?.accessSync;
  const FsExistsSync = nodeFs?.existsSync;
  const FsMkdirSync = nodeFs?.mkdirSync;
  const FsReadFileSync = nodeFs?.readFileSync;
  const FsRealpathSync = nodeFs?.realpathSync;
  const FsStatSync = nodeFs?.statSync;
  const FsWriteFileSync = nodeFs?.writeFileSync;
  exports.FsAccessSync = FsAccessSync;
  exports.FsExistsSync = FsExistsSync;
  exports.FsMkdirSync = FsMkdirSync;
  exports.FsReadFileSync = FsReadFileSync;
  exports.FsRealpathSync = FsRealpathSync;
  exports.FsStatSync = FsStatSync;
  exports.FsWriteFileSync = FsWriteFileSync;
  exports.getNodeFs = getNodeFs;
});

var require_predicates$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Array type-guard predicates. Currently just a re-export of native
   *   `Array.isArray` for consistency with the rest of the arrays surface — kept
   *   in its own leaf because it's runtime-trivial but conceptually a different
   *   concern from `chunk` / `unique` / `join`.
   */
  /**
   * Alias for native Array.isArray. Determines whether the passed value is an
   * array.
   *
   * This is a direct reference to the native `Array.isArray` method, providing a
   * type guard that narrows the type to an array type. Exported for consistency
   * with other array utilities in this module.
   *
   * @example
   *   ;```ts
   *   // Check if value is an array
   *   isArray([1, 2, 3])
   *   // Returns: true
   *
   *   isArray('not an array')
   *   // Returns: false
   *
   *   isArray(null)
   *   // Returns: false
   *
   *   // Type guard usage
   *   function processValue(value: unknown) {
   *     if (isArray(value)) {
   *       // TypeScript knows value is an array here
   *       console.log(value.length)
   *     }
   *   }
   *   ```
   *
   * @param value - The value to check.
   *
   * @returns `true` if the value is an array, `false` otherwise
   */
  const isArray = Array.isArray;
  exports.isArray = isArray;
});

var require_os = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const nodeOs = require_runtime().IS_NODE
    ? /*@__PURE__*/ __require("os")
    : void 0;
  function getNodeOs() {
    return nodeOs;
  }
  const OsArch = nodeOs?.arch;
  const OsHomedir = nodeOs?.homedir;
  const OsPlatform = nodeOs?.platform;
  const OsTmpdir = nodeOs?.tmpdir;
  exports.OsArch = OsArch;
  exports.OsHomedir = OsHomedir;
  exports.OsPlatform = OsPlatform;
  exports.OsTmpdir = OsTmpdir;
  exports.getNodeOs = getNodeOs;
});

var require_platform = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_os = require_os();
  const require_node_fs = require_fs$4();
  /**
   * @file Platform detection and OS-specific constants.
   */
  let memoizedArch;
  /**
   * Get the current CPU architecture (memoized), e.g. `x64`, `arm64`.
   */
  function getArch() {
    if (memoizedArch === void 0)
      memoizedArch = require_node_os.getNodeOs().arch();
    return memoizedArch;
  }
  const MUSL_LINKERS = [
    "/lib/ld-musl-x86_64.so.1",
    "/lib/ld-musl-aarch64.so.1",
    "/usr/lib/ld-musl-x86_64.so.1",
    "/usr/lib/ld-musl-aarch64.so.1",
  ];
  let memoizedLibc;
  let memoizedLibcProbed = false;
  /**
   * Get the host libc variant (memoized): `'musl'` on Alpine-and-similar,
   * `'glibc'` on other Linux, `undefined` off-Linux. Detected by probing for the
   * musl dynamic linker. The single source of truth for libc detection —
   * tool-specific resolvers (`getPythonArch`, `getJreArch`) call this rather than
   * re-probing.
   */
  function getLibc() {
    if (!memoizedLibcProbed) {
      memoizedLibcProbed = true;
      /* c8 ignore start - Linux-only filesystem probe. */
      if (getOs() !== "linux") memoizedLibc = void 0;
      else {
        memoizedLibc = "glibc";
        for (let i = 0, { length } = MUSL_LINKERS; i < length; i += 1)
          if (require_node_fs.getNodeFs().existsSync(MUSL_LINKERS[i])) {
            memoizedLibc = "musl";
            break;
          }
      }
    }
    return memoizedLibc;
  }
  let memoizedOs;
  /**
   * Get the current OS (memoized), e.g. `darwin`, `linux`, `win32` — the raw
   * `process.platform` value.
   */
  function getOs() {
    if (memoizedOs === void 0)
      memoizedOs = require_node_os.getNodeOs().platform();
    return memoizedOs;
  }
  let memoizedTarget;
  /**
   * Get the current host **target** in the pnpm `pack-app` vocabulary (memoized):
   * `<os>-<arch>[-<libc>]`, e.g. `darwin-arm64`, `linux-x64`, `win32-x64`,
   * `linux-x64-musl`. Raw Node `process.platform`/`process.arch` joined with `-`,
   * plus a `-musl` suffix on Alpine. This is the Socket-wide naming for
   * non-python / non-JRE tools (matches pnpm's release assets,
   * `pnpm-<os>-<arch>[-<libc>].{tar.gz,zip}`). Tool-specific resolvers that need
   * a different vocabulary own their own helper — see `getPythonArch` for
   * python-build-standalone and `getJreArch` for Adoptium.
   */
  function getTarget() {
    if (memoizedTarget === void 0) {
      const libcSuffix = getLibc() === "musl" ? "-musl" : "";
      memoizedTarget = `${getOs()}-${getArch()}${libcSuffix}`;
    }
    return memoizedTarget;
  }
  const DARWIN = getOs() === "darwin";
  const WIN32 = getOs() === "win32";
  /**
   * Returns whether the current platform is macOS. Callable predicate backed
   * by the module-load memo, so tests can mock the module.
   *
   * @returns `true` on darwin, `false` otherwise
   */
  function isDarwin() {
    return DARWIN;
  }
  /**
   * Returns whether the current platform is POSIX (anything but Windows).
   * Callable predicate backed by the module-load memo, so tests can mock the
   * module.
   *
   * @returns `true` on darwin/linux, `false` on win32
   */
  function isPosix() {
    return !WIN32;
  }
  /**
   * Returns whether the current platform is Windows. Callable predicate backed
   * by the module-load memo, so tests can mock the module.
   *
   * @returns `true` on win32, `false` otherwise
   */
  function isWin32() {
    return WIN32;
  }
  /**
   * True when this process was launched as a Chrome or Chromium native
   * messaging host. Chrome passes the extension origin URL
   * (`chrome-extension://<id>/`) as `process.argv[2]`; no other invocation shape
   * produces that prefix.
   */
  const NATIVE_MESSAGING_HOST =
    typeof process !== "undefined" &&
    typeof process.argv[2] === "string" &&
    process.argv[2].startsWith("chrome-extension://");
  const S_IXUSR = 64;
  const S_IXGRP = 8;
  const S_IXOTH = 1;
  exports.NATIVE_MESSAGING_HOST = NATIVE_MESSAGING_HOST;
  exports.S_IXGRP = S_IXGRP;
  exports.S_IXOTH = S_IXOTH;
  exports.S_IXUSR = S_IXUSR;
  exports.getArch = getArch;
  exports.getLibc = getLibc;
  exports.getOs = getOs;
  exports.getTarget = getTarget;
  exports.isDarwin = isDarwin;
  exports.isPosix = isPosix;
  exports.isWin32 = isWin32;
});

var require_url = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_runtime = require_runtime();
  let cachedUrl;
  /**
   * @unused No internal or Socket consumers; exercised only by its unit tests.
   */
  function getNodeUrl() {
    if (!require_constants_runtime.IS_NODE) return;
    return (cachedUrl ??= /*@__PURE__*/ __require("url"));
  }
  exports.getNodeUrl = getNodeUrl;
});

var require_buffer = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to Node's `Buffer` global. `Buffer` is a Node-only
   *   global; in browsers and in Deno without a compatibility shim the captured
   *   references are `undefined`. Cross- env consumers must null-check before
   *   calling.
   */
  const BufferCtor = globalThis.Buffer;
  const BufferAlloc = BufferCtor?.alloc;
  const BufferAllocUnsafe = BufferCtor?.allocUnsafe;
  const BufferAllocUnsafeSlow = BufferCtor?.allocUnsafeSlow;
  const BufferByteLength = BufferCtor?.byteLength;
  const BufferConcat = BufferCtor?.concat;
  const BufferFrom = BufferCtor?.from;
  const BufferIsBuffer = BufferCtor?.isBuffer;
  const BufferIsEncoding = BufferCtor?.isEncoding;
  /* c8 ignore start */
  const BufferPrototypeSlice = BufferCtor
    ? require_primordials_uncurry.uncurryThis(BufferCtor.prototype.slice)
    : void 0;
  const BufferPrototypeToString = BufferCtor
    ? require_primordials_uncurry.uncurryThis(BufferCtor.prototype.toString)
    : void 0;
  /* c8 ignore stop */
  exports.BufferAlloc = BufferAlloc;
  exports.BufferAllocUnsafe = BufferAllocUnsafe;
  exports.BufferAllocUnsafeSlow = BufferAllocUnsafeSlow;
  exports.BufferByteLength = BufferByteLength;
  exports.BufferConcat = BufferConcat;
  exports.BufferCtor = BufferCtor;
  exports.BufferFrom = BufferFrom;
  exports.BufferIsBuffer = BufferIsBuffer;
  exports.BufferIsEncoding = BufferIsEncoding;
  exports.BufferPrototypeSlice = BufferPrototypeSlice;
  exports.BufferPrototypeToString = BufferPrototypeToString;
});

var require_encoding = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Character encoding and character code constants. Exports the default
   *   UTF-8 encoding name and numeric char codes for common ASCII characters used
   *   by path and parsing utilities.
   */
  const UTF8 = "utf8";
  const CHAR_BACKWARD_SLASH = 92;
  const CHAR_COLON = 58;
  const CHAR_FORWARD_SLASH = 47;
  const CHAR_LOWERCASE_A = 97;
  const CHAR_LOWERCASE_Z = 122;
  const CHAR_UPPERCASE_A = 65;
  const CHAR_UPPERCASE_Z = 90;
  exports.CHAR_BACKWARD_SLASH = CHAR_BACKWARD_SLASH;
  exports.CHAR_COLON = CHAR_COLON;
  exports.CHAR_FORWARD_SLASH = CHAR_FORWARD_SLASH;
  exports.CHAR_LOWERCASE_A = CHAR_LOWERCASE_A;
  exports.CHAR_LOWERCASE_Z = CHAR_LOWERCASE_Z;
  exports.CHAR_UPPERCASE_A = CHAR_UPPERCASE_A;
  exports.CHAR_UPPERCASE_Z = CHAR_UPPERCASE_Z;
  exports.UTF8 = UTF8;
});

var require_shared$2 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_platform = require_platform();
  const require_primordials_string = require_string$1();
  const require_node_url = require_url();
  const require_primordials_buffer = require_buffer();
  const require_constants_encoding = require_encoding();
  /**
   * @file Shared internals for the `paths/` module — the leaf-level primitives
   *   every other path leaf depends on. Kept as a single file so `normalize`,
   *   `predicates`, `conversion`, and `resolve` can layer above it without
   *   circular imports.
   *
   *   - char-code constants + shared regexps
   *   - `pathLikeToString` — `string | Buffer | URL` → `string`
   *   - `normalizePath` and its `msysDriveToNative` / `foldPathForCompare` helpers
   *     — they live at the leaf because `conversion` and `resolve` call
   *     `normalizePath` and `predicates` calls `foldPathForCompare`. Hosting them
   *     one layer up made `paths/normalize` import its own importers, and the
   *     built CJS barrel then snapshotted those re-exports as `undefined`.
   *     Nothing here may import a sibling `paths/*` leaf. That is the invariant
   *     `scripts/repo/check/reexports-have-no-import-cycles.mts` enforces.
   */
  const DRIVE_LETTER_REGEXP = /^[A-Za-z]:$/;
  const msysDriveRegExp = /^\/([a-zA-Z])($|\/)/;
  const nodeModulesPathRegExp = /(?:[/\\]|^)node_modules(?:$|[/\\])/;
  const slashRegExp = /[/\\]/;
  function appendNormalizedPathSegment(state, segment, prefix) {
    if (segment.length === 0 || segment === ".") return;
    if (segment === "..") collapsePathParent(state, prefix);
    else {
      state.collapsed += (state.collapsed.length === 0 ? "" : "/") + segment;
      state.segmentCount += 1;
    }
  }
  function collapsePathParent(state, prefix) {
    if (state.segmentCount > 0) {
      const lastSeparatorIndex = state.collapsed.lastIndexOf("/");
      if (lastSeparatorIndex === -1) {
        state.collapsed = "";
        state.segmentCount = 0;
        if (state.leadingDotDots > 0 && !prefix) {
          state.collapsed = "..";
          state.leadingDotDots = 1;
        }
      } else {
        const lastSegmentStart = lastSeparatorIndex + 1;
        if (state.collapsed.slice(lastSegmentStart) === "..") {
          state.collapsed = `${state.collapsed}/..`;
          state.leadingDotDots += 1;
        } else {
          state.collapsed = state.collapsed.slice(0, lastSeparatorIndex);
          state.segmentCount -= 1;
        }
      }
    } else if (!prefix) {
      state.collapsed =
        state.collapsed + (state.collapsed.length === 0 ? "" : "/") + "..";
      state.leadingDotDots += 1;
    }
  }
  /**
   * Normalize a path for equality comparison — forward slashes, no trailing
   * separator, lowercased on Windows.
   *
   * @example
   *   ;```typescript
   *   foldPathForCompare('C:\\Program Files\\') // 'c:/program files'
   *   ```
   */
  function foldPathForCompare(pathLike) {
    let normalized = normalizePath(pathLike);
    if (normalized.length > 1 && normalized.endsWith("/"))
      normalized = normalized.slice(0, -1);
    return require_constants_platform.isWin32()
      ? normalized.toLowerCase()
      : normalized;
  }
  function hasUncPathPrefix(filepath) {
    const first = require_primordials_string.StringPrototypeCharCodeAt(
      filepath,
      0,
    );
    return (
      filepath.length > 2 &&
      isPathSeparatorCode(first) &&
      require_primordials_string.StringPrototypeCharCodeAt(filepath, 1) ===
        first &&
      require_primordials_string.StringPrototypeCharCodeAt(filepath, 2) !==
        first
    );
  }
  function hasUncPathShare(filepath) {
    const serverEnd = indexOfPathSeparator(
      filepath,
      skipPathSeparators(filepath, 2),
    );
    return (
      serverEnd > 2 && skipPathSeparators(filepath, serverEnd) < filepath.length
    );
  }
  /**
   * Find the next path separator at or after an index.
   *
   * Scans char codes for `/` (47) and `\` (92) — the same two characters
   * `slashRegExp` matches — and allocates nothing. Reaching the same answer
   * through `search` costs a substring, an options bag, and a regex match per
   * lookup, which a segment walk pays once per segment.
   *
   * @example
   *   ;```typescript
   *   indexOfPathSeparator('a/b', 0) // 1
   *   indexOfPathSeparator('a/b', 2) // -1
   *   indexOfPathSeparator('a\\b', 0) // 1
   *   ```
   *
   * @param {string} filepath - The path to scan.
   * @param {number} fromIndex - The index to start scanning at.
   *
   * @returns {number} The index of the first separator at or after `fromIndex`,
   *   or -1 when there is none.
   */
  function indexOfPathSeparator(filepath, fromIndex) {
    const { length } = filepath;
    for (let i = fromIndex; i < length; i += 1) {
      const code = require_primordials_string.StringPrototypeCharCodeAt(
        filepath,
        i,
      );
      if (code === 47 || code === 92) return i;
    }
    return -1;
  }
  function isPathSeparatorCode(code) {
    return code === 47 || code === 92;
  }
  function msysDriveToNative(normalized) {
    /* c8 ignore start - Windows-only branch. */
    if (require_constants_platform.isWin32())
      return normalized.replace(
        msysDriveRegExp,
        (_, letter, sep) => `${letter.toUpperCase()}:${sep || "/"}`,
      );
    /* c8 ignore stop */
    return normalized;
  }
  function normalizedPathPrefix(filepath) {
    const namespaceKind = require_primordials_string.StringPrototypeCharCodeAt(
      filepath,
      2,
    );
    if (
      filepath.length > 4 &&
      require_primordials_string.StringPrototypeCharCodeAt(filepath, 3) ===
        92 &&
      (namespaceKind === 63 || namespaceKind === 46) &&
      require_primordials_string.StringPrototypeCharCodeAt(filepath, 0) ===
        92 &&
      require_primordials_string.StringPrototypeCharCodeAt(filepath, 1) === 92
    )
      return {
        __proto__: null,
        prefix: "//",
        start: 2,
      };
    if (hasUncPathPrefix(filepath) && hasUncPathShare(filepath))
      return {
        __proto__: null,
        prefix: "//",
        start: 2,
      };
    const start = skipPathSeparators(filepath, 0);
    return {
      __proto__: null,
      prefix: start ? "/" : "",
      start,
    };
  }
  /**
   * Normalize a path by converting backslashes to forward slashes and collapsing
   * segments.
   *
   * - Converts all backslashes (`\`) to forward slashes (`/`)
   * - Collapses repeated slashes
   * - Resolves `.` and `..` segments
   * - Preserves UNC path prefixes (`//server/share`)
   * - Preserves Windows namespace prefixes (`//./`, `//?/`)
   * - Returns `.` for empty or collapsed paths
   * - On Windows: MSYS drive letters `/c/path` become `C:/path`
   *
   * @example
   *   ;```typescript
   *   normalizePath('foo/bar//baz') // 'foo/bar/baz'
   *   normalizePath('foo/./bar') // 'foo/bar'
   *   normalizePath('foo/bar/../baz') // 'foo/baz'
   *   normalizePath('C:\\Users\\u\\file.txt') // 'C:/Users/u/file.txt'
   *   normalizePath('\\\\server\\share\\file') // '//server/share/file'
   *   normalizePath('') // '.'
   *   ```
   *
   * @param {string | Buffer | URL} pathLike - The path to normalize.
   *
   * @returns {string} The normalized path
   *
   * @security
   * **WARNING**: This function resolves `..` patterns as part of normalization, which means
   * paths like `/../etc/passwd` become `/etc/passwd`. When processing untrusted user input
   * (HTTP requests, file uploads, URL parameters), you MUST validate for path traversal
   * attacks BEFORE calling this function.
   */
  function normalizePath(pathLike) {
    const filepath = pathLikeToString(pathLike);
    const { length } = filepath;
    if (length === 0) return ".";
    if (length === 1)
      return require_primordials_string.StringPrototypeCharCodeAt(
        filepath,
        0,
      ) === 92
        ? "/"
        : filepath;
    const initial = normalizedPathPrefix(filepath);
    const { prefix } = initial;
    let { start } = initial;
    let nextIndex = indexOfPathSeparator(filepath, start);
    if (nextIndex === -1)
      return normalizeSinglePathSegment(filepath.slice(start), prefix);
    const state = {
      collapsed: "",
      segmentCount: 0,
      leadingDotDots: 0,
    };
    while (nextIndex !== -1) {
      appendNormalizedPathSegment(
        state,
        filepath.slice(start, nextIndex),
        prefix,
      );
      start = skipPathSeparators(filepath, nextIndex + 1);
      nextIndex = indexOfPathSeparator(filepath, start);
    }
    appendNormalizedPathSegment(state, filepath.slice(start), prefix);
    const { collapsed } = state;
    if (collapsed.length === 0) return prefix || ".";
    if (
      DRIVE_LETTER_REGEXP.test(collapsed) &&
      isPathSeparatorCode(
        require_primordials_string.StringPrototypeCharCodeAt(filepath, 2),
      )
    )
      return msysDriveToNative(`${prefix}${collapsed}/`);
    return msysDriveToNative(prefix + collapsed);
  }
  function normalizeSinglePathSegment(segment, prefix) {
    if (segment === "." || segment.length === 0) return prefix || ".";
    if (segment === "..")
      return prefix
        ? require_primordials_string.StringPrototypeSlice(prefix, 0, -1) || "/"
        : "..";
    return msysDriveToNative(prefix + segment);
  }
  /**
   * Convert a path-like value to a string.
   *
   * Converts various path-like types (string, Buffer, URL) into a normalized
   * string representation. Handles different input formats and provides
   * consistent string output for path operations.
   *
   * @example
   *   ;```typescript
   *   pathLikeToString('/home/user') // '/home/user'
   *   pathLikeToString(Buffer.from('/tmp/file')) // '/tmp/file'
   *   pathLikeToString(new URL('file:///home/user')) // '/home/user'
   *   pathLikeToString(null) // ''
   *   ```
   *
   * @param {string | Buffer | URL | null | undefined} pathLike - The value to
   *   convert.
   *
   * @returns {string} The string representation, or empty string for
   *   null/undefined.
   */
  function pathLikeToString(pathLike) {
    if (pathLike === null || pathLike === void 0) return "";
    if (typeof pathLike === "string") return pathLike;
    if (require_primordials_buffer.BufferIsBuffer(pathLike))
      return pathLike.toString("utf8");
    const url = require_node_url.getNodeUrl();
    if (pathLike instanceof URL)
      try {
        return url.fileURLToPath(pathLike);
      } catch {
        const pathname = pathLike.pathname;
        const decodedPathname = decodeURIComponent(pathname);
        /* c8 ignore start - Windows-only URL drive-letter handling. */
        if (
          require_constants_platform.isWin32() &&
          require_primordials_string.StringPrototypeStartsWith(
            decodedPathname,
            "/",
          )
        ) {
          const letter =
            require_primordials_string.StringPrototypeCharCodeAt(
              decodedPathname,
              1,
            ) | 32;
          if (
            !(
              decodedPathname.length >= 3 &&
              letter >= 97 &&
              letter <= 122 &&
              require_primordials_string.StringPrototypeCharAt(
                decodedPathname,
                2,
              ) === ":"
            )
          )
            return decodedPathname;
        }
        /* c8 ignore stop */
        return decodedPathname;
      }
    return String(pathLike);
  }
  function skipPathSeparators(filepath, start) {
    while (
      isPathSeparatorCode(
        require_primordials_string.StringPrototypeCharCodeAt(filepath, start),
      )
    )
      start += 1;
    return start;
  }
  exports.CHAR_BACKWARD_SLASH = require_constants_encoding.CHAR_BACKWARD_SLASH;
  exports.CHAR_COLON = require_constants_encoding.CHAR_COLON;
  exports.CHAR_FORWARD_SLASH = require_constants_encoding.CHAR_FORWARD_SLASH;
  exports.CHAR_LOWERCASE_A = require_constants_encoding.CHAR_LOWERCASE_A;
  exports.CHAR_LOWERCASE_Z = require_constants_encoding.CHAR_LOWERCASE_Z;
  exports.CHAR_UPPERCASE_A = require_constants_encoding.CHAR_UPPERCASE_A;
  exports.CHAR_UPPERCASE_Z = require_constants_encoding.CHAR_UPPERCASE_Z;
  exports.appendNormalizedPathSegment = appendNormalizedPathSegment;
  exports.collapsePathParent = collapsePathParent;
  exports.foldPathForCompare = foldPathForCompare;
  exports.hasUncPathPrefix = hasUncPathPrefix;
  exports.hasUncPathShare = hasUncPathShare;
  exports.indexOfPathSeparator = indexOfPathSeparator;
  exports.isPathSeparatorCode = isPathSeparatorCode;
  exports.msysDriveRegExp = msysDriveRegExp;
  exports.msysDriveToNative = msysDriveToNative;
  exports.nodeModulesPathRegExp = nodeModulesPathRegExp;
  exports.normalizePath = normalizePath;
  exports.normalizeSinglePathSegment = normalizeSinglePathSegment;
  exports.normalizedPathPrefix = normalizedPathPrefix;
  exports.pathLikeToString = pathLikeToString;
  exports.skipPathSeparators = skipPathSeparators;
  exports.slashRegExp = slashRegExp;
});

var require_predicates = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_arrays_predicates = require_predicates$1();
  const require_primordials_object = require_object();
  /**
   * @file Object type guards: `hasKeys`, `hasOwn`, `isObject`, `isPlainObject`.
   *   All four narrow `unknown` to a typed shape and tolerate `null` /
   *   `undefined` without throwing.
   */
  /**
   * Check if an object has any enumerable own properties.
   *
   * Returns `true` if the object has at least one enumerable own property,
   * `false` otherwise. Also returns `false` for null/undefined.
   *
   * @example
   *   ;```ts
   *   hasKeys({ a: 1 }) // true
   *   hasKeys({}) // false
   *   hasKeys([]) // false
   *   hasKeys([1, 2]) // true
   *   hasKeys(null) // false
   *   hasKeys(undefined) // false
   *   hasKeys(Object.create({ inherited: true })) // false
   *   ```
   *
   * @param obj - The value to check.
   *
   * @returns `true` if obj has enumerable own properties, `false` otherwise
   */
  function hasKeys(obj) {
    if (obj === null || obj === void 0) return false;
    for (const key in obj)
      if (require_primordials_object.ObjectHasOwn(obj, key)) return true;
    return false;
  }
  /**
   * Check if an object has an own property.
   *
   * Type-safe wrapper around `Object.hasOwn()` that returns `false` for
   * null/undefined instead of throwing. Only checks own properties, not inherited
   * ones from the prototype chain.
   *
   * @example
   *   ;```ts
   *   const obj = { name: 'Alice' }
   *   hasOwn(obj, 'name') // true
   *   hasOwn(obj, 'age') // false
   *   hasOwn(obj, 'toString') // false (inherited)
   *   hasOwn(null, 'name') // false
   *   ```
   *
   * @param obj - The value to check.
   * @param propKey - The property key to look for.
   *
   * @returns `true` if obj has the property as an own property, `false` otherwise
   */
  function hasOwn(obj, propKey) {
    if (obj === null || obj === void 0) return false;
    return require_primordials_object.ObjectHasOwn(obj, propKey);
  }
  /**
   * Check if a value is an object, arrays included.
   *
   * Returns `true` for any object type including arrays, dates, etc. Returns
   * `false` for primitives and `null`. Functions are not considered objects here
   * (typeof functions === 'function').
   *
   * @example
   *   ;```ts
   *   isObject({}) // true
   *   isObject([]) // true
   *   isObject(new Date()) // true
   *   isObject(() => {}) // false
   *   isObject(null) // false
   *   ```
   *
   * @param value - The value to check.
   *
   * @returns `true` for any object, arrays included; `false` otherwise
   */
  function isObject(value) {
    return value !== null && typeof value === "object";
  }
  /**
   * Check if a value is a plain object, so neither an array nor a built-in.
   *
   * Returns `true` only for plain objects created with `{}` or
   * `Object.create(null)`. Returns `false` for arrays, built-in objects (Date,
   * RegExp, etc.), and primitives.
   *
   * @example
   *   ;```ts
   *   isPlainObject({}) // true
   *   isPlainObject({ a: 1 }) // true
   *   isPlainObject(Object.create(null)) // true
   *   isPlainObject([]) // false
   *   isPlainObject(new Date()) // false
   *   ```
   *
   * @param value - The value to check.
   *
   * @returns `true` if value is a plain object, `false` otherwise
   */
  function isPlainObject(value) {
    if (
      value === null ||
      typeof value !== "object" ||
      require_arrays_predicates.isArray(value)
    )
      return false;
    const proto = require_primordials_object.ObjectGetPrototypeOf(value);
    return (
      proto === null || proto === require_primordials_object.ObjectPrototype
    );
  }
  exports.hasKeys = hasKeys;
  exports.hasOwn = hasOwn;
  exports.isObject = isObject;
  exports.isPlainObject = isPlainObject;
});

var require_reflect = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Safe references to `Reflect.*`. **IMPORTANT**: do not destructure on
   *   `Reflect` here. tsgo has a bug that mis-transpiles destructured exports.
   *   See: https://github.com/SocketDev/socket-packageurl-js/issues/3.
   */
  const ReflectApply = Reflect.apply;
  const ReflectConstruct = Reflect.construct;
  const ReflectDefineProperty = Reflect.defineProperty;
  const ReflectDeleteProperty = Reflect.deleteProperty;
  const ReflectGet = Reflect.get;
  const ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
  const ReflectGetPrototypeOf = Reflect.getPrototypeOf;
  const ReflectHas = Reflect.has;
  const ReflectIsExtensible = Reflect.isExtensible;
  const ReflectOwnKeys = Reflect.ownKeys;
  const ReflectPreventExtensions = Reflect.preventExtensions;
  const ReflectSet = Reflect.set;
  const ReflectSetPrototypeOf = Reflect.setPrototypeOf;
  exports.ReflectApply = ReflectApply;
  exports.ReflectConstruct = ReflectConstruct;
  exports.ReflectDefineProperty = ReflectDefineProperty;
  exports.ReflectDeleteProperty = ReflectDeleteProperty;
  exports.ReflectGet = ReflectGet;
  exports.ReflectGetOwnPropertyDescriptor = ReflectGetOwnPropertyDescriptor;
  exports.ReflectGetPrototypeOf = ReflectGetPrototypeOf;
  exports.ReflectHas = ReflectHas;
  exports.ReflectIsExtensible = ReflectIsExtensible;
  exports.ReflectOwnKeys = ReflectOwnKeys;
  exports.ReflectPreventExtensions = ReflectPreventExtensions;
  exports.ReflectSet = ReflectSet;
  exports.ReflectSetPrototypeOf = ReflectSetPrototypeOf;
});

var require_mutate = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_arrays_predicates = require_predicates$1();
  const require_objects_predicates = require_predicates();
  const require_primordials_error = require_error$1();
  const require_primordials_map_set = require_map_set();
  require_sentinels();
  const require_primordials_reflect = require_reflect();
  /**
   * @file Object mutation helpers: a deep recursive `merge`, plus
   *   `objectAssign` and `objectFreeze` aliasing their natives. `merge` includes
   *   infinite-loop detection via `LOOP_SENTINEL` because `__proto__` and
   *   self-referential graphs would otherwise blow the stack on a recursive
   *   descent.
   */
  const DANGEROUS_KEYS = new require_primordials_map_set.SetCtor([
    "__proto__",
    "constructor",
    "prototype",
  ]);
  /**
   * Deep merge source object into target object.
   *
   * Recursively merges properties from `source` into `target`. Arrays in source
   * completely replace arrays in target, with no element-wise merging. Objects
   * are merged recursively. Includes infinite loop detection for safety.
   *
   * @example
   *   ;```ts
   *   merge(
   *     { config: { api: 'v1', timeout: 1000 } },
   *     { config: { api: 'v2', retries: 3 } },
   *   )
   *   // { config: { api: 'v2', timeout: 1000, retries: 3 } }
   *   ```
   *
   * @example
   *   ;```ts
   *   // Arrays are replaced, not merged
   *   merge({ arr: [1, 2] }, { arr: [3] }) // { arr: [3] }
   *   ```
   *
   * @param target - The object to merge into, which will be modified.
   * @param source - The object to merge from.
   *
   * @returns The modified target object
   */
  function merge(target, source) {
    if (
      !require_objects_predicates.isObject(target) ||
      !require_objects_predicates.isObject(source)
    )
      return target;
    const queue = [[target, source]];
    let pos = 0;
    let { length: queueLength } = queue;
    while (pos < queueLength) {
      if (pos === 1e6)
        throw new require_primordials_error.ErrorCtor(
          "Detected infinite loop in object crawl of merge",
        );
      const { 0: currentTarget, 1: currentSource } = queue[pos++];
      const isSourceArray = require_arrays_predicates.isArray(currentSource);
      const isTargetArray = require_arrays_predicates.isArray(currentTarget);
      if (isSourceArray || isTargetArray) continue;
      const keys = require_primordials_reflect.ReflectOwnKeys(currentSource);
      for (let i = 0, { length } = keys; i < length; i += 1) {
        const key = keys[i];
        if (typeof key === "string" && DANGEROUS_KEYS.has(key)) continue;
        const srcVal = currentSource[key];
        const targetVal = currentTarget[key];
        if (require_arrays_predicates.isArray(srcVal))
          currentTarget[key] = srcVal;
        else if (require_objects_predicates.isObject(srcVal)) {
          if (
            require_objects_predicates.isObject(targetVal) &&
            !require_arrays_predicates.isArray(targetVal)
          )
            queue[queueLength++] = [targetVal, srcVal];
          else currentTarget[key] = srcVal;
        } else currentTarget[key] = srcVal;
      }
    }
    return target;
  }
  /**
   * Alias for native `Object.assign`.
   *
   * Copies all enumerable own properties from one or more source objects to a
   * target object and returns the modified target object.
   *
   * @example
   *   ;```ts
   *   objectAssign({ a: 1 }, { b: 2 }) // { a: 1, b: 2 }
   *   ```
   */
  const objectAssign = Object.assign;
  /**
   * Alias for native `Object.freeze`.
   *
   * Freezes an object, preventing new properties from being added and existing
   * properties from being removed or modified. Makes the object immutable.
   *
   * @example
   *   ;```ts
   *   const obj = { a: 1 }
   *   objectFreeze(obj)
   *   obj.a = 2 // Silently fails (or throws in strict mode)
   *   ```
   */
  const objectFreeze = Object.freeze;
  exports.merge = merge;
  exports.objectAssign = objectAssign;
  exports.objectFreeze = objectFreeze;
});

var require_array$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `Array`, typed-array, `ArrayBuffer`, `DataView`,
   *   `Atomics`, and shared iterator-prototype primordials. `Array.fromAsync` and
   *   `Array.prototype.with` are ES2024 / ES2023; the primordial captures the
   *   live reference at module load so consumers never see a tampered global.
   */
  const smolPrimordial = require_primordial().getSmolPrimordial();
  const ArrayCtor = Array;
  const ArrayBufferCtor = ArrayBuffer;
  const DataViewCtor = DataView;
  const Float32ArrayCtor = Float32Array;
  const Float64ArrayCtor = Float64Array;
  const Int8ArrayCtor = Int8Array;
  const Int16ArrayCtor = Int16Array;
  const Int32ArrayCtor = Int32Array;
  const Uint8ArrayCtor = Uint8Array;
  const Uint8ClampedArrayCtor = Uint8ClampedArray;
  const Uint16ArrayCtor = Uint16Array;
  const Uint32ArrayCtor = Uint32Array;
  const ArrayFrom = Array.from;
  const ArrayFromAsync = Array.fromAsync;
  const ArrayIsArray = smolPrimordial?.arrayIsArray ?? Array.isArray;
  const ArrayOf = Array.of;
  const ArrayBufferIsView = ArrayBuffer.isView;
  const AtomicsWait = Atomics.wait;
  const ArrayPrototypeAt = require_primordials_uncurry.uncurryThis(
    Array.prototype.at,
  );
  const ArrayPrototypeConcat = require_primordials_uncurry.uncurryThis(
    Array.prototype.concat,
  );
  const ArrayPrototypeCopyWithin = require_primordials_uncurry.uncurryThis(
    Array.prototype.copyWithin,
  );
  const ArrayPrototypeEntries = require_primordials_uncurry.uncurryThis(
    Array.prototype.entries,
  );
  const ArrayPrototypeEvery = require_primordials_uncurry.uncurryThis(
    Array.prototype.every,
  );
  const ArrayPrototypeFill = require_primordials_uncurry.uncurryThis(
    Array.prototype.fill,
  );
  const ArrayPrototypeFilter = require_primordials_uncurry.uncurryThis(
    Array.prototype.filter,
  );
  const ArrayPrototypeFind = require_primordials_uncurry.uncurryThis(
    Array.prototype.find,
  );
  const ArrayPrototypeFindIndex = require_primordials_uncurry.uncurryThis(
    Array.prototype.findIndex,
  );
  const ArrayPrototypeFindLast = require_primordials_uncurry.uncurryThis(
    Array.prototype.findLast,
  );
  const ArrayPrototypeFindLastIndex = require_primordials_uncurry.uncurryThis(
    Array.prototype.findLastIndex,
  );
  const ArrayPrototypeFlat = require_primordials_uncurry.uncurryThis(
    Array.prototype.flat,
  );
  const ArrayPrototypeFlatMap = require_primordials_uncurry.uncurryThis(
    Array.prototype.flatMap,
  );
  const ArrayPrototypeForEach = require_primordials_uncurry.uncurryThis(
    Array.prototype.forEach,
  );
  const ArrayPrototypeIncludes = require_primordials_uncurry.uncurryThis(
    Array.prototype.includes,
  );
  const ArrayPrototypeIndexOf = require_primordials_uncurry.uncurryThis(
    Array.prototype.indexOf,
  );
  const ArrayPrototypeJoin = require_primordials_uncurry.uncurryThis(
    Array.prototype.join,
  );
  const ArrayPrototypeKeys = require_primordials_uncurry.uncurryThis(
    Array.prototype.keys,
  );
  const ArrayPrototypeLastIndexOf = require_primordials_uncurry.uncurryThis(
    Array.prototype.lastIndexOf,
  );
  const ArrayPrototypeMap = require_primordials_uncurry.uncurryThis(
    Array.prototype.map,
  );
  const ArrayPrototypePop = require_primordials_uncurry.uncurryThis(
    Array.prototype.pop,
  );
  const ArrayPrototypePush = require_primordials_uncurry.uncurryThis(
    Array.prototype.push,
  );
  const ArrayPrototypeReduce = require_primordials_uncurry.uncurryThis(
    Array.prototype.reduce,
  );
  const ArrayPrototypeReduceRight = require_primordials_uncurry.uncurryThis(
    Array.prototype.reduceRight,
  );
  const ArrayPrototypeReverse = require_primordials_uncurry.uncurryThis(
    Array.prototype.reverse,
  );
  const ArrayPrototypeShift = require_primordials_uncurry.uncurryThis(
    Array.prototype.shift,
  );
  const ArrayPrototypeSlice = require_primordials_uncurry.uncurryThis(
    Array.prototype.slice,
  );
  const ArrayPrototypeSome = require_primordials_uncurry.uncurryThis(
    Array.prototype.some,
  );
  const ArrayPrototypeSort = require_primordials_uncurry.uncurryThis(
    Array.prototype.sort,
  );
  const ArrayPrototypeSplice = require_primordials_uncurry.uncurryThis(
    Array.prototype.splice,
  );
  const ArrayPrototypeToLocaleString = require_primordials_uncurry.uncurryThis(
    Array.prototype.toLocaleString,
  );
  const ArrayPrototypeToReversed = require_primordials_uncurry.uncurryThis(
    Array.prototype.toReversed,
  );
  const ArrayPrototypeToSorted = require_primordials_uncurry.uncurryThis(
    Array.prototype.toSorted,
  );
  const ArrayPrototypeToSpliced = require_primordials_uncurry.uncurryThis(
    Array.prototype.toSpliced,
  );
  const ArrayPrototypeToString = require_primordials_uncurry.uncurryThis(
    Array.prototype.toString,
  );
  const ArrayPrototypeUnshift = require_primordials_uncurry.uncurryThis(
    Array.prototype.unshift,
  );
  const ArrayPrototypeValues = require_primordials_uncurry.uncurryThis(
    Array.prototype.values,
  );
  const ArrayPrototypeWith = require_primordials_uncurry.uncurryThis(
    Array.prototype.with,
  );
  const anyIterator = /* @__PURE__ */ new Map().keys();
  let iteratorLookup = Object.getPrototypeOf(anyIterator);
  while (iteratorLookup && typeof iteratorLookup.next !== "function")
    /* c8 ignore next - Modern V8 puts Iterator.prototype one hop up the chain
	so the first check already finds .next; the walk-further branch fires
	only on hypothetical engines where the prototype layout differs. */
    iteratorLookup = Object.getPrototypeOf(iteratorLookup);
  const iteratorProto = iteratorLookup;
  const IteratorPrototypeNext = require_primordials_uncurry.uncurryThis(
    iteratorProto.next,
  );
  /* c8 ignore start */
  const IteratorPrototypeReturn =
    typeof iteratorProto.return === "function"
      ? require_primordials_uncurry.uncurryThis(iteratorProto.return)
      : void 0;
  /* c8 ignore stop */
  exports.ArrayBufferCtor = ArrayBufferCtor;
  exports.ArrayBufferIsView = ArrayBufferIsView;
  exports.ArrayCtor = ArrayCtor;
  exports.ArrayFrom = ArrayFrom;
  exports.ArrayFromAsync = ArrayFromAsync;
  exports.ArrayIsArray = ArrayIsArray;
  exports.ArrayOf = ArrayOf;
  exports.ArrayPrototypeAt = ArrayPrototypeAt;
  exports.ArrayPrototypeConcat = ArrayPrototypeConcat;
  exports.ArrayPrototypeCopyWithin = ArrayPrototypeCopyWithin;
  exports.ArrayPrototypeEntries = ArrayPrototypeEntries;
  exports.ArrayPrototypeEvery = ArrayPrototypeEvery;
  exports.ArrayPrototypeFill = ArrayPrototypeFill;
  exports.ArrayPrototypeFilter = ArrayPrototypeFilter;
  exports.ArrayPrototypeFind = ArrayPrototypeFind;
  exports.ArrayPrototypeFindIndex = ArrayPrototypeFindIndex;
  exports.ArrayPrototypeFindLast = ArrayPrototypeFindLast;
  exports.ArrayPrototypeFindLastIndex = ArrayPrototypeFindLastIndex;
  exports.ArrayPrototypeFlat = ArrayPrototypeFlat;
  exports.ArrayPrototypeFlatMap = ArrayPrototypeFlatMap;
  exports.ArrayPrototypeForEach = ArrayPrototypeForEach;
  exports.ArrayPrototypeIncludes = ArrayPrototypeIncludes;
  exports.ArrayPrototypeIndexOf = ArrayPrototypeIndexOf;
  exports.ArrayPrototypeJoin = ArrayPrototypeJoin;
  exports.ArrayPrototypeKeys = ArrayPrototypeKeys;
  exports.ArrayPrototypeLastIndexOf = ArrayPrototypeLastIndexOf;
  exports.ArrayPrototypeMap = ArrayPrototypeMap;
  exports.ArrayPrototypePop = ArrayPrototypePop;
  exports.ArrayPrototypePush = ArrayPrototypePush;
  exports.ArrayPrototypeReduce = ArrayPrototypeReduce;
  exports.ArrayPrototypeReduceRight = ArrayPrototypeReduceRight;
  exports.ArrayPrototypeReverse = ArrayPrototypeReverse;
  exports.ArrayPrototypeShift = ArrayPrototypeShift;
  exports.ArrayPrototypeSlice = ArrayPrototypeSlice;
  exports.ArrayPrototypeSome = ArrayPrototypeSome;
  exports.ArrayPrototypeSort = ArrayPrototypeSort;
  exports.ArrayPrototypeSplice = ArrayPrototypeSplice;
  exports.ArrayPrototypeToLocaleString = ArrayPrototypeToLocaleString;
  exports.ArrayPrototypeToReversed = ArrayPrototypeToReversed;
  exports.ArrayPrototypeToSorted = ArrayPrototypeToSorted;
  exports.ArrayPrototypeToSpliced = ArrayPrototypeToSpliced;
  exports.ArrayPrototypeToString = ArrayPrototypeToString;
  exports.ArrayPrototypeUnshift = ArrayPrototypeUnshift;
  exports.ArrayPrototypeValues = ArrayPrototypeValues;
  exports.ArrayPrototypeWith = ArrayPrototypeWith;
  exports.AtomicsWait = AtomicsWait;
  exports.DataViewCtor = DataViewCtor;
  exports.Float32ArrayCtor = Float32ArrayCtor;
  exports.Float64ArrayCtor = Float64ArrayCtor;
  exports.Int16ArrayCtor = Int16ArrayCtor;
  exports.Int32ArrayCtor = Int32ArrayCtor;
  exports.Int8ArrayCtor = Int8ArrayCtor;
  exports.IteratorPrototypeNext = IteratorPrototypeNext;
  exports.IteratorPrototypeReturn = IteratorPrototypeReturn;
  exports.Uint16ArrayCtor = Uint16ArrayCtor;
  exports.Uint32ArrayCtor = Uint32ArrayCtor;
  exports.Uint8ArrayCtor = Uint8ArrayCtor;
  exports.Uint8ClampedArrayCtor = Uint8ClampedArrayCtor;
});

var require_globals = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Safe references to top-level globals that don't fit a larger
   *   primordials leaf — primitive constructors (`Boolean`, `BigInt`), `Proxy`,
   *   `SharedArrayBuffer`, language-level constants (`Infinity`, `NaN`,
   *   `globalThis`), and the encode/decode helpers. Every reference is captured
   *   once at module load so consumers reading adversarial input never see a
   *   tampered global.
   */
  const BigIntCtor = BigInt;
  const BooleanCtor = Boolean;
  const ProxyCtor = Proxy;
  const SharedArrayBufferCtor =
    typeof SharedArrayBuffer === "undefined" ? void 0 : SharedArrayBuffer;
  const InfinityValue = Infinity;
  const NaNValue = NaN;
  const capturedGlobalThis = globalThis;
  const atob = globalThis.atob;
  const btoa = globalThis.btoa;
  const decodeURIComponent = globalThis.decodeURIComponent;
  const encodeURIComponent = globalThis.encodeURIComponent;
  exports.BigIntCtor = BigIntCtor;
  exports.BooleanCtor = BooleanCtor;
  exports.InfinityValue = InfinityValue;
  exports.NaNValue = NaNValue;
  exports.ProxyCtor = ProxyCtor;
  exports.SharedArrayBufferCtor = SharedArrayBufferCtor;
  exports.atob = atob;
  exports.btoa = btoa;
  exports.decodeURIComponent = decodeURIComponent;
  exports.encodeURIComponent = encodeURIComponent;
  exports.globalThis = capturedGlobalThis;
});

var require_math = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Safe references to `Math` constants and methods. Methods prefer the
   *   smol fast-path (`node:smol-primordial`) when available — V8 Fast API typed
   *   implementations TurboFan inlines into JIT'd callers. Constants stay as the
   *   stock `Math.X` since they are pre-computed scalar values with no fast-path
   *   benefit.
   */
  const smolPrimordial = require_primordial().getSmolPrimordial();
  const MathE = Math.E;
  const MathLN2 = Math.LN2;
  const MathLN10 = Math.LN10;
  const MathLOG2E = Math.LOG2E;
  const MathLOG10E = Math.LOG10E;
  const MathPI = Math.PI;
  const MathSQRT1_2 = Math.SQRT1_2;
  const MathSQRT2 = Math.SQRT2;
  const MathAbs = smolPrimordial?.mathAbs ?? Math.abs;
  const MathAcos = smolPrimordial?.mathAcos ?? Math.acos;
  const MathAcosh = smolPrimordial?.mathAcosh ?? Math.acosh;
  const MathAsin = smolPrimordial?.mathAsin ?? Math.asin;
  const MathAsinh = smolPrimordial?.mathAsinh ?? Math.asinh;
  const MathAtan = smolPrimordial?.mathAtan ?? Math.atan;
  const MathAtan2 = smolPrimordial?.mathAtan2 ?? Math.atan2;
  const MathAtanh = smolPrimordial?.mathAtanh ?? Math.atanh;
  const MathCbrt = smolPrimordial?.mathCbrt ?? Math.cbrt;
  const MathCeil = smolPrimordial?.mathCeil ?? Math.ceil;
  const MathClz32 = smolPrimordial?.mathClz32 ?? Math.clz32;
  const MathCos = smolPrimordial?.mathCos ?? Math.cos;
  const MathCosh = smolPrimordial?.mathCosh ?? Math.cosh;
  const MathExp = smolPrimordial?.mathExp ?? Math.exp;
  const MathExpm1 = smolPrimordial?.mathExpm1 ?? Math.expm1;
  const MathF16round = Math.f16round;
  const MathFloor = smolPrimordial?.mathFloor ?? Math.floor;
  const MathFround = smolPrimordial?.mathFround ?? Math.fround;
  const MathHypot = smolPrimordial?.mathHypot ?? Math.hypot;
  const MathImul = smolPrimordial?.mathImul ?? Math.imul;
  const MathLog = smolPrimordial?.mathLog ?? Math.log;
  const MathLog1p = smolPrimordial?.mathLog1p ?? Math.log1p;
  const MathLog2 = smolPrimordial?.mathLog2 ?? Math.log2;
  const MathLog10 = smolPrimordial?.mathLog10 ?? Math.log10;
  const MathMax = Math.max;
  const MathMin = Math.min;
  const MathPow = smolPrimordial?.mathPow ?? Math.pow;
  const MathRandom = Math.random;
  const MathRound = smolPrimordial?.mathRound ?? Math.round;
  const MathSign = smolPrimordial?.mathSign ?? Math.sign;
  const MathSin = smolPrimordial?.mathSin ?? Math.sin;
  const MathSinh = smolPrimordial?.mathSinh ?? Math.sinh;
  const MathSqrt = smolPrimordial?.mathSqrt ?? Math.sqrt;
  const MathTan = smolPrimordial?.mathTan ?? Math.tan;
  const MathTanh = smolPrimordial?.mathTanh ?? Math.tanh;
  const MathTrunc = smolPrimordial?.mathTrunc ?? Math.trunc;
  exports.MathAbs = MathAbs;
  exports.MathAcos = MathAcos;
  exports.MathAcosh = MathAcosh;
  exports.MathAsin = MathAsin;
  exports.MathAsinh = MathAsinh;
  exports.MathAtan = MathAtan;
  exports.MathAtan2 = MathAtan2;
  exports.MathAtanh = MathAtanh;
  exports.MathCbrt = MathCbrt;
  exports.MathCeil = MathCeil;
  exports.MathClz32 = MathClz32;
  exports.MathCos = MathCos;
  exports.MathCosh = MathCosh;
  exports.MathE = MathE;
  exports.MathExp = MathExp;
  exports.MathExpm1 = MathExpm1;
  exports.MathF16round = MathF16round;
  exports.MathFloor = MathFloor;
  exports.MathFround = MathFround;
  exports.MathHypot = MathHypot;
  exports.MathImul = MathImul;
  exports.MathLN10 = MathLN10;
  exports.MathLN2 = MathLN2;
  exports.MathLOG10E = MathLOG10E;
  exports.MathLOG2E = MathLOG2E;
  exports.MathLog = MathLog;
  exports.MathLog10 = MathLog10;
  exports.MathLog1p = MathLog1p;
  exports.MathLog2 = MathLog2;
  exports.MathMax = MathMax;
  exports.MathMin = MathMin;
  exports.MathPI = MathPI;
  exports.MathPow = MathPow;
  exports.MathRandom = MathRandom;
  exports.MathRound = MathRound;
  exports.MathSQRT1_2 = MathSQRT1_2;
  exports.MathSQRT2 = MathSQRT2;
  exports.MathSign = MathSign;
  exports.MathSin = MathSin;
  exports.MathSinh = MathSinh;
  exports.MathSqrt = MathSqrt;
  exports.MathTan = MathTan;
  exports.MathTanh = MathTanh;
  exports.MathTrunc = MathTrunc;
});

var require_abort = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Process control helpers. Lazily creates and exposes a shared
   *   `AbortController` and its `AbortSignal` so cooperating modules can
   *   coordinate cancellation from a single source.
   */
  let abortController;
  /**
   * Get the process-scoped shared `AbortController` singleton. Cooperating
   * modules use this to coordinate cancellation across the library.
   *
   * @returns The lazily-created shared `AbortController` instance.
   */
  function getAbortController() {
    if (abortController === void 0) abortController = new AbortController();
    return abortController;
  }
  /**
   * Get the process-scoped shared `AbortSignal` singleton. This is the `signal`
   * property of {@link getAbortController}'s controller and is intended to be
   * passed to APIs that accept an `AbortSignal`.
   *
   * @returns The shared `AbortSignal` instance.
   */
  function getAbortSignal() {
    return getAbortController().signal;
  }
  exports.getAbortController = getAbortController;
  exports.getAbortSignal = getAbortSignal;
});

var require_shared$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_runtime = require_runtime();
  const require_process_abort = require_abort();
  /**
   * Get the timers/promises module. Uses a lazy `require` rather than a
   * top-level import to avoid Webpack bundling issues.
   *
   * Intentionally NOT memoized: Node's module cache already makes the repeat
   * `require` effectively free, and caching the reference breaks fake timers
   * (`vi.useFakeTimers()` swaps the clock after this module loads; a cached
   * reference would hold the pre-fake real `setTimeout`, burning real wallclock
   * on retry backoff and starving the test worker pool).
   *
   * @private
   *
   * @returns The Node.js timers/promises module
   */
  function getTimers() {
    if (!require_constants_runtime.IS_NODE) return;
    return __require("timers/promises");
  }
  exports.getAbortSignal = require_process_abort.getAbortSignal;
  exports.getTimers = getTimers;
});

var require_options = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_process_abort = require_abort();
  const require_primordials_math = require_math();
  /**
   * @file Option-shape normalizers for the iteration / retry helpers. Three free
   *   functions — kept together because they're a tiny cluster of pure transforms
   *   that callers cycle through: `resolveRetryOptions` (number-shorthand →
   *   minimal object) → `normalizeRetryOptions` (defaults + signal binding) →
   *   `normalizeIterationOptions` (concurrency + retries combined).
   */
  /**
   * Normalize options for iteration functions.
   *
   * Converts various option formats into a consistent structure with defaults
   * applied. Handles number shorthand for concurrency and ensures minimum
   * values.
   *
   * @example
   *   // Number shorthand for concurrency
   *   normalizeIterationOptions(5)
   *   // => { concurrency: 5, retries: {...}, signal: AbortSignal }
   *
   * @example
   *   // Full options
   *   normalizeIterationOptions({ concurrency: 3, retries: 2 })
   *   // => { concurrency: 3, retries: {...}, signal: AbortSignal }
   *
   * @param options - Concurrency as number, or full options object, or undefined.
   *
   * @returns Normalized options with concurrency, retries, and signal
   */
  function normalizeIterationOptions(options) {
    const {
      concurrency = 1,
      retries,
      signal = require_process_abort.getAbortSignal(),
    } = {
      __proto__: null,
      ...(typeof options === "number" ? { concurrency: options } : options),
    };
    return {
      __proto__: null,
      concurrency: require_primordials_math.MathMax(1, concurrency),
      retries: normalizeRetryOptions({
        signal,
        ...resolveRetryOptions(retries),
      }),
      signal,
    };
  }
  /**
   * Normalize options for retry functionality.
   *
   * Converts various retry option formats — a bare retry count, a partial
   * options object, or undefined — into a complete configuration with every
   * default filled in.
   *
   * @example
   *   // Number shorthand
   *   normalizeRetryOptions(3)
   *   // => { retries: 3, baseDelayMs: 200, backoffFactor: 2, ... }
   *
   * @example
   *   // Full options with defaults filled in
   *   normalizeRetryOptions({ retries: 5, baseDelayMs: 500 })
   *   // => { retries: 5, baseDelayMs: 500, backoffFactor: 2, jitter: true, ... }
   *
   * @param options - Retry count as number, or full options object, or undefined.
   *
   * @returns Normalized retry options with all properties set
   */
  function normalizeRetryOptions(options) {
    const {
      args = [],
      backoffFactor = 2,
      baseDelayMs = 200,
      jitter = true,
      maxDelayMs = 1e4,
      onRetry,
      onRetryCancelOnFalse = false,
      onRetryRethrow = false,
      retries = 0,
      signal = require_process_abort.getAbortSignal(),
    } = resolveRetryOptions(options);
    return {
      args,
      backoffFactor,
      baseDelayMs,
      jitter,
      maxDelayMs,
      onRetry,
      onRetryCancelOnFalse,
      onRetryRethrow,
      retries,
      signal,
    };
  }
  /**
   * Resolve retry options from various input formats.
   *
   * Converts shorthand and partial options into a base configuration that can be
   * further normalized. This is an internal helper for option processing.
   *
   * @example
   *   resolveRetryOptions(3)
   *   // => { retries: 3, baseDelayMs: 200, maxDelayMs: 10000, backoffFactor: 2 }
   *
   * @example
   *   resolveRetryOptions({ retries: 5, maxDelayMs: 5000 })
   *   // => { retries: 5, baseDelayMs: 200, maxDelayMs: 5000, backoffFactor: 2 }
   *
   * @param options - Retry count as number, or partial options object, or
   *   undefined.
   *
   * @returns Resolved retry options with defaults for basic properties
   */
  function resolveRetryOptions(options) {
    const defaults = {
      __proto__: null,
      retries: 0,
      baseDelayMs: 200,
      maxDelayMs: 1e4,
      backoffFactor: 2,
    };
    if (typeof options === "number")
      return {
        ...defaults,
        retries: options,
      };
    return options
      ? {
          ...defaults,
          ...options,
        }
      : defaults;
  }
  exports.normalizeIterationOptions = normalizeIterationOptions;
  exports.normalizeRetryOptions = normalizeRetryOptions;
  exports.resolveRetryOptions = resolveRetryOptions;
});

var require_retry = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  require_sentinels();
  const require_primordials_math = require_math();
  const require_promises_shared = require_shared$1();
  const require_promises_options = require_options();
  /**
   * @file `pRetry` — exponential-backoff retry with optional jitter, abort-signal
   *   support, and an `onRetry` hook for customizing delays or canceling retries
   *   entirely. Cycles with `iterate.ts`: pRetry is called by pEach / pEachChunk
   *   / pFilter / pFilterChunk to apply per-item retry. ESM tolerates the cycle
   *   since both sides reference each other through functions only.
   */
  /**
   * Retry an async function with exponential backoff.
   *
   * Attempts to execute a function multiple times with increasing delays between
   * attempts. Implements exponential backoff with optional jitter to prevent
   * thundering herd problems. Supports custom retry logic via `onRetry`
   * callback.
   *
   * The delay calculation follows: `min(baseDelayMs * (backoffFactor ** attempt),
   * maxDelayMs)` With jitter: adds random value between 0 and calculated delay.
   *
   * @example
   *   // Simple retry: 3 attempts with default backoff
   *   const data = await pRetry(async () => {
   *     return await fetchData()
   *   }, 3)
   *
   * @example
   *   // Custom backoff strategy
   *   const result = await pRetry(
   *     async () => {
   *       return await unreliableOperation()
   *     },
   *     {
   *       retries: 5,
   *       baseDelayMs: 1000, // Start at 1 second
   *       backoffFactor: 2, // Double each time
   *       maxDelayMs: 30000, // Cap at 30 seconds
   *       jitter: true, // Add randomness
   *     },
   *   )
   *   // Delays: ~1s, ~2s, ~4s, ~8s, ~16s (each ± random jitter)
   *
   * @example
   *   // With custom retry logic
   *   const data = await pRetry(
   *     async () => {
   *       return await apiCall()
   *     },
   *     {
   *       retries: 3,
   *       onRetry: (attempt, error, delay) => {
   *         console.log(`Attempt ${attempt} failed: ${error}`)
   *         console.log(`Waiting ${delay}ms before retry...`)
   *
   *         // Cancel retries for client errors (4xx)
   *         if (error.statusCode >= 400 && error.statusCode < 500) {
   *           return false
   *         }
   *
   *         // Use longer delay for rate limit errors
   *         if (error.statusCode === 429) {
   *           return 60000 // Wait 1 minute
   *         }
   *       },
   *       onRetryCancelOnFalse: true,
   *     },
   *   )
   *
   * @example
   *   // With cancellation support
   *   const controller = new AbortController()
   *   setTimeout(() => controller.abort(), 5000) // Cancel after 5s
   *
   *   const result = await pRetry(
   *     async ({ signal }) => {
   *       return await longRunningTask(signal)
   *     },
   *     {
   *       retries: 10,
   *       signal: controller.signal,
   *     },
   *   )
   *   // Returns undefined if aborted
   *
   * @example
   *   // Pass arguments to callback
   *   const result = await pRetry(
   *     async (url, options) => {
   *       return await fetch(url, options)
   *     },
   *     {
   *       retries: 3,
   *       args: ['https://api.example.com', { method: 'POST' }],
   *     },
   *   )
   *
   * @template T - The return type of the callback function.
   *
   * @param callbackFn - Async function to retry.
   * @param options - Retry count as number, or full retry options, or undefined.
   *
   * @returns Promise resolving to callback result, or `undefined` if aborted
   *
   * @throws {Error} The last error if all retry attempts fail
   */
  async function pRetry(callbackFn, options) {
    const {
      args,
      backoffFactor,
      baseDelayMs,
      jitter,
      maxDelayMs,
      onRetry,
      onRetryCancelOnFalse,
      onRetryRethrow,
      retries,
      signal,
    } = require_promises_options.normalizeRetryOptions(options);
    function isAborted() {
      return signal?.aborted;
    }
    if (isAborted()) return;
    if (retries === 0) return await callbackFn(...(args || []), { signal });
    const timers = require_promises_shared.getTimers();
    let attempts = retries;
    let delay = baseDelayMs;
    let error = void 0;
    /* c8 ignore start */
    function resolveRetryDelay(e, waitTime) {
      if (typeof onRetry === "function")
        try {
          const result = onRetry(retries - attempts, e, waitTime);
          if (result === false && onRetryCancelOnFalse) return false;
          if (typeof result === "number" && result >= 0)
            waitTime = require_primordials_math.MathMin(result, maxDelayMs);
        } catch (onRetryError) {
          if (onRetryRethrow) throw onRetryError;
        }
      return waitTime;
    }
    /* c8 ignore stop */
    while (attempts-- >= 0) {
      /* c8 ignore start */
      if (isAborted()) return;
      /* c8 ignore stop */
      try {
        return await callbackFn(...(args || []), { signal });
      } catch (e) {
        error = e;
        if (attempts < 0) break;
        let waitTime = delay;
        if (jitter)
          waitTime += require_primordials_math.MathFloor(
            require_primordials_math.MathRandom() * delay,
          );
        waitTime = require_primordials_math.MathMin(waitTime, maxDelayMs);
        const retryDelay = resolveRetryDelay(e, waitTime);
        if (retryDelay === false) break;
        waitTime = retryDelay;
        try {
          await timers.setTimeout(waitTime, void 0, { signal });
        } catch {
          return;
        }
        /* c8 ignore stop */
        /* c8 ignore start */
        if (isAborted()) return;
        /* c8 ignore stop */
        delay = require_primordials_math.MathMin(
          delay * backoffFactor,
          maxDelayMs,
        );
      }
    }
    if (error !== void 0) throw error;
  }
  exports.pRetry = pRetry;
});

var require_path$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const nodePath = require_runtime().IS_NODE
    ? /*@__PURE__*/ __require("path")
    : void 0;
  function getNodePath() {
    return nodePath;
  }
  const PathBasename = nodePath?.basename;
  const PathDirname = nodePath?.dirname;
  const PathExtname = nodePath?.extname;
  const PathIsAbsolute = nodePath?.isAbsolute;
  const PathJoin = nodePath?.join;
  const PathRelative = nodePath?.relative;
  const PathResolve = nodePath?.resolve;
  exports.PathBasename = PathBasename;
  exports.PathDirname = PathDirname;
  exports.PathExtname = PathExtname;
  exports.PathIsAbsolute = PathIsAbsolute;
  exports.PathJoin = PathJoin;
  exports.PathRelative = PathRelative;
  exports.PathResolve = PathResolve;
  exports.getNodePath = getNodePath;
});

var require_socket$2 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Socket.dev branding and identifier constants. Centralizes API base
   *   URLs, website/docs URLs, npm scopes, GitHub org/repo
   *   names, and app name strings used across the Socket toolchain.
   */
  const SOCKET_API_BASE_URL = "https://api.socket.dev/v0";
  const SOCKET_WEBSITE_URL = "https://socket.dev";
  const SOCKET_CONTACT_URL = "https://socket.dev/contact";
  const SOCKET_DASHBOARD_URL = "https://socket.dev/dashboard";
  const SOCKET_API_TOKENS_URL =
    "https://socket.dev/dashboard/settings/api-tokens";
  const SOCKET_PRICING_URL = "https://socket.dev/pricing";
  const SOCKET_STATUS_URL = "https://status.socket.dev";
  const SOCKET_DOCS_URL = "https://docs.socket.dev";
  const SOCKET_DOCS_CONTACT_URL =
    "https://docs.socket.dev/docs/contact-support";
  const SOCKET_REGISTRY_SCOPE = "@socketregistry";
  const SOCKET_SECURITY_SCOPE = "@socketsecurity";
  const SOCKET_OVERRIDE_SCOPE = "@socketoverride";
  const SOCKET_GITHUB_ORG = "SocketDev";
  const SOCKET_REGISTRY_REPO_NAME = "socket-registry";
  const SOCKET_REGISTRY_PACKAGE_NAME = "@socketsecurity/registry";
  const SOCKET_REGISTRY_NPM_ORG = "socketregistry";
  const SOCKET_DIR_PREFIX = "_";
  const SOCKET_DIR = {
    __proto__: null,
    cacache: `_cacache`,
    dlx: `_dlx`,
    state: `_state`,
    wheelhouse: `_wheelhouse`,
  };
  const SOCKET_LIB_NAME = "@socketsecurity/lib";
  const SOCKET_LIB_VERSION = "7.1.0";
  const SOCKET_IPC_HANDSHAKE = "SOCKET_IPC_HANDSHAKE";
  const CACHE_SOCKET_API_DIR = "socket-api";
  const REGISTRY = "registry";
  const REGISTRY_SCOPE_DELIMITER = "__";
  exports.CACHE_SOCKET_API_DIR = CACHE_SOCKET_API_DIR;
  exports.REGISTRY = REGISTRY;
  exports.REGISTRY_SCOPE_DELIMITER = REGISTRY_SCOPE_DELIMITER;
  exports.SOCKET_API_BASE_URL = SOCKET_API_BASE_URL;
  exports.SOCKET_API_TOKENS_URL = SOCKET_API_TOKENS_URL;
  exports.SOCKET_CONTACT_URL = SOCKET_CONTACT_URL;
  exports.SOCKET_DASHBOARD_URL = SOCKET_DASHBOARD_URL;
  exports.SOCKET_DIR = SOCKET_DIR;
  exports.SOCKET_DIR_PREFIX = SOCKET_DIR_PREFIX;
  exports.SOCKET_DOCS_CONTACT_URL = SOCKET_DOCS_CONTACT_URL;
  exports.SOCKET_DOCS_URL = SOCKET_DOCS_URL;
  exports.SOCKET_GITHUB_ORG = SOCKET_GITHUB_ORG;
  exports.SOCKET_IPC_HANDSHAKE = SOCKET_IPC_HANDSHAKE;
  exports.SOCKET_LIB_NAME = SOCKET_LIB_NAME;
  exports.SOCKET_LIB_VERSION = SOCKET_LIB_VERSION;
  exports.SOCKET_OVERRIDE_SCOPE = SOCKET_OVERRIDE_SCOPE;
  exports.SOCKET_PRICING_URL = SOCKET_PRICING_URL;
  exports.SOCKET_REGISTRY_NPM_ORG = SOCKET_REGISTRY_NPM_ORG;
  exports.SOCKET_REGISTRY_PACKAGE_NAME = SOCKET_REGISTRY_PACKAGE_NAME;
  exports.SOCKET_REGISTRY_REPO_NAME = SOCKET_REGISTRY_REPO_NAME;
  exports.SOCKET_REGISTRY_SCOPE = SOCKET_REGISTRY_SCOPE;
  exports.SOCKET_SECURITY_SCOPE = SOCKET_SECURITY_SCOPE;
  exports.SOCKET_STATUS_URL = SOCKET_STATUS_URL;
  exports.SOCKET_WEBSITE_URL = SOCKET_WEBSITE_URL;
});

var require_boolean = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * Convert an environment variable value to a boolean.
   *
   * @example
   *   ;```typescript
   *   import { envAsBoolean } from '@socketsecurity/lib/env/boolean'
   *
   *   envAsBoolean('true') // true
   *   envAsBoolean('1') // true
   *   envAsBoolean('yes') // true
   *   envAsBoolean('  true  ') // true (trimmed)
   *   envAsBoolean('  true  ', { trim: false }) // false (strict)
   *   envAsBoolean(undefined) // false
   *   envAsBoolean(undefined, { defaultValue: true }) // true
   *   ```
   *
   * @param value - The value to convert.
   * @param options - Options bag: `defaultValue`, `trim`.
   *
   * @returns `true` if value is '1', 'true', or 'yes' (case-insensitive), `false`
   *   otherwise.
   */
  function envAsBoolean(value, options) {
    const { defaultValue = false, trim = true } = {
      __proto__: null,
      ...options,
    };
    if (typeof value === "string") {
      const candidate = trim ? value.trim() : value;
      if (!candidate) return !!defaultValue;
      const lower = candidate.toLowerCase();
      return lower === "1" || lower === "true" || lower === "yes";
    }
    if (value === null || value === void 0) return !!defaultValue;
    return !!value;
  }
  exports.envAsBoolean = envAsBoolean;
});

var require_async_hooks = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_runtime = require_runtime();
  let asyncHooks;
  function getNodeAsyncHooks() {
    if (!require_constants_runtime.IS_NODE) return;
    asyncHooks ??= /*@__PURE__*/ __require("async_hooks");
    return asyncHooks;
  }
  exports.getNodeAsyncHooks = getNodeAsyncHooks;
});

var require_rewire$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_constants_runtime = require_runtime();
  const require_primordials_object = require_object();
  const require_objects_predicates = require_predicates();
  const require_env_boolean = require_boolean();
  const require_node_async_hooks = require_async_hooks();
  const require_primordials_map_set = require_map_set();
  let isolatedOverridesStorage;
  const sharedOverridesSymbol = Symbol.for(
    "@socketsecurity/lib/env/rewire/test-overrides",
  );
  const globalThisRef = globalThis;
  if (
    require_env_boolean.envAsBoolean(safeProcessEnv()?.["VITEST"]) &&
    !globalThisRef[sharedOverridesSymbol]
  )
    globalThisRef[sharedOverridesSymbol] =
      new require_primordials_map_set.MapCtor();
  const sharedOverrides = globalThisRef[sharedOverridesSymbol];
  /**
   * Clear a specific environment variable override.
   *
   * @example
   *   ;```typescript
   *   import { setEnv, clearEnv } from '@socketsecurity/lib/env/rewire'
   *
   *   setEnv('CI', '1')
   *   clearEnv('CI')
   *   ```
   *
   * @param key - The environment variable name to clear.
   */
  function clearEnv(key) {
    sharedOverrides?.delete(key);
  }
  /**
   * Lazily load the async_hooks module. Aliases the canonical `node/async-hooks`
   * accessor, the single owner of the bundler-safe require; kept as an export so
   * this module's surface is unchanged.
   *
   * @private
   */
  const getAsyncHooks = require_node_async_hooks.getNodeAsyncHooks;
  /**
   * Get an environment variable value, checking overrides first.
   *
   * Resolution order: 1. Isolated overrides (temporary - set via
   * withEnv/withEnvSync) 2. Shared overrides (persistent - set via setEnv in
   * beforeEach) 3. process.env (including vi.stubEnv modifications)
   *
   * @example
   *   ;```typescript
   *   import { getEnvValue } from '@socketsecurity/lib/env/rewire'
   *
   *   const value = getEnvValue('NODE_ENV')
   *   // e.g. 'production' or undefined
   *   ```
   *
   * @internal Used by env getters to support test rewiring
   */
  function getEnvValue(key) {
    const isolatedOverrides = getIsolatedOverrides();
    if (isolatedOverrides?.has(key)) return isolatedOverrides.get(key);
    if (sharedOverrides?.has(key)) return sharedOverrides.get(key);
    return safeProcessEnv()?.[key];
  }
  /**
   * Get the current isolated-override map, or undefined when none is active.
   * Off Node, in browser bundles, there is no AsyncLocalStorage and no isolated
   * context — env getters fall straight through to the other tiers.
   *
   * @private
   */
  function getIsolatedOverrides() {
    return require_constants_runtime.IS_NODE
      ? getIsolatedOverridesStorage().getStore()
      : void 0;
  }
  /**
   * Get the process-scoped AsyncLocalStorage used for nested env overrides
   * (withEnv/withEnvSync).
   *
   * Constructed LAZILY (memoized) rather than at module-eval: an
   * AsyncLocalStorage holds a live native handle, and constructing it at import
   * time pins that handle into every module transitively importing this leaf —
   * aborting V8 --build-snapshot serialization. Deferring to first use keeps the
   * single-store semantics while leaving module import snapshot-safe.
   *
   * @private
   */
  function getIsolatedOverridesStorage() {
    if (isolatedOverridesStorage === void 0) {
      const { AsyncLocalStorage } =
        require_node_async_hooks.getNodeAsyncHooks();
      isolatedOverridesStorage = new AsyncLocalStorage();
    }
    return isolatedOverridesStorage;
  }
  /**
   * Check if an environment variable has been overridden.
   *
   * @example
   *   ;```typescript
   *   import { setEnv, hasOverride } from '@socketsecurity/lib/env/rewire'
   *
   *   hasOverride('CI') // false
   *   setEnv('CI', '1')
   *   hasOverride('CI') // true
   *   ```
   *
   * @param key - The environment variable name to check.
   *
   * @returns `true` if the variable has been overridden, `false` otherwise
   */
  function hasOverride(key) {
    return !!(getIsolatedOverrides()?.has(key) || sharedOverrides?.has(key));
  }
  /**
   * Check if an environment variable key exists, checking overrides first.
   *
   * Resolution order: 1. Isolated overrides (temporary - set via
   * withEnv/withEnvSync) 2. Shared overrides (persistent - set via setEnv in
   * beforeEach) 3. process.env (including vi.stubEnv modifications)
   *
   * @example
   *   ;```typescript
   *   import { isInEnv } from '@socketsecurity/lib/env/rewire'
   *
   *   isInEnv('PATH') // true (usually set)
   *   isInEnv('MISSING') // false
   *   ```
   *
   * @internal Used by env getters to check for key presence rather than value
   *   truthiness.
   */
  function isInEnv(key) {
    if (getIsolatedOverrides()?.has(key)) return true;
    if (sharedOverrides?.has(key)) return true;
    const env = safeProcessEnv();
    return env ? require_objects_predicates.hasOwn(env, key) : false;
  }
  /**
   * Clear all environment variable overrides. Useful in afterEach hooks to ensure
   * clean test state.
   *
   * @example
   *   ;```typescript
   *   import { resetEnv } from './rewire.mjs'
   *
   *   afterEach(() => {
   *     resetEnv()
   *   })
   *   ```
   */
  function resetEnv() {
    sharedOverrides?.clear();
  }
  /**
   * Read `process.env` without assuming a real Node `process`. Probes the
   * GLOBAL `process` via `typeof` (no `node:process` import — webpack throws
   * UnhandledSchemeError on `node:` specifiers before the `browser`-field stubs
   * apply), so browser bundles load this leaf cleanly and env getters read as
   * unset instead of throwing.
   *
   * @private
   */
  function safeProcessEnv() {
    return typeof process !== "undefined" && process ? process.env : void 0;
  }
  /**
   * Set an environment variable override for testing. This does not modify
   * process.env, only affects env getters.
   *
   * Works in test hooks (beforeEach) without needing AsyncLocalStorage context.
   * Vitest's module isolation ensures each test file has independent overrides.
   *
   * @example
   *   ;```typescript
   *   import { setEnv, resetEnv } from './rewire.mjs'
   *   import { isCI } from './ci.mjs'
   *
   *   beforeEach(() => {
   *     setEnv('CI', '1')
   *   })
   *
   *   afterEach(() => {
   *     resetEnv()
   *   })
   *
   *   it('should detect CI environment', () => {
   *     expect(isCI()).toBe(true)
   *   })
   *   ```
   */
  function setEnv(key, value) {
    sharedOverrides?.set(key, value);
  }
  /**
   * Run code with environment overrides in an isolated AsyncLocalStorage context.
   * Creates true context isolation - overrides don't leak to concurrent code.
   *
   * Useful for tests that need temporary overrides without affecting other tests
   * or for nested override scenarios.
   *
   * @example
   *   ;```typescript
   *   import { withEnv } from './rewire.mjs'
   *   import { isCI } from './ci.mjs'
   *
   *   // Temporary override in isolated context
   *   await withEnv({ CI: '1' }, async () => {
   *     expect(isCI()).toBe(true)
   *   })
   *   expect(isCI()).toBe(false) // Override is gone
   *   ```
   *
   * @example
   *   ;```typescript
   *   // Nested overrides work correctly
   *   setEnv('CI', '1') // Shared override (persistent)
   *
   *   await withEnv({ CI: '0' }, async () => {
   *     expect(isCI()).toBe(false) // Isolated override takes precedence
   *   })
   *
   *   expect(isCI()).toBe(true) // Back to shared override
   *   ```
   */
  async function withEnv(overrides, fn) {
    const map = new require_primordials_map_set.MapCtor(
      require_primordials_object.ObjectEntries(overrides),
    );
    return await getIsolatedOverridesStorage().run(map, fn);
  }
  /**
   * Synchronous version of withEnv for non-async code.
   *
   * @example
   *   ;```typescript
   *   import { withEnvSync } from './rewire.mjs'
   *   import { isCI } from './ci.mjs'
   *
   *   const result = withEnvSync({ CI: '1' }, () => {
   *     return isCI()
   *   })
   *   expect(result).toBe(true)
   *   ```
   */
  function withEnvSync(overrides, fn) {
    const map = new require_primordials_map_set.MapCtor(
      require_primordials_object.ObjectEntries(overrides),
    );
    return getIsolatedOverridesStorage().run(map, fn);
  }
  exports.clearEnv = clearEnv;
  exports.getAsyncHooks = getAsyncHooks;
  exports.getEnvValue = getEnvValue;
  exports.getIsolatedOverrides = getIsolatedOverrides;
  exports.getIsolatedOverridesStorage = getIsolatedOverridesStorage;
  exports.hasOverride = hasOverride;
  exports.isInEnv = isInEnv;
  exports.resetEnv = resetEnv;
  exports.safeProcessEnv = safeProcessEnv;
  exports.setEnv = setEnv;
  exports.withEnv = withEnv;
  exports.withEnvSync = withEnvSync;
});

var require_home = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_env_rewire = require_rewire$1();
  /**
   * @file HOME environment variable getter with Windows fallback. Returns the
   *   user's home directory. On Windows, HOME is typically unset — fall back to
   *   USERPROFILE before giving up, matching the resolution order used by npm,
   *   git, and Node's os.homedir().
   */
  /**
   * Returns the user's home directory path.
   *
   * Resolution order:
   *
   * 1. `$HOME` (POSIX, and sometimes set on Windows by shells like Git Bash)
   * 2. `$USERPROFILE` (Windows default, e.g. `C:\Users\alice`)
   *
   * Returns `undefined` only when neither is set, which on modern systems is
   * exceedingly rare outside of sandboxed or minimal-env test harnesses.
   *
   * @example
   *   ;```typescript
   *   import { getHome } from '@socketsecurity/lib/env/home'
   *
   *   const home = getHome()
   *   // POSIX: '/Users/alice'
   *   // Windows: 'C:\\Users\\alice'
   *   ```
   *
   * @returns The user's home directory path, or `undefined` if not resolvable
   */
  function getHome() {
    return (
      require_env_rewire.getEnvValue("HOME") ??
      require_env_rewire.getEnvValue("USERPROFILE")
    );
  }
  exports.getHome = getHome;
});

var require_number$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `Number`, its constants, predicates, and parse
   *   helpers. Predicates prefer the smol fast-path (`node:smol-primordial`);
   *   static `parseFloat` / `parseInt` use the FastOneByteString-typed bindings
   *   for ASCII inputs and fall back to stock `Number.parse*` otherwise.
   */
  const smolPrimordial = require_primordial().getSmolPrimordial();
  const NumberCtor = Number;
  const NumberEPSILON = Number.EPSILON;
  const NumberMAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
  const NumberMAX_VALUE = Number.MAX_VALUE;
  const NumberMIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER;
  const NumberMIN_VALUE = Number.MIN_VALUE;
  const NumberNEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;
  const NumberPOSITIVE_INFINITY = Number.POSITIVE_INFINITY;
  const NumberIsFinite = smolPrimordial?.numberIsFinite ?? Number.isFinite;
  const NumberIsInteger = smolPrimordial?.numberIsInteger ?? Number.isInteger;
  const NumberIsNaN = smolPrimordial?.numberIsNaN ?? Number.isNaN;
  const NumberIsSafeInteger =
    smolPrimordial?.numberIsSafeInteger ?? Number.isSafeInteger;
  const NumberParseFloat =
    smolPrimordial?.numberParseFloat ?? Number.parseFloat;
  const smolParseInt10 = smolPrimordial?.numberParseInt10;
  const stockParseInt = Number.parseInt;
  /* c8 ignore start - the smol Fast API binding ships only on socket-btm's smol Node binary, so this body cannot run under the stock-Node runner */
  function smolNumberParseInt(s, radix) {
    return radix === void 0 || radix === 10
      ? smolParseInt10(s)
      : stockParseInt(s, radix);
  }
  /* c8 ignore stop */
  const NumberParseInt = smolParseInt10 ? smolNumberParseInt : stockParseInt;
  const NumberPrototypeToExponential = require_primordials_uncurry.uncurryThis(
    Number.prototype.toExponential,
  );
  const NumberPrototypeToFixed = require_primordials_uncurry.uncurryThis(
    Number.prototype.toFixed,
  );
  const NumberPrototypeToPrecision = require_primordials_uncurry.uncurryThis(
    Number.prototype.toPrecision,
  );
  const NumberPrototypeToString = require_primordials_uncurry.uncurryThis(
    Number.prototype.toString,
  );
  const NumberPrototypeValueOf = require_primordials_uncurry.uncurryThis(
    Number.prototype.valueOf,
  );
  exports.NumberCtor = NumberCtor;
  exports.NumberEPSILON = NumberEPSILON;
  exports.NumberIsFinite = NumberIsFinite;
  exports.NumberIsInteger = NumberIsInteger;
  exports.NumberIsNaN = NumberIsNaN;
  exports.NumberIsSafeInteger = NumberIsSafeInteger;
  exports.NumberMAX_SAFE_INTEGER = NumberMAX_SAFE_INTEGER;
  exports.NumberMAX_VALUE = NumberMAX_VALUE;
  exports.NumberMIN_SAFE_INTEGER = NumberMIN_SAFE_INTEGER;
  exports.NumberMIN_VALUE = NumberMIN_VALUE;
  exports.NumberNEGATIVE_INFINITY = NumberNEGATIVE_INFINITY;
  exports.NumberPOSITIVE_INFINITY = NumberPOSITIVE_INFINITY;
  exports.NumberParseFloat = NumberParseFloat;
  exports.NumberParseInt = NumberParseInt;
  exports.NumberPrototypeToExponential = NumberPrototypeToExponential;
  exports.NumberPrototypeToFixed = NumberPrototypeToFixed;
  exports.NumberPrototypeToPrecision = NumberPrototypeToPrecision;
  exports.NumberPrototypeToString = NumberPrototypeToString;
  exports.NumberPrototypeValueOf = NumberPrototypeValueOf;
  exports.smolNumberParseInt = smolNumberParseInt;
});

var require_number = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_number = require_number$1();
  /**
   * @file `envAsNumber` — coerce an env-var-shaped value into a number. `mode:
   *   'int'` uses `parseInt(_, 10)`; `mode: 'float'` uses `Number()`. Non-finite
   *   results round-trip through `defaultValue` unless `allowInfinity: true` is
   *   set.
   */
  /**
   * Convert an environment variable value to a number.
   *
   * @example
   *   ;```typescript
   *   import { envAsNumber } from '@socketsecurity/lib/env/number'
   *
   *   envAsNumber('3000') // 3000 (int mode)
   *   envAsNumber('3.14', { mode: 'float' }) // 3.14
   *   envAsNumber('abc') // 0
   *   envAsNumber(undefined, { defaultValue: 42 }) // 42
   *   ```
   *
   * @param value - The value to convert.
   * @param options - Options bag: `defaultValue`, `mode`, `allowInfinity`.
   *
   * @returns The parsed number, or the default value if parsing fails
   */
  function envAsNumber(value, options) {
    const {
      allowInfinity = false,
      defaultValue = 0,
      mode = "int",
    } = {
      __proto__: null,
      ...options,
    };
    if (value === void 0 || value === null) return defaultValue;
    const num =
      mode === "float"
        ? require_primordials_number.NumberCtor(String(value))
        : require_primordials_number.NumberParseInt(String(value), 10);
    if (typeof value === "string") {
      if (!value || require_primordials_number.NumberIsNaN(num))
        return defaultValue;
      if (!require_primordials_number.NumberIsFinite(num))
        return allowInfinity ? num : defaultValue;
      return num || 0;
    }
    return (
      (require_primordials_number.NumberIsFinite(num)
        ? num
        : require_primordials_number.NumberCtor(defaultValue)) || 0
    );
  }
  exports.envAsNumber = envAsNumber;
});

var require_socket_mcp = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_env_rewire = require_rewire$1();
  const require_primordials_number = require_number$1();
  const require_env_number = require_number();
  /**
   * @file Socket MCP HTTP server environment variable getters. Covers the MCP
   *   transport (HTTP mode, port) and the OAuth credentials / proxy-trust
   *   settings the MCP HTTP server reads at startup.
   */
  /**
   * Whether the MCP server should run in HTTP mode. MCP_HTTP_MODE — when set to
   * the literal string `'true'`, the MCP server serves over HTTP instead of
   * stdio. Returns `false` for any other value, unset included.
   *
   * @example
   *   ;```typescript
   *   import { getMcpHttpMode } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   if (getMcpHttpMode()) {
   *     startHttpServer()
   *   }
   *   ```
   *
   * @returns `true` if HTTP mode is enabled, `false` otherwise
   */
  function getMcpHttpMode() {
    return require_env_rewire.getEnvValue("MCP_HTTP_MODE") === "true";
  }
  /**
   * MCP HTTP server listen port. MCP_PORT — port the MCP HTTP server binds to.
   * Defaults to `3000`, matching socket-mcp's documented default. Invalid /
   * non-numeric values also fall back to `3000`.
   *
   * @example
   *   ;```typescript
   *   import { getMcpPort } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   const port = getMcpPort()
   *   ```
   *
   * @returns The MCP server port (default `3000`)
   */
  function getMcpPort() {
    const parsed = require_env_number.envAsNumber(
      require_env_rewire.getEnvValue("MCP_PORT"),
    );
    return require_primordials_number.NumberIsFinite(parsed) && parsed > 0
      ? parsed
      : 3e3;
  }
  /**
   * OAuth introspection client ID for the MCP HTTP server.
   * SOCKET_OAUTH_INTROSPECTION_CLIENT_ID — client credential used to call the
   * issuer's introspection endpoint. Empty string when unset.
   *
   * @example
   *   ;```typescript
   *   import { getSocketOauthIntrospectionClientId } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   const clientId = getSocketOauthIntrospectionClientId()
   *   ```
   *
   * @returns The OAuth client ID, or `''` if not set
   */
  function getSocketOauthIntrospectionClientId() {
    return (
      require_env_rewire.getEnvValue("SOCKET_OAUTH_INTROSPECTION_CLIENT_ID") ??
      ""
    );
  }
  /**
   * OAuth introspection client secret for the MCP HTTP server.
   * SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET — paired with the client ID for
   * authenticated introspection requests. Empty string when unset.
   *
   * @example
   *   ;```typescript
   *   import { getSocketOauthIntrospectionClientSecret } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   const clientSecret = getSocketOauthIntrospectionClientSecret()
   *   ```
   *
   * @returns The OAuth client secret, or `''` if not set
   */
  function getSocketOauthIntrospectionClientSecret() {
    return (
      require_env_rewire.getEnvValue(
        "SOCKET_OAUTH_INTROSPECTION_CLIENT_SECRET",
      ) ?? ""
    );
  }
  /**
   * OAuth issuer URL for the MCP HTTP server. SOCKET_OAUTH_ISSUER — issuer to
   * validate inbound OAuth tokens against. Returns the empty string when unset;
   * callers treat empty as "no issuer configured".
   *
   * @example
   *   ;```typescript
   *   import { getSocketOauthIssuer } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   const issuer = getSocketOauthIssuer()
   *   if (issuer) { ... }
   *   ```
   *
   * @returns The OAuth issuer URL, or `''` if not set
   */
  function getSocketOauthIssuer() {
    return require_env_rewire.getEnvValue("SOCKET_OAUTH_ISSUER") ?? "";
  }
  /**
   * Required OAuth scopes for the MCP HTTP server. SOCKET_OAUTH_REQUIRED_SCOPES —
   * whitespace-separated list of scopes inbound tokens must carry. Defaults to
   * `'packages:list'`, the minimum scope socket-mcp's depscore tool needs.
   *
   * @example
   *   ;```typescript
   *   import { getSocketOauthRequiredScopes } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   const scopes = getSocketOauthRequiredScopes().split(/\s+/u)
   *   ```
   *
   * @returns The required-scopes string, defaulting to `'packages:list'`
   */
  function getSocketOauthRequiredScopes() {
    return (
      require_env_rewire.getEnvValue("SOCKET_OAUTH_REQUIRED_SCOPES") ??
      "packages:list"
    );
  }
  /**
   * Whether the MCP HTTP server should trust upstream proxy headers. TRUST_PROXY
   * — when set to the literal string `'true'`, the server honors
   * `X-Forwarded-Host` / `X-Forwarded-Proto` when composing OAuth metadata URLs.
   * Off by default to prevent header spoofing when no upstream proxy is present.
   *
   * @example
   *   ;```typescript
   *   import { getTrustProxy } from '@socketsecurity/lib/env/socket-mcp'
   *
   *   if (getTrustProxy()) { ... }
   *   ```
   *
   * @returns `true` if proxy headers are trusted, `false` otherwise
   */
  function getTrustProxy() {
    return require_env_rewire.getEnvValue("TRUST_PROXY") === "true";
  }
  exports.getMcpHttpMode = getMcpHttpMode;
  exports.getMcpPort = getMcpPort;
  exports.getSocketOauthIntrospectionClientId =
    getSocketOauthIntrospectionClientId;
  exports.getSocketOauthIntrospectionClientSecret =
    getSocketOauthIntrospectionClientSecret;
  exports.getSocketOauthIssuer = getSocketOauthIssuer;
  exports.getSocketOauthRequiredScopes = getSocketOauthRequiredScopes;
  exports.getTrustProxy = getTrustProxy;
});

var require_socket$1 = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_env_boolean = require_boolean();
  const require_env_rewire = require_rewire$1();
  const require_env_number = require_number();
  const require_env_socket_mcp = require_socket_mcp();
  /**
   * @file Socket Security environment variable getters.
   */
  /**
   * SOCKET_ACCEPT_RISKS environment variable getter. Whether to accept all Socket
   * Security risks.
   *
   * @example
   *   ;```typescript
   *   import { getSocketAcceptRisks } from '@socketsecurity/lib/env/socket'
   *
   *   if (getSocketAcceptRisks()) {
   *     console.log('All risks accepted')
   *   }
   *   ```
   *
   * @returns `true` if risks are accepted, `false` otherwise
   */
  function getSocketAcceptRisks() {
    return require_env_boolean.envAsBoolean(
      require_env_rewire.getEnvValue("SOCKET_ACCEPT_RISKS"),
    );
  }
  /**
   * SOCKET_API_BASE_URL environment variable getter. Socket Security API base
   * URL.
   *
   * @example
   *   ;```typescript
   *   import { getSocketApiBaseUrl } from '@socketsecurity/lib/env/socket'
   *
   *   const baseUrl = getSocketApiBaseUrl()
   *   // e.g. 'https://api.socket.dev' or undefined
   *   ```
   *
   * @returns The API base URL, or `undefined` if not set
   */
  function getSocketApiBaseUrl() {
    return require_env_rewire.getEnvValue("SOCKET_API_BASE_URL");
  }
  /**
   * SOCKET_API_PROXY environment variable getter. Proxy URL for Socket Security
   * API requests.
   *
   * @example
   *   ;```typescript
   *   import { getSocketApiProxy } from '@socketsecurity/lib/env/socket'
   *
   *   const proxy = getSocketApiProxy()
   *   // e.g. 'http://proxy.example.com:8080' or undefined
   *   ```
   *
   * @returns The API proxy URL, or `undefined` if not set
   */
  function getSocketApiProxy() {
    return require_env_rewire.getEnvValue("SOCKET_API_PROXY");
  }
  /**
   * SOCKET_API_TIMEOUT environment variable getter. Timeout in milliseconds for
   * Socket Security API requests.
   *
   * @example
   *   ;```typescript
   *   import { getSocketApiTimeout } from '@socketsecurity/lib/env/socket'
   *
   *   const timeout = getSocketApiTimeout()
   *   // e.g. 30000 or 0 if not set
   *   ```
   *
   * @returns The timeout in milliseconds, or `0` if not set
   */
  function getSocketApiTimeout() {
    return require_env_number.envAsNumber(
      require_env_rewire.getEnvValue("SOCKET_API_TIMEOUT"),
    );
  }
  /**
   * Socket Security API authentication token.
   *
   * Checks the canonical SOCKET_API_TOKEN first, then a chain of legacy aliases
   * for full v1.x backward compatibility plus the bare SOCKET_API_KEY form used
   * by older MCP-server installs:
   *
   * SOCKET_API_TOKEN → SOCKET_API_KEY → SOCKET_CLI_API_TOKEN → SOCKET_CLI_API_KEY
   * → SOCKET_SECURITY_API_TOKEN → SOCKET_SECURITY_API_KEY.
   *
   * @example
   *   ;```typescript
   *   import { getSocketApiToken } from '@socketsecurity/lib/env/socket'
   *
   *   const token = getSocketApiToken()
   *   // e.g. a Socket API token string or undefined
   *   ```
   *
   * @returns The API token, or `undefined` if no name in the chain is set
   */
  function getSocketApiToken() {
    return (
      require_env_rewire.getEnvValue("SOCKET_API_TOKEN") ||
      require_env_rewire.getEnvValue("SOCKET_API_KEY") ||
      require_env_rewire.getEnvValue("SOCKET_CLI_API_TOKEN") ||
      require_env_rewire.getEnvValue("SOCKET_CLI_API_KEY") ||
      require_env_rewire.getEnvValue("SOCKET_SECURITY_API_TOKEN") ||
      require_env_rewire.getEnvValue("SOCKET_SECURITY_API_KEY")
    );
  }
  /**
   * Socket API endpoint URL override. SOCKET_API_URL — when set, replaces the
   * app's default Socket API base. Each consumer composes its own default (e.g.
   * socket-mcp's depscore endpoint vs. socket-cli's scan endpoints), so this
   * helper returns the raw override and lets the caller fall back.
   *
   * @example
   *   ;```typescript
   *   import { getSocketApiUrl } from '@socketsecurity/lib/env/socket'
   *
   *   const apiUrl = getSocketApiUrl() ?? 'https://api.socket.dev/v0/...'
   *   ```
   *
   * @returns The API URL override, or `undefined` if not set
   */
  function getSocketApiUrl() {
    return require_env_rewire.getEnvValue("SOCKET_API_URL");
  }
  /**
   * Git branch name for the current Socket scan. SOCKET_BRANCH_NAME — set by CI /
   * GHA to label the scan with the source branch. Used by basics and coana.
   *
   * @example
   *   ;```typescript
   *   import { getSocketBranchName } from '@socketsecurity/lib/env/socket'
   *
   *   const branch = getSocketBranchName()
   *   ```
   *
   * @returns The branch name, or `undefined` if not set
   */
  function getSocketBranchName() {
    return require_env_rewire.getEnvValue("SOCKET_BRANCH_NAME");
  }
  /**
   * SOCKET_CACACHE_DIR environment variable getter. Overrides the default Socket
   * cacache directory location.
   *
   * @example
   *   ;```typescript
   *   import { getSocketCacacheDirEnv } from '@socketsecurity/lib/env/socket'
   *
   *   const dir = getSocketCacacheDirEnv()
   *   // e.g. '/tmp/.socket-cache' or undefined
   *   ```
   *
   * @returns The cacache directory path, or `undefined` if not set
   */
  function getSocketCacacheDirEnv() {
    return require_env_rewire.getEnvValue("SOCKET_CACACHE_DIR");
  }
  /**
   * SOCKET_CLOUD_AUTH_URL environment variable getter. SocketCloud OAuth
   * authorization URL. depot's better-auth provider config reads this to override
   * the default authorize endpoint when pointing at a staging or self-hosted
   * SocketCloud server.
   *
   * @example
   *   ;```typescript
   *   import { getSocketCloudAuthUrl } from '@socketsecurity/lib/env/socket'
   *
   *   const url =
   *     getSocketCloudAuthUrl() ?? 'https://api.socket.dev/v1/oauth2/authorize'
   *   ```
   *
   * @returns The override URL, or `undefined` when default applies
   */
  function getSocketCloudAuthUrl() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_AUTH_URL");
  }
  /**
   * SOCKET_CLOUD_CLIENT_ID environment variable getter. OAuth client ID for
   * SocketCloud. Required (alongside SOCKET_CLOUD_CLIENT_SECRET) to enable the
   * SocketCloud auth provider. Returns `undefined` when not configured — callers
   * should treat that as "SocketCloud auth disabled".
   *
   * @returns The client ID, or `undefined` if not set
   */
  function getSocketCloudClientId() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_CLIENT_ID");
  }
  /**
   * SOCKET_CLOUD_CLIENT_SECRET environment variable getter. OAuth client secret
   * for SocketCloud. Required (alongside SOCKET_CLOUD_CLIENT_ID) to enable the
   * SocketCloud auth provider. Returns `undefined` when not configured.
   *
   * @returns The client secret, or `undefined` if not set
   */
  function getSocketCloudClientSecret() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_CLIENT_SECRET");
  }
  /**
   * SOCKET_CLOUD_INTROSPECT_URL environment variable getter. SocketCloud OAuth
   * token-introspection URL. depot uses this to verify access tokens against the
   * SocketCloud authorization server. Defaults handled at the call site.
   *
   * @returns The override URL, or `undefined` when default applies
   */
  function getSocketCloudIntrospectUrl() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_INTROSPECT_URL");
  }
  /**
   * SOCKET_CLOUD_TOKEN_URL environment variable getter. SocketCloud OAuth
   * token-exchange URL. depot's better-auth provider config reads this to
   * override the default token endpoint.
   *
   * @returns The override URL, or `undefined` when default applies
   */
  function getSocketCloudTokenUrl() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_TOKEN_URL");
  }
  /**
   * SOCKET_CLOUD_USERINFO_URL environment variable getter. SocketCloud OAuth
   * userinfo endpoint. depot uses this to fetch the authenticated principal's
   * profile after an OAuth code exchange.
   *
   * @returns The override URL, or `undefined` when default applies
   */
  function getSocketCloudUserinfoUrl() {
    return require_env_rewire.getEnvValue("SOCKET_CLOUD_USERINFO_URL");
  }
  /**
   * SOCKET_CONFIG environment variable getter. Socket Security configuration file
   * path.
   *
   * @example
   *   ;```typescript
   *   import { getSocketConfig } from '@socketsecurity/lib/env/socket'
   *
   *   const config = getSocketConfig()
   *   // e.g. '/tmp/project/socket.yml' or undefined
   *   ```
   *
   * @returns The config file path, or `undefined` if not set
   */
  function getSocketConfig() {
    return require_env_rewire.getEnvValue("SOCKET_CONFIG");
  }
  /**
   * SOCKET_DEBUG environment variable getter. Controls Socket-specific debug
   * output.
   *
   * @example
   *   ;```typescript
   *   import { getSocketDebug } from '@socketsecurity/lib/env/socket'
   *
   *   const debug = getSocketDebug()
   *   // e.g. '*' or 'api' or undefined
   *   ```
   *
   * @returns The Socket debug filter, or `undefined` if not set
   */
  function getSocketDebug() {
    return require_env_rewire.getEnvValue("SOCKET_DEBUG");
  }
  /**
   * SOCKET_DLX_DIR environment variable getter. Overrides the default Socket DLX
   * directory location.
   *
   * @example
   *   ;```typescript
   *   import { getSocketDlxDirEnv } from '@socketsecurity/lib/env/socket'
   *
   *   const dlxDir = getSocketDlxDirEnv()
   *   // e.g. '/tmp/.socket-dlx' or undefined
   *   ```
   *
   * @returns The DLX directory path, or `undefined` if not set
   */
  function getSocketDlxDirEnv() {
    return require_env_rewire.getEnvValue("SOCKET_DLX_DIR");
  }
  /**
   * SOCKET_HOME environment variable getter. Socket Security home directory path.
   *
   * @example
   *   ;```typescript
   *   import { getSocketHome } from '@socketsecurity/lib/env/socket'
   *
   *   const home = getSocketHome()
   *   // e.g. '/tmp/.socket' or undefined
   *   ```
   *
   * @returns The Socket home directory, or `undefined` if not set
   */
  function getSocketHome() {
    return require_env_rewire.getEnvValue("SOCKET_HOME");
  }
  /**
   * SOCKET_NO_API_TOKEN environment variable getter. Whether to skip Socket
   * Security API token requirement.
   *
   * @example
   *   ;```typescript
   *   import { getSocketNoApiToken } from '@socketsecurity/lib/env/socket'
   *
   *   if (getSocketNoApiToken()) {
   *     console.log('API token requirement skipped')
   *   }
   *   ```
   *
   * @returns `true` if the API token requirement is skipped, `false` otherwise
   */
  function getSocketNoApiToken() {
    return require_env_boolean.envAsBoolean(
      require_env_rewire.getEnvValue("SOCKET_NO_API_TOKEN"),
    );
  }
  /**
   * SOCKET_NPM_REGISTRY environment variable getter. Alternative name for the
   * Socket NPM registry URL.
   *
   * @example
   *   ;```typescript
   *   import { getSocketNpmRegistry } from '@socketsecurity/lib/env/socket'
   *
   *   const registry = getSocketNpmRegistry()
   *   // e.g. 'https://npm.socket.dev/' or undefined
   *   ```
   *
   * @returns The Socket NPM registry URL, or `undefined` if not set
   */
  function getSocketNpmRegistry() {
    return require_env_rewire.getEnvValue("SOCKET_NPM_REGISTRY");
  }
  /**
   * SOCKET_ORG_SLUG environment variable getter. Socket Security organization
   * slug identifier.
   *
   * @example
   *   ;```typescript
   *   import { getSocketOrgSlug } from '@socketsecurity/lib/env/socket'
   *
   *   const slug = getSocketOrgSlug()
   *   // e.g. 'my-org' or undefined
   *   ```
   *
   * @returns The organization slug, or `undefined` if not set
   */
  function getSocketOrgSlug() {
    return require_env_rewire.getEnvValue("SOCKET_ORG_SLUG");
  }
  /**
   * SOCKET_REGISTRY_URL environment variable getter. Socket Registry URL for
   * package installation.
   *
   * @example
   *   ;```typescript
   *   import { getSocketRegistryUrl } from '@socketsecurity/lib/env/socket'
   *
   *   const registryUrl = getSocketRegistryUrl()
   *   // e.g. 'https://registry.socket.dev/' or undefined
   *   ```
   *
   * @returns The Socket registry URL, or `undefined` if not set
   */
  function getSocketRegistryUrl() {
    return require_env_rewire.getEnvValue("SOCKET_REGISTRY_URL");
  }
  /**
   * Repository name for the current Socket scan. SOCKET_REPOSITORY_NAME
   * (canonical) — set by CI / GHA to label the scan with the source repository.
   * Also accepts `SOCKET_REPO_NAME` as an alias. Used by basics and coana.
   *
   * @example
   *   ;```typescript
   *   import { getSocketRepositoryName } from '@socketsecurity/lib/env/socket'
   *
   *   const repo = getSocketRepositoryName()
   *   ```
   *
   * @returns The repository name, or `undefined` if neither is set
   */
  function getSocketRepositoryName() {
    return (
      require_env_rewire.getEnvValue("SOCKET_REPOSITORY_NAME") ||
      require_env_rewire.getEnvValue("SOCKET_REPO_NAME")
    );
  }
  /**
   * SOCKET_STATE_DIR environment variable getter. Overrides the default Socket
   * state directory (~/.socket/_state) location.
   *
   * @returns The state directory path, or `undefined` if not set
   */
  function getSocketStateDirEnv() {
    return require_env_rewire.getEnvValue("SOCKET_STATE_DIR");
  }
  /**
   * SOCKET_VIEW_ALL_RISKS environment variable getter. Whether to view all Socket
   * Security risks.
   *
   * @example
   *   ;```typescript
   *   import { getSocketViewAllRisks } from '@socketsecurity/lib/env/socket'
   *
   *   if (getSocketViewAllRisks()) {
   *     console.log('Viewing all risks')
   *   }
   *   ```
   *
   * @returns `true` if viewing all risks, `false` otherwise
   */
  function getSocketViewAllRisks() {
    return require_env_boolean.envAsBoolean(
      require_env_rewire.getEnvValue("SOCKET_VIEW_ALL_RISKS"),
    );
  }
  exports.getMcpHttpMode = require_env_socket_mcp.getMcpHttpMode;
  exports.getMcpPort = require_env_socket_mcp.getMcpPort;
  exports.getSocketAcceptRisks = getSocketAcceptRisks;
  exports.getSocketApiBaseUrl = getSocketApiBaseUrl;
  exports.getSocketApiProxy = getSocketApiProxy;
  exports.getSocketApiTimeout = getSocketApiTimeout;
  exports.getSocketApiToken = getSocketApiToken;
  exports.getSocketApiUrl = getSocketApiUrl;
  exports.getSocketBranchName = getSocketBranchName;
  exports.getSocketCacacheDirEnv = getSocketCacacheDirEnv;
  exports.getSocketCloudAuthUrl = getSocketCloudAuthUrl;
  exports.getSocketCloudClientId = getSocketCloudClientId;
  exports.getSocketCloudClientSecret = getSocketCloudClientSecret;
  exports.getSocketCloudIntrospectUrl = getSocketCloudIntrospectUrl;
  exports.getSocketCloudTokenUrl = getSocketCloudTokenUrl;
  exports.getSocketCloudUserinfoUrl = getSocketCloudUserinfoUrl;
  exports.getSocketConfig = getSocketConfig;
  exports.getSocketDebug = getSocketDebug;
  exports.getSocketDlxDirEnv = getSocketDlxDirEnv;
  exports.getSocketHome = getSocketHome;
  exports.getSocketNoApiToken = getSocketNoApiToken;
  exports.getSocketNpmRegistry = getSocketNpmRegistry;
  exports.getSocketOauthIntrospectionClientId =
    require_env_socket_mcp.getSocketOauthIntrospectionClientId;
  exports.getSocketOauthIntrospectionClientSecret =
    require_env_socket_mcp.getSocketOauthIntrospectionClientSecret;
  exports.getSocketOauthIssuer = require_env_socket_mcp.getSocketOauthIssuer;
  exports.getSocketOauthRequiredScopes =
    require_env_socket_mcp.getSocketOauthRequiredScopes;
  exports.getSocketOrgSlug = getSocketOrgSlug;
  exports.getSocketRegistryUrl = getSocketRegistryUrl;
  exports.getSocketRepositoryName = getSocketRepositoryName;
  exports.getSocketStateDirEnv = getSocketStateDirEnv;
  exports.getSocketViewAllRisks = getSocketViewAllRisks;
  exports.getTrustProxy = require_env_socket_mcp.getTrustProxy;
});

var require_windows = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_env_rewire = require_rewire$1();
  const require_node_path = require_path$1();
  const require_paths_shared = require_shared$2();
  /**
   * @file Windows environment variable getters. Provides access to
   *   Windows-specific user directory paths.
   */
  /**
   * APPDATA environment variable. Points to the Application Data directory on
   * Windows.
   *
   * @example
   *   ;```typescript
   *   import { getAppdata } from '@socketsecurity/lib/env/windows'
   *
   *   const appdata = getAppdata()
   *   // e.g. 'C:\\Users\\Public\\AppData\\Roaming' or undefined
   *   ```
   *
   * @returns The Windows AppData roaming directory, or `undefined` if not set
   */
  function getAppdata() {
    return require_env_rewire.getEnvValue("APPDATA");
  }
  /**
   * The Windows roaming Application Data directory, falling back to the
   * conventional location under `homeDir` when APPDATA is unset. Sole owner of
   * the `AppData/Roaming` tail: every caller reads it from here so a relocation
   * is a one-file edit.
   *
   * @example
   *   ;```typescript
   *   import { getAppdataDir } from '@socketsecurity/lib/env/windows'
   *
   *   const dir = getAppdataDir(os.homedir())
   *   // e.g. 'C:\\Users\\Public\\AppData\\Roaming'
   *   ```
   *
   * @param homeDir - The user home directory used for the fallback.
   *
   * @returns The roaming AppData directory path
   */
  function getAppdataDir(homeDir) {
    const path = require_node_path.getNodePath();
    return (
      getAppdata() ??
      require_paths_shared.normalizePath(
        path.join(homeDir, "AppData", "Roaming"),
      )
    );
  }
  /**
   * COMSPEC environment variable. Points to the Windows command processor
   * (typically cmd.exe).
   *
   * @example
   *   ;```typescript
   *   import { getComspec } from '@socketsecurity/lib/env/windows'
   *
   *   const comspec = getComspec()
   *   // e.g. 'C:\\Windows\\system32\\cmd.exe' or undefined
   *   ```
   *
   * @returns The path to the command processor, or `undefined` if not set
   */
  function getComspec() {
    return require_env_rewire.getEnvValue("COMSPEC");
  }
  /**
   * LOCALAPPDATA environment variable. Points to the Local Application Data
   * directory on Windows.
   *
   * @example
   *   ;```typescript
   *   import { getLocalappdata } from '@socketsecurity/lib/env/windows'
   *
   *   const localAppdata = getLocalappdata()
   *   // e.g. 'C:\\Users\\Public\\AppData\\Local' or undefined
   *   ```
   *
   * @returns The Windows local AppData directory, or `undefined` if not set
   */
  function getLocalappdata() {
    return require_env_rewire.getEnvValue("LOCALAPPDATA");
  }
  /**
   * USERPROFILE environment variable. Windows user home directory path.
   *
   * @example
   *   ;```typescript
   *   import { getUserprofile } from '@socketsecurity/lib/env/windows'
   *
   *   const userprofile = getUserprofile()
   *   // e.g. 'C:\\Users\\Public' or undefined
   *   ```
   *
   * @returns The Windows user profile directory, or `undefined` if not set
   */
  function getUserprofile() {
    return require_env_rewire.getEnvValue("USERPROFILE");
  }
  exports.getAppdata = getAppdata;
  exports.getAppdataDir = getAppdataDir;
  exports.getComspec = getComspec;
  exports.getLocalappdata = getLocalappdata;
  exports.getUserprofile = getUserprofile;
});

var require_xdg = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_env_rewire = require_rewire$1();
  /**
   * @file XDG Base Directory Specification environment variable getters. Provides
   *   access to XDG user directories on Unix systems.
   */
  /**
   * XDG_CACHE_HOME environment variable. XDG Base Directory specification cache
   * directory.
   *
   * @example
   *   ;```typescript
   *   import { getXdgCacheHome } from '@socketsecurity/lib/env/xdg'
   *
   *   const cacheDir = getXdgCacheHome()
   *   // e.g. '/tmp/.cache' or undefined
   *   ```
   *
   * @returns The XDG cache directory path, or `undefined` if not set
   */
  function getXdgCacheHome() {
    return require_env_rewire.getEnvValue("XDG_CACHE_HOME");
  }
  /**
   * XDG_CONFIG_HOME environment variable. XDG Base Directory specification config
   * directory.
   *
   * @example
   *   ;```typescript
   *   import { getXdgConfigHome } from '@socketsecurity/lib/env/xdg'
   *
   *   const configDir = getXdgConfigHome()
   *   // e.g. '/tmp/.config' or undefined
   *   ```
   *
   * @returns The XDG config directory path, or `undefined` if not set
   */
  function getXdgConfigHome() {
    return require_env_rewire.getEnvValue("XDG_CONFIG_HOME");
  }
  /**
   * XDG_DATA_HOME environment variable. Points to the user's data directory on
   * Unix systems.
   *
   * @example
   *   ;```typescript
   *   import { getXdgDataHome } from '@socketsecurity/lib/env/xdg'
   *
   *   const dataDir = getXdgDataHome()
   *   // e.g. '/tmp/.local/share' or undefined
   *   ```
   *
   * @returns The XDG data directory path, or `undefined` if not set
   */
  function getXdgDataHome() {
    return require_env_rewire.getEnvValue("XDG_DATA_HOME");
  }
  /**
   * XDG_RUNTIME_DIR environment variable. XDG Base Directory specification
   * runtime directory — the home for ephemeral, owner-only runtime objects such
   * as daemon sockets and locks. Set by systemd to `/run/user/<uid>`; absent on
   * macOS and many non-systemd setups, so callers must provide a fallback.
   *
   * @example
   *   ;```typescript
   *   import { getXdgRuntimeDir } from '@socketsecurity/lib/env/xdg'
   *
   *   const runtimeDir = getXdgRuntimeDir()
   *   // e.g. '/run/user/1000' or undefined
   *   ```
   *
   * @returns The XDG runtime directory path, or `undefined` if not set
   */
  function getXdgRuntimeDir() {
    return require_env_rewire.getEnvValue("XDG_RUNTIME_DIR");
  }
  exports.getXdgCacheHome = getXdgCacheHome;
  exports.getXdgConfigHome = getXdgConfigHome;
  exports.getXdgDataHome = getXdgDataHome;
  exports.getXdgRuntimeDir = getXdgRuntimeDir;
});

var require_dirnames = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Directory name and path pattern constants.
   */
  const NODE_MODULES = "node_modules";
  const DOT_GIT_DIR = ".git";
  const DOT_GITHUB = ".github";
  const DOT_SOCKET_DIR = ".socket";
  const CACHE_DIR = "cache";
  const CACHE_TTL_DIR = "ttl";
  const RUN_DIR = "run";
  const NODE_MODULES_GLOB_RECURSIVE = "**/node_modules";
  const SLASH_NODE_MODULES_SLASH = "/node_modules/";
  exports.CACHE_DIR = CACHE_DIR;
  exports.CACHE_TTL_DIR = CACHE_TTL_DIR;
  exports.DOT_GITHUB = DOT_GITHUB;
  exports.DOT_GIT_DIR = DOT_GIT_DIR;
  exports.DOT_SOCKET_DIR = DOT_SOCKET_DIR;
  exports.NODE_MODULES = NODE_MODULES;
  exports.NODE_MODULES_GLOB_RECURSIVE = NODE_MODULES_GLOB_RECURSIVE;
  exports.RUN_DIR = RUN_DIR;
  exports.SLASH_NODE_MODULES_SLASH = SLASH_NODE_MODULES_SLASH;
});

var require_rewire = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_map_set = require_map_set();
  /**
   * @file Path rewiring utilities for testing. Allows tests to override
   *   os.tmpdir() and os.homedir() without directly modifying them. Features:
   *
   *   - Test-friendly setPath/clearPath/resetPaths that work in
   *     beforeEach/afterEach
   *   - Automatic cache invalidation for path-dependent modules
   *   - Thread-safe for concurrent test execution
   */
  const stateSymbol = Symbol.for("@socketsecurity/lib/paths/rewire/state");
  const globalState = globalThis;
  if (!globalState[stateSymbol])
    globalState[stateSymbol] = {
      testOverrides: new require_primordials_map_set.MapCtor(),
      cacheInvalidationCallbacks: [],
    };
  const sharedState = globalState[stateSymbol];
  const testOverrides = sharedState.testOverrides;
  const cacheInvalidationCallbacks = sharedState.cacheInvalidationCallbacks;
  /**
   * Clear a specific path override.
   */
  function clearPath(key) {
    testOverrides.delete(key);
    invalidateCaches();
  }
  /**
   * Get a path value, checking overrides first.
   *
   * Resolution order:
   *
   * 1. Test overrides, set via setPath in beforeEach.
   * 2. Original function call, recomputed on every call.
   *
   * `originalFn` is not memoized here: its typical inputs (env vars such as
   * HOME / SOCKET_HOME, os.homedir(), os.tmpdir()) can change without going
   * through setPath/clearPath/resetPaths - `env/rewire`'s setEnv/clearEnv, or a
   * direct process.env write, update those inputs without calling this
   * module's invalidateCaches(). A memo keyed only on `key` would then serve a
   * value computed against the OLD input forever, since nothing here observes
   * the env change to know the memo is stale. `originalFn` is a cheap pure
   * read (a string join, an env lookup) in every current caller, so recomputing
   * it every call costs nothing measurable and removes the staleness class
   * entirely.
   *
   * @internal Used by path getters to support test rewiring
   */
  function getPathValue(key, originalFn) {
    if (testOverrides.has(key)) return testOverrides.get(key);
    return originalFn();
  }
  /**
   * Check if a path has been overridden.
   */
  function hasOverride(key) {
    return testOverrides.has(key);
  }
  /**
   * Run every registered cache-invalidation callback. Called automatically
   * when setPath/clearPath/resetPaths are used, so a module that maintains its
   * OWN cache derived from a path (via registerCacheInvalidation) still gets
   * to clear it on override changes. getPathValue itself has nothing to
   * invalidate - it no longer memoizes - so this only reaches other modules'
   * registered caches.
   *
   * @internal Primarily for internal use, but exported for advanced testing
   */
  function invalidateCaches() {
    for (const callback of cacheInvalidationCallbacks)
      try {
        callback();
      } catch {}
  }
  /**
   * Register a cache invalidation callback. Called by modules that need to clear
   * their caches when paths change.
   *
   * @internal Used by paths.ts and fs.ts
   */
  function registerCacheInvalidation(callback) {
    cacheInvalidationCallbacks.push(callback);
  }
  /**
   * Clear all path overrides and reset caches. Useful in afterEach hooks to
   * ensure clean test state.
   *
   * @example
   *   ;```typescript
   *   import { resetPaths } from '#paths/rewire'
   *
   *   afterEach(() => {
   *     resetPaths()
   *   })
   *   ```
   */
  function resetPaths() {
    testOverrides.clear();
    invalidateCaches();
  }
  /**
   * Set a path override for testing. This triggers cache invalidation for
   * path-dependent modules.
   *
   * @example
   *   ;```typescript
   *   import { setPath, resetPaths } from '#paths/rewire'
   *   import { getOsTmpDir } from './'
   *
   *   beforeEach(() => {
   *     setPath('tmpdir', '/custom/tmp')
   *   })
   *
   *   afterEach(() => {
   *     resetPaths()
   *   })
   *
   *   it('should use custom temp directory', () => {
   *     expect(getOsTmpDir()).toBe('/custom/tmp')
   *   })
   *   ```
   */
  function setPath(key, value) {
    testOverrides.set(key, value);
    invalidateCaches();
  }
  exports.clearPath = clearPath;
  exports.getPathValue = getPathValue;
  exports.hasOverride = hasOverride;
  exports.invalidateCaches = invalidateCaches;
  exports.registerCacheInvalidation = registerCacheInvalidation;
  exports.resetPaths = resetPaths;
  exports.setPath = setPath;
});

var require_socket = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_os = require_os();
  const require_constants_platform = require_platform();
  const require_constants_socket = require_socket$2();
  const require_env_home = require_home();
  const require_env_socket = require_socket$1();
  const require_node_path = require_path$1();
  const require_paths_shared = require_shared$2();
  const require_env_windows = require_windows();
  const require_env_xdg = require_xdg();
  const require_paths_dirnames = require_dirnames();
  const require_paths_rewire = require_rewire();
  /**
   * @file Path utilities for Socket ecosystem directories. Platform-aware
   *   resolution for the shared ~/.socket/ layout. The `_`-prefixed entries are
   *   Socket-managed DIRS rather than apps: `_cacache` content-addressable cache;
   *   `_dlx/<hash>/` name+version binary store (node, jre, python, sfw, …);
   *   `_state/<app>/` version-LESS persistent app state (daemon socket + lock +
   *   OAuth refresh; mirrors pnpm `state-dir` / XDG_STATE_HOME), with
   *   `_state/<app>/run/` for a daemon's socket/lock/pid; `_wheelhouse` shared
   *   bin across Socket tools. Generic per-app dirs (`getSocketAppDir('<name>')`)
   *   nest under the same `_`-prefix.
   */
  /**
   * Get the OS home directory. Can be overridden in tests using
   * setPath('homedir', ...) from paths/rewire.
   */
  function getOsHomeDir() {
    const os = require_node_os.getNodeOs();
    return require_paths_rewire.getPathValue("homedir", () => os.homedir());
  }
  /**
   * Get the OS temporary directory. Can be overridden in tests using
   * setPath('tmpdir', ...) from paths/rewire.
   */
  /**
   * Get the OS temporary directory. Can be overridden in tests using
   * setPath('tmpdir', ...) from paths/rewire.
   */
  function getOsTmpDir() {
    const os = require_node_os.getNodeOs();
    return require_paths_rewire.getPathValue("tmpdir", () => os.tmpdir());
  }
  /**
   * Resolve the runtime socket path for a local daemon named `name`. Distinct
   * from getSocketAppRuntimeDir (the persistent ~/.socket/_state/<app>/run/
   * home): the SOCKET endpoint itself belongs in the ephemeral, owner-only XDG
   * runtime dir — correctly permissioned and auto-cleaned on logout — while the
   * downloaded daemon binary + durable token cache live under ~/.socket. The
   * daemon and every client MUST compute the identical path (1 path, 1
   * reference), so this is the single resolver both sides call.
   *
   * Resolution:
   *
   * - Windows: `\\.\pipe\<name>-sock` (named pipe; Unix sockets are unavailable
   *   pre-Win10 1803, same framing/semantics). Returned raw — a pipe path is not
   *   a filesystem path and must not be slash-normalized.
   * - `$XDG_RUNTIME_DIR/<name>.sock` when XDG_RUNTIME_DIR is set (systemd
   *   `/run/user/<uid>/`).
   * - Else `$TMPDIR/<name>-<uid>.sock` (the `<uid>` suffix avoids collisions when
   *   TMPDIR is shared across users on a multi-tenant box).
   */
  function getRuntimeSocketPath(name) {
    if (require_constants_platform.isWin32())
      return `\\\\.\\pipe\\${name}-sock`;
    const path = require_node_path.getNodePath();
    const xdgRuntimeDir = require_env_xdg.getXdgRuntimeDir();
    if (xdgRuntimeDir)
      return require_paths_shared.normalizePath(
        path.join(xdgRuntimeDir, `${name}.sock`),
      );
    const { uid } = require_node_os.getNodeOs().userInfo();
    return require_paths_shared.normalizePath(
      path.join(getOsTmpDir(), `${name}-${uid}.sock`),
    );
  }
  /**
   * Get a Socket app cache directory (~/.socket/_<appName>/cache).
   */
  /**
   * Get a Socket app cache directory (~/.socket/_<appName>/cache).
   */
  function getSocketAppCacheDir(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketAppDir(appName), require_paths_dirnames.CACHE_DIR),
    );
  }
  /**
   * Get a Socket app TTL cache directory (~/.socket/_<appName>/cache/ttl).
   */
  /**
   * Get a Socket app TTL cache directory (~/.socket/_<appName>/cache/ttl).
   */
  function getSocketAppCacheTtlDir(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketAppCacheDir(appName), "ttl"),
    );
  }
  /**
   * Get a Socket app directory (~/.socket/_<appName>). The `_` prefix is applied
   * here; pass the bare app name (e.g. 'socket', 'registry').
   */
  /**
   * Get a Socket app directory (~/.socket/_<appName>). The `_` prefix is applied
   * here; pass the bare app name (e.g. 'socket', 'registry').
   */
  function getSocketAppDir(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketUserDir(), `_${appName}`),
    );
  }
  /**
   * Get the Socket cacache directory (~/.socket/_cacache). Override precedence:
   * setPath('socket-cacache-dir', …) → SOCKET_CACACHE_DIR env →
   * $SOCKET_HOME/_cacache → $HOME/.socket/_cacache.
   */
  /**
   * Get an app's runtime directory (~/.socket/_state/<app>/run/) — the home for a
   * daemon's Unix socket + `concurrency.lock` + `<socket>.pid`. Version-less so
   * the socket path is stable across binary upgrades.
   */
  function getSocketAppRuntimeDir(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketAppStateDir(appName), "run"),
    );
  }
  /**
   * Get the Socket user directory (~/.socket). Override precedence:
   * setPath('socket-user-dir', …) → SOCKET_HOME env → $HOME/.socket →
   * /tmp/.socket (Unix) or %TEMP%.socket (Windows).
   */
  /**
   * Get an app's persistent state directory (~/.socket/_state/<app>/). The
   * `<app>` is a real app such as sockeye or acorn, nesting its version-less
   * state inside the `_state` infra dir.
   */
  function getSocketAppStateDir(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketStateDir(), appName),
    );
  }
  /**
   * Get an app's runtime directory (~/.socket/_state/<app>/run/) — the home for a
   * daemon's Unix socket + `concurrency.lock` + `<socket>.pid`. Version-less so
   * the socket path is stable across binary upgrades.
   */
  /**
   * Get the Socket cacache directory (~/.socket/_cacache). Override precedence:
   * setPath('socket-cacache-dir', …) → SOCKET_CACACHE_DIR env →
   * $SOCKET_HOME/_cacache → $HOME/.socket/_cacache.
   */
  function getSocketCacacheDir() {
    return require_paths_rewire.getPathValue("socket-cacache-dir", () => {
      if (require_env_socket.getSocketCacacheDirEnv())
        return require_paths_shared.normalizePath(
          require_env_socket.getSocketCacacheDirEnv(),
        );
      const path = require_node_path.getNodePath();
      return require_paths_shared.normalizePath(
        path.join(
          getSocketUserDir(),
          require_constants_socket.SOCKET_DIR.cacache,
        ),
      );
    });
  }
  /**
   * Get the Socket DLX directory (~/.socket/_dlx) — the name+version binary store
   * (node, jre, python, sfw, …). Override precedence: setPath('socket-dlx-dir',
   * …) → SOCKET_DLX_DIR env → $SOCKET_HOME/_dlx → $HOME/.socket/_dlx.
   */
  /**
   * Get the Socket DLX directory (~/.socket/_dlx) — the name+version binary store
   * (node, jre, python, sfw, …). Override precedence: setPath('socket-dlx-dir',
   * …) → SOCKET_DLX_DIR env → $SOCKET_HOME/_dlx → $HOME/.socket/_dlx.
   */
  function getSocketDlxDir() {
    return require_paths_rewire.getPathValue("socket-dlx-dir", () => {
      if (require_env_socket.getSocketDlxDirEnv())
        return require_paths_shared.normalizePath(
          require_env_socket.getSocketDlxDirEnv(),
        );
      const path = require_node_path.getNodePath();
      return require_paths_shared.normalizePath(
        path.join(getSocketUserDir(), require_constants_socket.SOCKET_DIR.dlx),
      );
    });
  }
  /**
   * Get the Socket home directory (~/.socket). Alias for getSocketUserDir() for
   * consistency across Socket projects.
   */
  /**
   * Get the Socket home directory (~/.socket). Alias for getSocketUserDir() for
   * consistency across Socket projects.
   */
  function getSocketHomePath() {
    return getSocketUserDir();
  }
  /**
   * Get the Wheelhouse rack directory (~/.socket/_wheelhouse/rack) — the tool
   * STORE. Every `_wheelhouse`-managed CLI tool keeps its real binaries here,
   * racked by name + version as `<rack>/<tool>/<version>/…` (the wheelhouse
   * analog of Homebrew's `Cellar/`). The handles on PATH live in
   * `<wheelhouse>/bin` (getSocketWheelhouseBinDir) and point into the rack.
   * Inherits the `_wheelhouse` override chain (SOCKET_HOME /
   * setPath('socket-wheelhouse-dir')).
   */
  function getSocketRackDir() {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketWheelhouseDir(), "rack"),
    );
  }
  /**
   * Get a racked tool's version directory (~/.socket/_wheelhouse/rack/<tool>/
   * <version>) — the per-tool, per-version home under the rack. The
   * 1-path-1-reference owner of a tool install destination: installers resolve
   * their extract/copy target through this, and the `<wheelhouse>/bin/<tool>`
   * shim points at a binary inside it.
   */
  function getSocketRackToolDir(options) {
    const opts = {
      __proto__: null,
      ...options,
    };
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketRackDir(), opts.tool, opts.version),
    );
  }
  /**
   * Get the Wheelhouse repo-clones directory (~/.socket/_wheelhouse/repo-clones).
   * Sits beside the per-tool dirs sfw, codedb, janus, and bin under
   * `_wheelhouse`.
   * The home for reference clones of EXTERNAL repos an agent reviews, each as
   * `<org>-<repo>` lowercased + dash-cased (e.g. `justrach-codedb`).
   *
   * Smallest-practical clone form (smallest disk + fastest initial fetch without
   * the treeless tax): `git clone` --depth=1 --single-branch --filter=blob:none
   * <url> <dest> `--depth=1` truncates history, `--single-branch` skips other
   * refs, and `--filter=blob:none` (a BLOBLESS partial clone) fetches file blobs
   * lazily on first access — so the initial download is tree-metadata only.
   * (Treeless `--filter=tree:0` is smaller still but refetches trees on every
   * walk, which is slow + breaks offline, so it is NOT the default.)
   *
   * Deliberately OUTSIDE `~/projects/` so Socket's sibling-walk tooling (e.g.
   * cascade `--all`) never mistakes a reference clone for a Socket repo
   * checkout. Disposable: a reference cache, not a working tree. Inherits the
   * `_wheelhouse` override chain (SOCKET_HOME /
   * setPath('socket-wheelhouse-dir')).
   */
  function getSocketRepoClonesDir() {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketWheelhouseDir(), "repo-clones"),
    );
  }
  /**
   * Get the Socket state directory (~/.socket/_state) — version-LESS persistent
   * app state (the home for daemon sockets, locks, OAuth refresh, durable caches
   * that survive version bumps; mirrors pnpm `state-dir` / XDG_STATE_HOME).
   * Override precedence: setPath('socket-state-dir', …) → SOCKET_STATE_DIR env →
   * $SOCKET_HOME/_state → $HOME/.socket/_state.
   */
  function getSocketStateDbPath(appName) {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketStateDir(), `${appName}.sqlite`),
    );
  }
  function getSocketStateDir() {
    return require_paths_rewire.getPathValue("socket-state-dir", () => {
      if (require_env_socket.getSocketStateDirEnv())
        return require_paths_shared.normalizePath(
          require_env_socket.getSocketStateDirEnv(),
        );
      const path = require_node_path.getNodePath();
      return require_paths_shared.normalizePath(
        path.join(
          getSocketUserDir(),
          require_constants_socket.SOCKET_DIR.state,
        ),
      );
    });
  }
  /**
   * Get the Socket user directory (~/.socket). Override precedence:
   * setPath('socket-user-dir', …) → SOCKET_HOME env → $HOME/.socket →
   * /tmp/.socket (Unix) or %TEMP%.socket (Windows).
   */
  function getSocketUserDir() {
    return require_paths_rewire.getPathValue("socket-user-dir", () => {
      const socketHome = require_env_socket.getSocketHome();
      if (socketHome) return require_paths_shared.normalizePath(socketHome);
      const path = require_node_path.getNodePath();
      return require_paths_shared.normalizePath(
        path.join(getUserHomeDir(), require_paths_dirnames.DOT_SOCKET_DIR),
      );
    });
  }
  /**
   * Get the Wheelhouse bin directory (~/.socket/_wheelhouse/bin) — the single
   * directory placed on PATH. Holds only flat handles (thin exec shims or
   * symlinks), one per tool, each pointing at a real binary racked under
   * `<wheelhouse>/rack/<tool>/<version>/…` (getSocketRackToolDir). The shim IS
   * the bin, the npm `prefix/bin` / Homebrew `bin/` model: PATH lookup does not
   * recurse, so this dir stays flat (never a `bin/<tool>/` subdir). Inherits the
   * `_wheelhouse` override chain (SOCKET_HOME /
   * setPath('socket-wheelhouse-dir')).
   */
  function getSocketWheelhouseBinDir() {
    const path = require_node_path.getNodePath();
    return require_paths_shared.normalizePath(
      path.join(getSocketWheelhouseDir(), "bin"),
    );
  }
  /**
   * Get the Socket Wheelhouse directory (~/.socket/_wheelhouse). Shared location,
   * common across Socket repos, for binaries that every Socket repo can reach
   * without each one re-downloading and re-extracting per-repo. Tool installers
   * (janus, sfw, etc.) rack their resolved executables under
   * `<wheelhouse>/rack/<tool>/<version>/…` (getSocketRackToolDir) and expose a
   * handle in `<wheelhouse>/bin` (getSocketWheelhouseBinDir); consumers add that
   * one `bin/` to PATH. Override precedence: setPath('socket-wheelhouse-dir', …)
   * → $SOCKET_HOME/_wheelhouse → $HOME/.socket/_wheelhouse.
   */
  function getSocketWheelhouseDir() {
    return require_paths_rewire.getPathValue("socket-wheelhouse-dir", () => {
      const path = require_node_path.getNodePath();
      return require_paths_shared.normalizePath(
        path.join(
          getSocketUserDir(),
          require_constants_socket.SOCKET_DIR.wheelhouse,
        ),
      );
    });
  }
  /**
   * Get the user's home directory. Uses environment variables directly to support
   * test mocking. Falls back to temporary directory if home is not available.
   *
   * Priority order: 1. HOME (Unix) 2. USERPROFILE (Windows) 3.
   * getNodeOs().homedir() 4. Fallback: getNodeOs().tmpdir() for restricted envs.
   */
  /**
   * Get the user's home directory. Uses environment variables directly to support
   * test mocking. Falls back to temporary directory if home is not available.
   *
   * Priority order: 1. HOME (Unix) 2. USERPROFILE (Windows) 3.
   * getNodeOs().homedir() 4. Fallback: getNodeOs().tmpdir() for restricted envs.
   */
  function getUserHomeDir() {
    const home = require_env_home.getHome();
    if (home) return home;
    const userProfile = require_env_windows.getUserprofile();
    if (userProfile) return userProfile;
    try {
      const osHome = getOsHomeDir();
      if (osHome) return osHome;
    } catch {}
    /* c8 ignore next 2 - Triple-fallback only fires when HOME +
		USERPROFILE + os.homedir() all fail; not reachable in tests. */
    return getOsTmpDir();
  }
  exports.getOsHomeDir = getOsHomeDir;
  exports.getOsTmpDir = getOsTmpDir;
  exports.getRuntimeSocketPath = getRuntimeSocketPath;
  exports.getSocketAppCacheDir = getSocketAppCacheDir;
  exports.getSocketAppCacheTtlDir = getSocketAppCacheTtlDir;
  exports.getSocketAppDir = getSocketAppDir;
  exports.getSocketAppRuntimeDir = getSocketAppRuntimeDir;
  exports.getSocketAppStateDir = getSocketAppStateDir;
  exports.getSocketCacacheDir = getSocketCacacheDir;
  exports.getSocketDlxDir = getSocketDlxDir;
  exports.getSocketHomePath = getSocketHomePath;
  exports.getSocketRackDir = getSocketRackDir;
  exports.getSocketRackToolDir = getSocketRackToolDir;
  exports.getSocketRepoClonesDir = getSocketRepoClonesDir;
  exports.getSocketStateDbPath = getSocketStateDbPath;
  exports.getSocketStateDir = getSocketStateDir;
  exports.getSocketUserDir = getSocketUserDir;
  exports.getSocketWheelhouseBinDir = getSocketWheelhouseBinDir;
  exports.getSocketWheelhouseDir = getSocketWheelhouseDir;
  exports.getUserHomeDir = getUserHomeDir;
});

var require_shared = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_fs = require_fs$4();
  const require_node_path = require_path$1();
  const require_paths_socket = require_socket();
  /**
   * @file Private state shared between `fs/safe` and `fs/path-cache`. The
   *   `shared.ts` filename keeps this module out of the generated package.json
   *   `exports` map (the `dist/**\/shared.*` ignore pattern in
   *   `scripts/repo/package-exports.config.mts` filters it out), so it is not
   *   part of the public surface — it exists only to give the two leaves above a
   *   common owner for the allowed-directory cache. The cache is invalidated by
   *   `invalidatePathCache()` in `fs/path-cache.ts` whenever paths are rewired in
   *   tests (`paths/rewire.ts` registers `invalidatePathCache` as one of its
   *   cache callbacks); `getDefaultAllowedDirectories()` rehydrates on next call.
   */
  let cachedAllowedDirs;
  /**
   * Whether every pattern resolves inside an allowed tree.
   *
   * `extraDirs` names additional roots for THIS call. The default roots stay
   * untouched: {@link getDefaultAllowedDirectories} hands back a fresh array, so
   * appending here cannot widen the allow-list for a later caller.
   *
   * @param patterns - Delete patterns, resolved against the process cwd.
   * @param extraDirs - Extra roots permitted for this call.
   *
   * @returns `true` when each pattern is contained by some allowed root.
   */
  function areAllPathsInAllowedDirs(patterns, extraDirs) {
    if (!patterns.length) return false;
    const path = require_node_path.getNodePath();
    const roots = getDefaultAllowedDirectories();
    if (extraDirs)
      for (let i = 0, { length } = extraDirs; i < length; i += 1) {
        const extraDir = extraDirs[i];
        if (extraDir) roots.push(path.resolve(extraDir));
      }
    return patterns.every((pattern) => {
      const resolvedPath = path.resolve(pattern);
      for (let i = 0, { length } = roots; i < length; i += 1) {
        const root = roots[i];
        if (
          !(resolvedPath === root || resolvedPath.startsWith(root + path.sep))
        )
          continue;
        if (!path.relative(root, resolvedPath).startsWith("..")) return true;
      }
      return false;
    });
  }
  /**
   * Clear the cached allowed-directories list. Used by `invalidatePathCache()`
   * when test path rewiring changes any of the underlying paths so the next read
   * picks up the new resolved values.
   */
  function clearDefaultAllowedDirectories() {
    cachedAllowedDirs = void 0;
  }
  /**
   * Get resolved allowed directories for safe deletion with lazy caching. These
   * directories are resolved once and cached for the process lifetime.
   *
   * BOTH the resolved and the real path of each directory are listed, because
   * they differ whenever a component is a symlink and a caller may hold either
   * form. On macOS, `os.tmpdir()` can contain a symlinked component.
   * A caller that uses `fs.realpathSync` holds the real path instead.
   * Listing both forms permits cleanup through either path to the allowed tree.
   */
  function getDefaultAllowedDirectories() {
    if (cachedAllowedDirs === void 0) {
      const fs = require_node_fs.getNodeFs();
      const path = require_node_path.getNodePath();
      const dirs = /* @__PURE__ */ new Set();
      for (const dir of [
        require_paths_socket.getOsTmpDir(),
        require_paths_socket.getSocketCacacheDir(),
        require_paths_socket.getSocketUserDir(),
      ]) {
        const resolved = path.resolve(dir);
        dirs.add(resolved);
        try {
          dirs.add(fs.realpathSync(resolved));
        } catch {}
      }
      cachedAllowedDirs = [...dirs];
    }
    return [...cachedAllowedDirs];
  }
  exports.areAllPathsInAllowedDirs = areAllPathsInAllowedDirs;
  exports.clearDefaultAllowedDirectories = clearDefaultAllowedDirectories;
  exports.getDefaultAllowedDirectories = getDefaultAllowedDirectories;
});

var require_process = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /**
   * @file Safe call-through accessors for the `process` global's methods and
   *   value reads. The `process` object reference is captured once at module load
   *   (immune to a later `globalThis.process = …` reassignment), but each method
   *   is CALLED at access time off that captured object — so `vi.spyOn(process,
   *   'cwd')`, which mutates the same captured object, still intercepts. Binding
   *   the method reference instead (`process.cwd.bind(process)`) would freeze it
   *   and break that test injection point, so we deliberately keep the late call.
   *   Consumers read cwd / platform / env / argv through these instead of
   *   touching `process` directly; enforced Socket-wide by
   *   `socket/prefer-process-primordial`. This is the `process` leaf of the
   *   node-module primordials: where `node/fs` / `node/path` lazy-load a `node:`
   *   module behind a function, this captures the always-present `process` global
   *   and routes its hot reads through one tamper-resistant surface.
   */
  const SafeProcess = process;
  /**
   * The CPU architecture token (`'x64'` / `'arm64'` / …).
   */
  function processArch() {
    return SafeProcess.arch;
  }
  /**
   * The argv array (`[execPath, scriptPath, ...args]`).
   *
   * @example
   *   ;```typescript
   *   const entry = processArgv()[1]
   *   ```
   */
  function processArgv() {
    return SafeProcess.argv;
  }
  /**
   * The current working directory. Call-through to the captured process's `cwd` —
   * late-bound so test spies still intercept.
   *
   * @example
   *   ;```typescript
   *   const dir = processCwd()
   *   ```
   */
  function processCwd() {
    return SafeProcess.cwd();
  }
  /**
   * Emit a process warning. Call-through so a test spy on `process.emitWarning`
   * still intercepts.
   */
  function processEmitWarning(...args) {
    SafeProcess.emitWarning(...args);
  }
  /**
   * The process environment object. Returns the live `process.env` off the
   * captured process (call-through, so a test that swaps `process.env` is seen).
   *
   * @example
   *   ;```typescript
   *   const token = processEnv()['SOCKET_API_TOKEN']
   *   ```
   */
  function processEnv() {
    return SafeProcess.env;
  }
  /**
   * The absolute path to the Node executable (`process.execPath`).
   */
  function processExecPath() {
    return SafeProcess.execPath;
  }
  /**
   * Schedule a callback on the next tick. Call-through (late-bound).
   */
  function processNextTick(...args) {
    SafeProcess.nextTick(...args);
  }
  /**
   * The process id.
   */
  function processPid() {
    return SafeProcess.pid;
  }
  /**
   * The OS platform token (`'darwin'` / `'linux'` / `'win32'` / …).
   *
   * @example
   *   ;```typescript
   *   if (processPlatform() === 'win32') { … }
   *   ```
   */
  function processPlatform() {
    return SafeProcess.platform;
  }
  /**
   * The standard error stream. Returned off the captured process so a test that
   * spies on `process.stderr.write` still intercepts.
   */
  function processStderr() {
    return SafeProcess.stderr;
  }
  /**
   * The standard output stream. Returned off the captured process so a test that
   * spies on `process.stdout.write` still intercepts.
   */
  function processStdout() {
    return SafeProcess.stdout;
  }
  /**
   * The Node version string (`process.version`, e.g. `'v26.2.0'`).
   */
  function processVersion() {
    return SafeProcess.version;
  }
  exports.processArch = processArch;
  exports.processArgv = processArgv;
  exports.processCwd = processCwd;
  exports.processEmitWarning = processEmitWarning;
  exports.processEnv = processEnv;
  exports.processExecPath = processExecPath;
  exports.processNextTick = processNextTick;
  exports.processPid = processPid;
  exports.processPlatform = processPlatform;
  exports.processStderr = processStderr;
  exports.processStdout = processStdout;
  exports.processVersion = processVersion;
});

var require_promise = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `Promise` static methods, prototype methods, and the
   *   ES2024 `withResolvers` factory. Static methods are bound to `Promise` so
   *   callers can pass them around as standalone functions (`PromiseAll(arr)`
   *   instead of `Promise.all(arr)`); the `this`-receiver capture matches Node's
   *   primordials convention.
   */
  const PromiseCtor = Promise;
  const PromiseAll = Promise.all.bind(Promise);
  const PromiseAllSettled = Promise.allSettled.bind(Promise);
  const PromiseAny = Promise.any.bind(Promise);
  const PromiseRace = Promise.race.bind(Promise);
  const PromiseReject = Promise.reject.bind(Promise);
  const PromiseResolve = Promise.resolve.bind(Promise);
  const PromiseWithResolvers = Promise.withResolvers?.bind(Promise);
  const PromisePrototypeCatch = require_primordials_uncurry.uncurryThis(
    Promise.prototype.catch,
  );
  const PromisePrototypeFinally = require_primordials_uncurry.uncurryThis(
    Promise.prototype.finally,
  );
  const PromisePrototypeThen = require_primordials_uncurry.uncurryThis(
    Promise.prototype.then,
  );
  exports.PromiseAll = PromiseAll;
  exports.PromiseAllSettled = PromiseAllSettled;
  exports.PromiseAny = PromiseAny;
  exports.PromiseCtor = PromiseCtor;
  exports.PromisePrototypeCatch = PromisePrototypeCatch;
  exports.PromisePrototypeFinally = PromisePrototypeFinally;
  exports.PromisePrototypeThen = PromisePrototypeThen;
  exports.PromiseRace = PromiseRace;
  exports.PromiseReject = PromiseReject;
  exports.PromiseResolve = PromiseResolve;
  exports.PromiseWithResolvers = PromiseWithResolvers;
});

var require_regexp = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_primordials_uncurry = require_uncurry();
  /**
   * @file Safe references to `RegExp` and its prototype methods. `RegExp.escape`
   *   is ES2025; the primordial is typed `Function | undefined` so older runtimes
   *   still load. The Symbol-keyed `[Symbol.match]` / `[Symbol.replace]` slots
   *   are exposed alongside the named methods because some callers use them via
   *   dynamic dispatch (e.g. `String.prototype.match` invokes
   *   `RegExp.prototype[Symbol.match]` internally).
   */
  const RegExpCtor = RegExp;
  const RegExpEscape = RegExp.escape;
  const RegExpPrototypeExec = require_primordials_uncurry.uncurryThis(
    RegExp.prototype.exec,
  );
  const RegExpPrototypeTest = require_primordials_uncurry.uncurryThis(
    RegExp.prototype.test,
  );
  const RegExpPrototypeSymbolMatch = require_primordials_uncurry.uncurryThis(
    RegExp.prototype[Symbol.match],
  );
  const RegExpPrototypeSymbolReplace = require_primordials_uncurry.uncurryThis(
    RegExp.prototype[Symbol.replace],
  );
  exports.RegExpCtor = RegExpCtor;
  exports.RegExpEscape = RegExpEscape;
  exports.RegExpPrototypeExec = RegExpPrototypeExec;
  exports.RegExpPrototypeSymbolMatch = RegExpPrototypeSymbolMatch;
  exports.RegExpPrototypeSymbolReplace = RegExpPrototypeSymbolReplace;
  exports.RegExpPrototypeTest = RegExpPrototypeTest;
});

/**
 * Bundled from pico-pack
 * This is a zero-dependency bundle created by rolldown.
 */
var require_pico_pack = /* @__PURE__ */ __commonJSMin$1((exports, module) => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __name = (target, value) =>
    __defProp(target, "name", {
      value,
      configurable: true,
    });
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esmMin = (fn, res, err) => () => {
    if (err) throw err[0];
    try {
      return (fn && (res = fn((fn = 0))), res);
    } catch (e) {
      throw ((err = [e]), e);
    }
  };
  var __commonJSMin = (cb, mod) => () => (
    mod || (cb((mod = { exports: {} }).exports, mod), (cb = null)),
    mod.exports
  );
  var __exportAll = (all, no_symbols) => {
    let target = {};
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
      });
    if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
    return target;
  };
  var __copyProps = (to, from, except, desc) => {
    if ((from && typeof from === "object") || typeof from === "function")
      for (
        var keys = __getOwnPropNames(from), i = 0, n = keys.length, key;
        i < n;
        i++
      ) {
        key = keys[i];
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, {
            get: ((k) => from[k]).bind(null, key),
            enumerable:
              !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
          });
      }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (
    (target = mod != null ? __create(__getProtoOf(mod)) : {}),
    __copyProps(
      isNodeMode ||
        !mod ||
        !mod.__esModule ||
        !__hasOwnProp.call(mod, "default")
        ? __defProp(target, "default", {
            value: mod,
            enumerable: true,
          })
        : target,
      mod,
    )
  );
  var __toCommonJS = (mod) =>
    __hasOwnProp.call(mod, "module.exports")
      ? mod["module.exports"]
      : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  let node_fs = __require("fs");
  node_fs = __toESM(node_fs, 1);
  let node_fs_promises = __require("fs/promises");
  node_fs_promises = __toESM(node_fs_promises, 1);
  let node_path = __require("path");
  node_path = __toESM(node_path, 1);
  let node_process = __require("process");
  node_process = __toESM(node_process, 1);
  let node_stream = __require("stream");
  let node_events = __require("events");
  let node_stream_promises = __require("stream/promises");
  let node_util = __require("util");
  let node_child_process = __require("child_process");
  let node_url = __require("url");
  let node_os = __require("os");
  const {
    ArrayIsArray: _p_ArrayIsArray,
    ArrayPrototypeFlat: _p_ArrayPrototypeFlat,
    ArrayPrototypeFlatMap: _p_ArrayPrototypeFlatMap,
    ArrayPrototypeUnshift: _p_ArrayPrototypeUnshift,
  } = require_array$1();
  const {
    AggregateErrorCtor: _p_AggregateErrorCtor,
    ErrorCtor: _p_ErrorCtor,
    RangeErrorCtor: _p_RangeErrorCtor,
    SyntaxErrorCtor: _p_SyntaxErrorCtor,
    TypeErrorCtor: _p_TypeErrorCtor,
  } = require_error$1();
  const {
    MapCtor: _p_MapCtor,
    SetCtor: _p_SetCtor,
    WeakMapCtor: _p_WeakMapCtor,
  } = require_map_set();
  const {
    MathAbs: _p_MathAbs,
    MathMax: _p_MathMax,
    MathMin: _p_MathMin,
    MathPow: _p_MathPow,
  } = require_math();
  const {
    NumberIsFinite: _p_NumberIsFinite,
    NumberIsInteger: _p_NumberIsInteger,
    NumberIsSafeInteger: _p_NumberIsSafeInteger,
    NumberParseInt: _p_NumberParseInt,
  } = require_number$1();
  const {
    ObjectAssign: _p_ObjectAssign,
    ObjectCreate: _p_ObjectCreate,
    ObjectDefineProperty: _p_ObjectDefineProperty,
    ObjectKeys: _p_ObjectKeys,
  } = require_object();
  const { processCwd: _p_processCwd, processNextTick: _p_processNextTick } =
    require_process();
  const {
    PromiseAll: _p_PromiseAll,
    PromiseCtor: _p_PromiseCtor,
    PromiseRace: _p_PromiseRace,
    PromiseResolve: _p_PromiseResolve,
  } = require_promise();
  const { RegExpCtor: _p_RegExpCtor } = require_regexp();
  const {
    StringFromCharCode: _p_StringFromCharCode,
    StringPrototypeCharAt: _p_StringPrototypeCharAt,
    StringPrototypeCharCodeAt: _p_StringPrototypeCharCodeAt,
    StringPrototypeEndsWith: _p_StringPrototypeEndsWith,
    StringPrototypeLocaleCompare: _p_StringPrototypeLocaleCompare,
    StringPrototypePadStart: _p_StringPrototypePadStart,
    StringPrototypeRepeat: _p_StringPrototypeRepeat,
    StringPrototypeReplaceAll: _p_StringPrototypeReplaceAll,
    StringPrototypeStartsWith: _p_StringPrototypeStartsWith,
    StringPrototypeToLowerCase: _p_StringPrototypeToLowerCase,
    StringPrototypeTrim: _p_StringPrototypeTrim,
  } = require_string$1();
  node_os = __toESM(node_os, 1);
  var require_constants$2 = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const WIN_SLASH = "\\\\/";
    const WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    const DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    /**
     * Posix glob regex
     */
    const DOT_LITERAL = "\\.";
    const PLUS_LITERAL = "\\+";
    const QMARK_LITERAL = "\\?";
    const SLASH_LITERAL = "\\/";
    const ONE_CHAR = "(?=.)";
    const QMARK = "[^/]";
    const END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    const START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    const DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    const POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!${START_ANCHOR}${DOTS_SLASH})`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`,
      NO_DOTS_SLASH: `(?!${DOTS_SLASH})`,
      QMARK_NO_DOT: `[^.${SLASH_LITERAL}]`,
      STAR: `${QMARK}*?`,
      START_ANCHOR,
      SEP: "/",
    };
    /**
     * Windows glob regex
     */
    const WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\",
    };
    module.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 65536,
      POSIX_REGEX_SOURCE: {
        __proto__: null,
        alnum: "a-zA-Z0-9",
        alpha: "a-zA-Z",
        ascii: "\\x00-\\x7F",
        blank: " \\t",
        cntrl: "\\x00-\\x1F\\x7F",
        digit: "0-9",
        graph: "\\x21-\\x7E",
        lower: "a-z",
        print: "\\x20-\\x7E ",
        punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
        space: " \\t\\r\\n\\v\\f",
        upper: "A-Z",
        word: "A-Za-z0-9_",
        xdigit: "A-Fa-f0-9",
      },
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**",
      },
      CHAR_0: 48,
      CHAR_9: 57,
      CHAR_UPPERCASE_A: 65,
      CHAR_LOWERCASE_A: 97,
      CHAR_UPPERCASE_Z: 90,
      CHAR_LOWERCASE_Z: 122,
      CHAR_LEFT_PARENTHESES: 40,
      CHAR_RIGHT_PARENTHESES: 41,
      CHAR_ASTERISK: 42,
      CHAR_AMPERSAND: 38,
      CHAR_AT: 64,
      CHAR_BACKWARD_SLASH: 92,
      CHAR_CARRIAGE_RETURN: 13,
      CHAR_CIRCUMFLEX_ACCENT: 94,
      CHAR_COLON: 58,
      CHAR_COMMA: 44,
      CHAR_DOT: 46,
      CHAR_DOUBLE_QUOTE: 34,
      CHAR_EQUAL: 61,
      CHAR_EXCLAMATION_MARK: 33,
      CHAR_FORM_FEED: 12,
      CHAR_FORWARD_SLASH: 47,
      CHAR_GRAVE_ACCENT: 96,
      CHAR_HASH: 35,
      CHAR_HYPHEN_MINUS: 45,
      CHAR_LEFT_ANGLE_BRACKET: 60,
      CHAR_LEFT_CURLY_BRACE: 123,
      CHAR_LEFT_SQUARE_BRACKET: 91,
      CHAR_LINE_FEED: 10,
      CHAR_NO_BREAK_SPACE: 160,
      CHAR_PERCENT: 37,
      CHAR_PLUS: 43,
      CHAR_QUESTION_MARK: 63,
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      CHAR_RIGHT_CURLY_BRACE: 125,
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      CHAR_SEMICOLON: 59,
      CHAR_SINGLE_QUOTE: 39,
      CHAR_SPACE: 32,
      CHAR_TAB: 9,
      CHAR_UNDERSCORE: 95,
      CHAR_VERTICAL_LINE: 124,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": {
            type: "negate",
            open: "(?:(?!(?:",
            close: `))${chars.STAR})`,
          },
          "?": {
            type: "qmark",
            open: "(?:",
            close: ")?",
          },
          "+": {
            type: "plus",
            open: "(?:",
            close: ")+",
          },
          "*": {
            type: "star",
            open: "(?:",
            close: ")*",
          },
          "@": {
            type: "at",
            open: "(?:",
            close: ")",
          },
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      },
    };
  });
  var require_utils$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    const {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL,
    } = require_constants$2();
    exports.isObject = (val) =>
      val !== null && typeof val === "object" && !_p_ArrayIsArray(val);
    exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports.isRegexChar = (str) =>
      str.length === 1 && exports.hasRegexChars(str);
    exports.escapeRegex = (str) =>
      str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform)
        return process.platform === "win32";
      return false;
    };
    exports.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\")
        return exports.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports.removePrefix = (input, state = {}) => {
      let output = input;
      if (_p_StringPrototypeStartsWith(output, "./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports.wrapOutput = (input, state = {}, options = {}) => {
      let output = `${options.contains ? "" : "^"}(?:${input})${options.contains ? "" : "$"}`;
      if (state.negated === true) output = `(?:^(?!${output}).*$)`;
      return output;
    };
    exports.basename = (path, { windows } = {}) => {
      const segs = path.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") return segs[segs.length - 2];
      return last;
    };
  });
  var require_scan = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const utils = require_utils$3();
    const {
      CHAR_ASTERISK,
      CHAR_AT,
      CHAR_BACKWARD_SLASH,
      CHAR_COMMA,
      CHAR_DOT,
      CHAR_EXCLAMATION_MARK,
      CHAR_FORWARD_SLASH,
      CHAR_LEFT_CURLY_BRACE,
      CHAR_LEFT_PARENTHESES,
      CHAR_LEFT_SQUARE_BRACKET,
      CHAR_PLUS,
      CHAR_QUESTION_MARK,
      CHAR_RIGHT_CURLY_BRACE,
      CHAR_RIGHT_PARENTHESES,
      CHAR_RIGHT_SQUARE_BRACKET,
    } = require_constants$2();
    const isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    const depth = (token) => {
      if (token.isPrefix !== true)
        token.depth = token.isGlobstar ? Infinity : 1;
    };
    /**
     * Quickly scans a glob pattern and returns an object with a handful of
     * useful properties, like `isGlob`, `path` (the leading non-glob, if it exists),
     * `glob` (the actual pattern), `negated` (true if the path starts with `!` but not
     * with `!(`) and `negatedExtglob` (true if the path starts with `!(`).
     *
     * ```js
     * const pm = require('picomatch');
     * console.log(pm.scan('foo/bar/*.js'));
     * { isGlob: true, input: 'foo/bar/*.js', base: 'foo/bar', glob: '*.js' }
     * ```
     * @param {String} `str`
     * @param {Object} `options`
     * @return {Object} Returns an object with tokens and regex source string.
     * @api public
     */
    const scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd =
        opts.parts === true || opts.tokens === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = {
        value: "",
        depth: 0,
        isGlob: false,
      };
      const eos = () => index >= length;
      const peek = () => _p_StringPrototypeCharCodeAt(str, index + 1);
      const advance = () => {
        prev = code;
        return _p_StringPrototypeCharCodeAt(str, ++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) braceEscaped = true;
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (
              braceEscaped !== true &&
              code === CHAR_DOT &&
              (code = advance()) === CHAR_DOT
            ) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) continue;
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) continue;
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) continue;
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = {
            value: "",
            depth: 0,
            isGlob: false,
          };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          if (
            (code === CHAR_PLUS ||
              code === CHAR_AT ||
              code === CHAR_ASTERISK ||
              code === CHAR_QUESTION_MARK ||
              code === CHAR_EXCLAMATION_MARK) === true &&
            peek() === CHAR_LEFT_PARENTHESES
          ) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start)
              negatedExtglob = true;
            if (scanToEnd === true) {
              let parens = 0;
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  advance();
                  continue;
                }
                if (code === CHAR_LEFT_PARENTHESES) {
                  parens++;
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) continue;
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) continue;
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) continue;
          break;
        }
        if (
          opts.nonegate !== true &&
          code === CHAR_EXCLAMATION_MARK &&
          index === start
        ) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            let parens = 1;
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_BACKWARD_SLASH) {
                backslashes = token.backslashes = true;
                advance();
                continue;
              }
              if (code === CHAR_LEFT_PARENTHESES) {
                parens++;
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES && --parens === 0) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) continue;
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else base = str;
      if (base && base !== "" && base !== "/" && base !== str) {
        if (
          isPathSeparator(_p_StringPrototypeCharCodeAt(base, base.length - 1))
        )
          base = base.slice(0, -1);
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) base = utils.removeBackslashes(base);
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob,
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) tokens.push(token);
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex !== void 0 ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else tokens[idx].value = value;
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (i >= start) {
            parts.push(value);
            prevIndex = i;
          }
        }
        const n = prevIndex !== void 0 ? prevIndex + 1 : start;
        const value = input.slice(n);
        parts.push(value);
        if (opts.tokens && prevIndex && prevIndex + 1 < input.length) {
          tokens[tokens.length - 1].value = value;
          depth(tokens[tokens.length - 1]);
          state.maxDepth += tokens[tokens.length - 1].depth;
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module.exports = scan;
  });
  var require_parse$1 = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const constants = require_constants$2();
    const utils = require_utils$3();
    /**
     * Constants
     */
    const {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS,
    } = constants;
    /**
     * Helpers
     */
    const expandRange = (args, options) => {
      if (typeof options.expandRange === "function")
        return options.expandRange(...args, options);
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new _p_RegExpCtor(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    /**
     * Create the message for a syntax error
     */
    const syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    const splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") bracket++;
          else if (ch === "]" && bracket > 0) bracket--;
          else if (bracket === 0) {
            if (ch === "(") paren++;
            else if (ch === ")" && paren > 0) paren--;
            else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    const isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) return false;
      }
      return true;
    };
    const normalizeSimpleBranch = (branch) => {
      let value = _p_StringPrototypeTrim(branch);
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) return;
      return value.replace(/\\(.)/g, "$1");
    };
    const hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (
            !char ||
            a !== _p_StringPrototypeRepeat(char, a.length) ||
            b !== _p_StringPrototypeRepeat(char, b.length)
          )
            continue;
          if (
            a === b ||
            _p_StringPrototypeStartsWith(a, b) ||
            _p_StringPrototypeStartsWith(b, a)
          )
            return true;
        }
      return false;
    };
    const parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if ((pattern[0] !== "+" && pattern[0] !== "*") || pattern[1] !== "(")
        return;
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) continue;
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) continue;
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) return;
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i,
            };
          }
        }
      }
    };
    const buildCharClassStar = (chars) => {
      return `${chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`}*`;
    };
    const getStarExtglobSequenceChars = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") return;
        const branches = splitTopLevel(match.body).map((branch) =>
          _p_StringPrototypeTrim(branch),
        );
        if (branches.length !== 1) return;
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) return;
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) return;
      return chars;
    };
    const repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = _p_StringPrototypeTrim(pattern);
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    const analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) return { risky: false };
      const max =
        typeof options.maxExtglobRecursion === "number"
          ? options.maxExtglobRecursion
          : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) =>
        _p_StringPrototypeTrim(branch),
      );
      if (branches.length > 1) {
        if (
          branches.some((branch) => branch === "") ||
          branches.some((branch) => /^[*?]+$/.test(branch)) ||
          hasRepeatedCharPrefixOverlap(branches)
        )
          return { risky: true };
      }
      const safeChars = [];
      let sawStarSequence = false;
      let combinable = true;
      for (const branch of branches) {
        const chars = getStarExtglobSequenceChars(branch);
        if (chars) {
          sawStarSequence = true;
          safeChars.push(...chars);
          continue;
        }
        const literal = normalizeSimpleBranch(branch);
        if (literal && literal.length === 1) {
          safeChars.push(literal);
          continue;
        }
        combinable = false;
        if (repeatedExtglobRecursion(branch) > max) return { risky: true };
      }
      if (sawStarSequence)
        return combinable
          ? {
              risky: true,
              safeOutput: buildCharClassStar([...new _p_SetCtor(safeChars)]),
            }
          : { risky: true };
      return { risky: false };
    };
    /**
     * Parse the given input string.
     * @param {String} input
     * @param {Object} options
     * @return {Object}
     */
    const parse = (input, options) => {
      if (typeof input !== "string")
        throw new _p_TypeErrorCtor("Expected a string");
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max =
        typeof opts.maxLength === "number"
          ? _p_MathMin(MAX_LENGTH, opts.maxLength)
          : MAX_LENGTH;
      let len = input.length;
      if (len > max)
        throw new _p_SyntaxErrorCtor(
          `Input length: ${len}, exceeds maximum allowed length: ${max}`,
        );
      const bos = {
        type: "bos",
        value: "",
        output: opts.prepend || "",
      };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR,
      } = PLATFORM_CHARS;
      const globstar = (opts) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) star = `(${star})`;
      if (typeof opts.noext === "boolean") opts.noextglob = opts.noext;
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens,
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      /**
       * Tokenizing helpers
       */
      const eos = () => state.index === len - 1;
      const peek = (state.peek = (n = 1) => input[state.index + n]);
      const advance = (state.advance = () => input[++state.index] || "");
      const remaining = () => input.slice(state.index + 1);
      const consume = (value = "", num = 0) => {
        state.consumed += value;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) return false;
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      /**
       * Push tokens onto the tokens array. This helper speeds up
       * tokenizing by 1) helping us avoid backtracking as much as possible,
       * and 2) helping us avoid creating extra tokens when consecutive
       * characters are plain text. This improves performance and simplifies
       * lookbehinds.
       */
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace =
            state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob =
            tok.extglob === true ||
            (extglobs.length && (tok.type === "pipe" || tok.type === "paren"));
          if (
            tok.type !== "slash" &&
            tok.type !== "paren" &&
            !isBrace &&
            !isExtglob
          ) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren")
          extglobs[extglobs.length - 1].inner += tok.value;
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value) => {
        const token = {
          ...EXTGLOB_CHARS[value],
          conditions: 1,
          inner: "",
        };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({
          type,
          value,
          output: state.output ? "" : ONE_CHAR,
        });
        push({
          type: "paren",
          extglob: true,
          value: advance(),
          output,
        });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if (
          (token.type === "plus" || token.type === "star") &&
          analysis.risky
        ) {
          const safeOutput = analysis.safeOutput
            ? (token.output ? "" : ONE_CHAR) +
              (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput)
            : void 0;
          const open = tokens[token.tokensIndex];
          open.type = "text";
          open.value = literal;
          open.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open.output;
          state.backtrack = true;
          push({
            type: "paren",
            extglob: true,
            value,
            output: "",
          });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (
            token.inner &&
            token.inner.length > 1 &&
            token.inner.includes("/")
          )
            extglobStar = globstar(opts);
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining()))
            output = token.close = `)$))${extglobStar}`;
          if (
            token.inner.includes("*") &&
            (rest = remaining()) &&
            /^\.[^\\/.]+$/.test(rest)
          )
            output = token.close = `)${
              parse(rest, {
                ...options,
                fastpaths: false,
              }).output
            })${extglobStar})`;
          if (token.prev.type === "bos") state.negatedExtglob = true;
        }
        push({
          type: "paren",
          extglob: true,
          value,
          output,
        });
        decrement("parens");
      };
      /**
       * Fast paths
       */
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(
          REGEX_SPECIAL_CHARS_BACKREF,
          (m, esc, chars, first, rest, index) => {
            if (first === "\\") {
              backslashes = true;
              return m;
            }
            if (first === "?") {
              if (esc)
                return (
                  esc +
                  first +
                  (rest ? _p_StringPrototypeRepeat(QMARK, rest.length) : "")
                );
              if (index === 0)
                return (
                  qmarkNoDot +
                  (rest ? _p_StringPrototypeRepeat(QMARK, rest.length) : "")
                );
              return _p_StringPrototypeRepeat(QMARK, chars.length);
            }
            if (first === ".")
              return _p_StringPrototypeRepeat(DOT_LITERAL, chars.length);
            if (first === "*") {
              if (esc) return esc + first + (rest ? star : "");
              return star;
            }
            return esc ? m : `\\${m}`;
          },
        );
        if (backslashes === true) {
          if (opts.unescape === true) output = output.replace(/\\/g, "");
          else
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      /**
       * Tokenize input until we reach end-of-string
       */
      while (!eos()) {
        value = advance();
        if (value === "\0") continue;
        /**
         * Escaped characters
         */
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) continue;
          if (next === "." || next === ";") continue;
          if (!next) {
            value += "\\";
            push({
              type: "text",
              value,
            });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) value += "\\";
          }
          if (opts.unescape === true) value = advance();
          else value += advance();
          if (state.brackets === 0) {
            push({
              type: "text",
              value,
            });
            continue;
          }
        }
        /**
         * If we're inside a regex character class, continue
         * until we reach the closing bracket.
         */
        if (
          state.brackets > 0 &&
          (value !== "]" || prev.value === "[" || prev.value === "[^")
        ) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest = prev.value.slice(idx + 2);
                const posix = POSIX_REGEX_SOURCE[rest];
                if (posix) {
                  prev.value = pre + posix;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1)
                    bos.output = ONE_CHAR;
                  continue;
                }
              }
            }
          }
          if (
            (value === "[" && peek() !== ":") ||
            (value === "-" && peek() === "]")
          )
            value = `\\${value}`;
          if (value === "]" && (prev.value === "[" || prev.value === "[^"))
            value = `\\${value}`;
          if (opts.posix === true && value === "!" && prev.value === "[")
            value = "^";
          prev.value += value;
          append({ value });
          continue;
        }
        /**
         * If we're inside a quoted string, continue
         * until we reach the closing double quote.
         */
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        /**
         * Double quotes
         */
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true)
            push({
              type: "text",
              value,
            });
          continue;
        }
        /**
         * Parentheses
         */
        if (value === "(") {
          increment("parens");
          push({
            type: "paren",
            value,
          });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true)
            throw new _p_SyntaxErrorCtor(syntaxError("opening", "("));
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({
            type: "paren",
            value,
            output: state.parens ? ")" : "\\)",
          });
          decrement("parens");
          continue;
        }
        /**
         * Square brackets
         */
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true)
              throw new _p_SyntaxErrorCtor(syntaxError("closing", "]"));
            value = `\\${value}`;
          } else increment("brackets");
          push({
            type: "bracket",
            value,
          });
          continue;
        }
        if (value === "]") {
          if (
            opts.nobracket === true ||
            (prev && prev.type === "bracket" && prev.value.length === 1)
          ) {
            push({
              type: "text",
              value,
              output: `\\${value}`,
            });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true)
              throw new _p_SyntaxErrorCtor(syntaxError("opening", "["));
            push({
              type: "text",
              value,
              output: `\\${value}`,
            });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (
            prev.posix !== true &&
            prevValue[0] === "^" &&
            !prevValue.includes("/")
          )
            value = `/${value}`;
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue))
            continue;
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        /**
         * Braces
         */
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length,
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({
              type: "text",
              value,
              output: value,
            });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") break;
              if (arr[i].type !== "dots")
                _p_ArrayPrototypeUnshift(range, arr[i].value);
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) state.output += t.output || t.value;
          }
          push({
            type: "brace",
            value,
            output,
          });
          decrement("braces");
          braces.pop();
          continue;
        }
        /**
         * Pipes
         */
        if (value === "|") {
          if (extglobs.length > 0) extglobs[extglobs.length - 1].conditions++;
          push({
            type: "text",
            value,
          });
          continue;
        }
        /**
         * Commas
         */
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({
            type: "comma",
            value,
            output,
          });
          continue;
        }
        /**
         * Slashes
         */
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({
            type: "slash",
            value,
            output: SLASH_LITERAL,
          });
          continue;
        }
        /**
         * Dots
         */
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (
            state.braces + state.parens === 0 &&
            prev.type !== "bos" &&
            prev.type !== "slash"
          ) {
            push({
              type: "text",
              value,
              output: DOT_LITERAL,
            });
            continue;
          }
          push({
            type: "dot",
            value,
            output: DOT_LITERAL,
          });
          continue;
        }
        /**
         * Question marks
         */
        if (value === "?") {
          if (
            !(prev && prev.value === "(") &&
            opts.noextglob !== true &&
            peek() === "(" &&
            peek(2) !== "?"
          ) {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (
              (prev.value === "(" && !/[!=<:]/.test(next)) ||
              (next === "<" && !/<([!=]|\w+>)/.test(remaining()))
            )
              output = `\\${value}`;
            push({
              type: "text",
              value,
              output,
            });
            continue;
          }
          if (
            opts.dot !== true &&
            (prev.type === "slash" || prev.type === "bos")
          ) {
            push({
              type: "qmark",
              value,
              output: QMARK_NO_DOT,
            });
            continue;
          }
          push({
            type: "qmark",
            value,
            output: QMARK,
          });
          continue;
        }
        /**
         * Exclamation
         */
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        /**
         * Plus
         */
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if ((prev && prev.value === "(") || opts.regex === false) {
            push({
              type: "plus",
              value,
              output: PLUS_LITERAL,
            });
            continue;
          }
          if (
            (prev &&
              (prev.type === "bracket" ||
                prev.type === "paren" ||
                prev.type === "brace")) ||
            state.parens > 0
          ) {
            push({
              type: "plus",
              value,
            });
            continue;
          }
          push({
            type: "plus",
            value: PLUS_LITERAL,
          });
          continue;
        }
        /**
         * Plain text
         */
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({
              type: "at",
              extglob: true,
              value,
              output: "",
            });
            continue;
          }
          push({
            type: "text",
            value,
          });
          continue;
        }
        /**
         * Plain text
         */
        if (value !== "*") {
          if (value === "$" || value === "^") value = `\\${value}`;
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({
            type: "text",
            value,
          });
          continue;
        }
        /**
         * Stars
         */
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar =
            before && (before.type === "star" || before.type === "globstar");
          if (
            opts.bash === true &&
            (!isStart || (rest[0] && rest[0] !== "/"))
          ) {
            push({
              type: "star",
              value,
              output: "",
            });
            continue;
          }
          const isBrace =
            state.braces > 0 &&
            (prior.type === "comma" || prior.type === "brace");
          const isExtglob =
            extglobs.length &&
            (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({
              type: "star",
              value,
              output: "",
            });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") break;
            rest = rest.slice(3);
            consume("/**", 3);
          }
          const isEnd =
            eos() ||
            (state.parens > 0 &&
              rest === ")".repeat(state.parens) &&
              !extglobs.some((extglob) => extglob.type === "negate"));
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (
            prior.type === "slash" &&
            prior.prev.type !== "bos" &&
            !afterStar &&
            isEnd
          ) {
            state.output = state.output.slice(
              0,
              -(prior.output + prev.output).length,
            );
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (
            prior.type === "slash" &&
            prior.prev.type !== "bos" &&
            rest[0] === "/"
          ) {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(
              0,
              -(prior.output + prev.output).length,
            );
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({
              type: "slash",
              value: "/",
              output: "",
            });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({
              type: "slash",
              value: "/",
              output: "",
            });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = {
          type: "star",
          value,
          output: star,
        };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash")
            token.output = nodot + token.output;
          push(token);
          continue;
        }
        if (
          prev &&
          (prev.type === "bracket" || prev.type === "paren") &&
          opts.regex === true
        ) {
          token.output = value;
          push(token);
          continue;
        }
        if (
          state.index === state.start ||
          prev.type === "slash" ||
          prev.type === "dot"
        ) {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true)
          throw new _p_SyntaxErrorCtor(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true)
          throw new _p_SyntaxErrorCtor(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true)
          throw new _p_SyntaxErrorCtor(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (
        opts.strictSlashes !== true &&
        (prev.type === "star" || prev.type === "bracket")
      )
        push({
          type: "maybe_slash",
          value: "",
          output: `${SLASH_LITERAL}?`,
        });
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) state.output += token.suffix;
        }
      }
      return state;
    };
    /**
     * Fast paths for creating regular expressions for common glob patterns.
     * This can significantly speed up processing and has very little downside
     * impact when none of the fast paths match.
     */
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max =
        typeof opts.maxLength === "number"
          ? _p_MathMin(MAX_LENGTH, opts.maxLength)
          : MAX_LENGTH;
      const len = input.length;
      if (len > max)
        throw new _p_SyntaxErrorCtor(
          `Input length: ${len}, exceeds maximum allowed length: ${max}`,
        );
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR,
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = {
        negated: false,
        prefix: "",
      };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) star = `(${star})`;
      const globstar = (opts) => {
        if (opts.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source = create(match[1]);
            if (!source) return;
            return source + DOT_LITERAL + match[2];
          }
        }
      };
      let source = create(utils.removePrefix(input, state));
      if (source && opts.strictSlashes !== true) source += `${SLASH_LITERAL}?`;
      return source;
    };
    module.exports = parse;
  });
  var require_picomatch$1 = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const scan = require_scan();
    const parse = require_parse$1();
    const utils = require_utils$3();
    const constants = require_constants$2();
    const isObject = (val) =>
      val && typeof val === "object" && !_p_ArrayIsArray(val);
    /**
     * Creates a matcher function from one or more glob patterns. The
     * returned function takes a string to match as its first argument,
     * and returns true if the string is a match. The returned matcher
     * function also takes a boolean as the second argument that, when true,
     * returns an object with additional information.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch(glob[, options]);
     *
     * const isMatch = picomatch('*.!(*a)');
     * console.log(isMatch('a.a')); //=> false
     * console.log(isMatch('a.b')); //=> true
     *
     * // For environments without `node.js`, `picomatch/posix` provides you a dependency-free matcher, without automatic OS detection.
     * const picomatch = require('picomatch/posix');
     * // the same API, defaulting to posix paths
     * const isMatch = picomatch('a/*');
     * console.log(isMatch('a\\b')); //=> false
     * console.log(isMatch('a/b')); //=> true
     *
     * // you can still configure the matcher function to accept windows paths
     * const isMatch = picomatch('a/*', { options: windows });
     * console.log(isMatch('a\\b')); //=> true
     * console.log(isMatch('a/b')); //=> true
     * ```
     * @name picomatch
     * @param {String|Array} `globs` One or more glob patterns.
     * @param {Object=} `options`
     * @return {Function=} Returns a matcher function.
     * @api public
     */
    const picomatch = (glob, options, returnState = false) => {
      if (_p_ArrayIsArray(glob)) {
        const fns = glob.map((input) => picomatch(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state = isMatch(str);
            if (state) return state;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || (typeof glob !== "string" && !isState))
        throw new _p_TypeErrorCtor("Expected pattern to be a non-empty string");
      const opts = options || {};
      const posix = opts.windows;
      const regex = isState
        ? picomatch.compileRe(glob, options)
        : picomatch.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = {
          ...options,
          ignore: null,
          onMatch: null,
          onResult: null,
        };
        isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch.test(
          input,
          regex,
          options,
          {
            glob,
            posix,
          },
        );
        const result = {
          glob,
          state,
          regex,
          posix,
          input,
          output,
          match,
          isMatch,
        };
        if (typeof opts.onResult === "function") opts.onResult(result);
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") opts.onIgnore(result);
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") opts.onMatch(result);
        return returnObject ? result : true;
      };
      if (returnState) matcher.state = state;
      return matcher;
    };
    /**
     * Test `input` with the given `regex`. This is used by the main
     * `picomatch()` function to test the input string.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.test(input, regex[, options]);
     *
     * console.log(picomatch.test('foo/bar', /^(?:([^/]*?)\/([^/]*?))$/));
     * // { isMatch: true, match: [ 'foo/', 'foo', 'bar' ], output: 'foo/bar' }
     * ```
     * @param {String} `input` String to test.
     * @param {RegExp} `regex`
     * @return {Object} Returns an object with matching info.
     * @api public
     */
    picomatch.test = (input, regex, options, { glob, posix } = {}) => {
      if (typeof input !== "string")
        throw new _p_TypeErrorCtor("Expected input to be a string");
      if (input === "")
        return {
          isMatch: false,
          output: "",
        };
      const opts = options || {};
      const format = opts.format || (posix ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true)
          match = picomatch.matchBase(input, regex, options, posix);
        else match = regex.exec(output);
      }
      return {
        isMatch: Boolean(match),
        match,
        output,
      };
    };
    /**
     * Match the basename of a filepath.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.matchBase(input, glob[, options]);
     * console.log(picomatch.matchBase('foo/bar.js', '*.js'); // true
     * ```
     * @param {String} `input` String to test.
     * @param {RegExp|String} `glob` Glob pattern or regex created by [.makeRe](#makeRe).
     * @return {Boolean}
     * @api public
     */
    picomatch.matchBase = (
      input,
      glob,
      options,
      posix = options && options.windows,
    ) => {
      return (
        glob instanceof RegExp ? glob : picomatch.makeRe(glob, options)
      ).test(utils.basename(input, { windows: posix }));
    };
    /**
     * Returns true if **any** of the given glob `patterns` match the specified `string`.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.isMatch(string, patterns[, options]);
     *
     * console.log(picomatch.isMatch('a.a', ['b.*', '*.a'])); //=> true
     * console.log(picomatch.isMatch('a.a', 'b.*')); //=> false
     * ```
     * @param {String|Array} str The string to test.
     * @param {String|Array} patterns One or more glob patterns to use for matching.
     * @param {Object} [options] See available [options](#options).
     * @return {Boolean} Returns true if any patterns match `str`
     * @api public
     */
    picomatch.isMatch = (str, patterns, options) =>
      picomatch(patterns, options)(str);
    /**
     * Parse a glob pattern to create the source string for a regular
     * expression.
     *
     * ```js
     * const picomatch = require('picomatch');
     * const result = picomatch.parse(pattern[, options]);
     * ```
     * @param {String} `pattern`
     * @param {Object} `options`
     * @return {Object} Returns an object with useful properties and output to be used as a regex source string.
     * @api public
     */
    picomatch.parse = (pattern, options) => {
      if (_p_ArrayIsArray(pattern))
        return pattern.map((p) => picomatch.parse(p, options));
      return parse(pattern, {
        ...options,
        fastpaths: false,
      });
    };
    /**
     * Scan a glob pattern to separate the pattern into segments.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.scan(input[, options]);
     *
     * const result = picomatch.scan('!./foo/*.js');
     * console.log(result);
     * { prefix: '!./',
     *   input: '!./foo/*.js',
     *   start: 3,
     *   base: 'foo',
     *   glob: '*.js',
     *   isBrace: false,
     *   isBracket: false,
     *   isGlob: true,
     *   isExtglob: false,
     *   isGlobstar: false,
     *   negated: true }
     * ```
     * @param {String} `input` Glob pattern to scan.
     * @param {Object} `options`
     * @return {Object} Returns an object with
     * @api public
     */
    picomatch.scan = (input, options) => scan(input, options);
    /**
     * Compile a regular expression from the `state` object returned by the
     * [parse()](#parse) method.
     *
     * ```js
     * const picomatch = require('picomatch');
     * const state = picomatch.parse('*.js');
     * // picomatch.compileRe(state[, options]);
     *
     * console.log(picomatch.compileRe(state));
     * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
     * ```
     * @param {Object} `state`
     * @param {Object} `options`
     * @param {Boolean} `returnOutput` Intended for implementors, this argument allows you to return the raw output from the parser.
     * @param {Boolean} `returnState` Adds the state to a `state` property on the returned regex. Useful for implementors and debugging.
     * @return {RegExp}
     * @api public
     */
    picomatch.compileRe = (
      state,
      options,
      returnOutput = false,
      returnState = false,
    ) => {
      if (returnOutput === true) return state.output;
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) source = `^(?!${source}).*$`;
      const regex = picomatch.toRegex(source, options);
      if (returnState === true) regex.state = state;
      return regex;
    };
    /**
     * Create a regular expression from a parsed glob pattern.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.makeRe(state[, options]);
     *
     * const result = picomatch.makeRe('*.js');
     * console.log(result);
     * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
     * ```
     * @param {String} `state` The object returned from the `.parse` method.
     * @param {Object} `options`
     * @param {Boolean} `returnOutput` Implementors may use this argument to return the compiled output, instead of a regular expression. This is not exposed on the options to prevent end-users from mutating the result.
     * @param {Boolean} `returnState` Implementors may use this argument to return the state from the parsed glob with the returned regular expression.
     * @return {RegExp} Returns a regex created from the given pattern.
     * @api public
     */
    picomatch.makeRe = (
      input,
      options = {},
      returnOutput = false,
      returnState = false,
    ) => {
      if (!input || typeof input !== "string")
        throw new _p_TypeErrorCtor("Expected a non-empty string");
      let parsed = {
        negated: false,
        fastpaths: true,
      };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*"))
        parsed.output = parse.fastpaths(input, options);
      if (!parsed.output) parsed = parse(input, options);
      return picomatch.compileRe(parsed, options, returnOutput, returnState);
    };
    /**
     * Create a regular expression from the given regex source string.
     *
     * ```js
     * const picomatch = require('picomatch');
     * // picomatch.toRegex(source[, options]);
     *
     * const { output } = picomatch.parse('*.js');
     * console.log(picomatch.toRegex(output));
     * //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
     * ```
     * @param {String} `source` Regular expression source string.
     * @param {Object} `options`
     * @return {RegExp}
     * @api public
     */
    picomatch.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new _p_RegExpCtor(
          source,
          opts.flags || (opts.nocase ? "i" : ""),
        );
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    /**
     * Picomatch constants.
     * @return {Object}
     */
    picomatch.constants = constants;
    /**
     * Expose "picomatch"
     */
    module.exports = picomatch;
  });
  var require_picomatch = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const pico = require_picomatch$1();
    const utils = require_utils$3();
    function picomatch(glob, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0))
        options = {
          ...options,
          windows: utils.isWindows(),
        };
      return pico(glob, options, returnState);
    }
    _p_ObjectAssign(picomatch, pico);
    module.exports = picomatch;
  });
  function mergeStreams(streams) {
    if (!_p_ArrayIsArray(streams))
      throw new _p_TypeErrorCtor(
        `Expected an array, got \`${typeof streams}\`.`,
      );
    for (const stream of streams) validateStream(stream);
    const objectMode = streams.some(
      ({ readableObjectMode }) => readableObjectMode,
    );
    const highWaterMark = getHighWaterMark(streams, objectMode);
    const passThroughStream = new MergedStream({
      objectMode,
      writableHighWaterMark: highWaterMark,
      readableHighWaterMark: highWaterMark,
    });
    for (const stream of streams) passThroughStream.add(stream);
    return passThroughStream;
  }
  var getHighWaterMark;
  var MergedStream;
  var onMergedStreamFinished;
  var onMergedStreamEnd;
  var onInputStreamsUnpipe;
  var validateStream;
  var endWhenStreamsDone;
  var afterMergedStreamFinished;
  var onInputStreamEnd;
  var onInputStreamUnpipe;
  var endStream;
  var errorOrAbortStream;
  var isAbortError;
  var abortStream;
  var errorStream;
  var noop;
  var updateMaxListeners;
  var PASSTHROUGH_LISTENERS_COUNT;
  var PASSTHROUGH_LISTENERS_PER_STREAM;
  var init_merge_streams = __esmMin(() => {
    getHighWaterMark = (streams, objectMode) => {
      if (streams.length === 0)
        return (0, node_stream.getDefaultHighWaterMark)(objectMode);
      const highWaterMarks = streams
        .filter(({ readableObjectMode }) => readableObjectMode === objectMode)
        .map(({ readableHighWaterMark }) => readableHighWaterMark);
      return _p_MathMax(...highWaterMarks);
    };
    MergedStream = class extends node_stream.PassThrough {
      #streams = /* @__PURE__ */ new _p_SetCtor([]);
      #ended = /* @__PURE__ */ new _p_SetCtor([]);
      #aborted = /* @__PURE__ */ new _p_SetCtor([]);
      #onFinished;
      #unpipeEvent = Symbol("unpipe");
      #streamPromises = /* @__PURE__ */ new _p_WeakMapCtor();
      add(stream) {
        validateStream(stream);
        if (this.#streams.has(stream)) return;
        this.#streams.add(stream);
        this.#onFinished ??= onMergedStreamFinished(
          this,
          this.#streams,
          this.#unpipeEvent,
        );
        const streamPromise = endWhenStreamsDone({
          passThroughStream: this,
          stream,
          streams: this.#streams,
          ended: this.#ended,
          aborted: this.#aborted,
          onFinished: this.#onFinished,
          unpipeEvent: this.#unpipeEvent,
        });
        this.#streamPromises.set(stream, streamPromise);
        stream.pipe(this, { end: false });
      }
      async remove(stream) {
        validateStream(stream);
        if (!this.#streams.has(stream)) return false;
        const streamPromise = this.#streamPromises.get(stream);
        if (streamPromise === void 0) return false;
        this.#streamPromises.delete(stream);
        stream.unpipe(this);
        await streamPromise;
        return true;
      }
    };
    onMergedStreamFinished = async (
      passThroughStream,
      streams,
      unpipeEvent,
    ) => {
      updateMaxListeners(passThroughStream, PASSTHROUGH_LISTENERS_COUNT);
      const controller = new AbortController();
      try {
        await _p_PromiseRace([
          onMergedStreamEnd(passThroughStream, controller),
          onInputStreamsUnpipe(
            passThroughStream,
            streams,
            unpipeEvent,
            controller,
          ),
        ]);
      } finally {
        controller.abort();
        updateMaxListeners(passThroughStream, -PASSTHROUGH_LISTENERS_COUNT);
      }
    };
    onMergedStreamEnd = async (passThroughStream, { signal }) => {
      try {
        await (0, node_stream_promises.finished)(passThroughStream, {
          signal,
          cleanup: true,
        });
      } catch (error) {
        errorOrAbortStream(passThroughStream, error);
        throw error;
      }
    };
    onInputStreamsUnpipe = async (
      passThroughStream,
      streams,
      unpipeEvent,
      { signal },
    ) => {
      for await (const [unpipedStream] of (0, node_events.on)(
        passThroughStream,
        "unpipe",
        { signal },
      ))
        if (streams.has(unpipedStream)) unpipedStream.emit(unpipeEvent);
    };
    validateStream = (stream) => {
      if (typeof stream?.pipe !== "function")
        throw new _p_TypeErrorCtor(
          `Expected a readable stream, got: \`${typeof stream}\`.`,
        );
    };
    endWhenStreamsDone = async ({
      passThroughStream,
      stream,
      streams,
      ended,
      aborted,
      onFinished,
      unpipeEvent,
    }) => {
      updateMaxListeners(passThroughStream, PASSTHROUGH_LISTENERS_PER_STREAM);
      const controller = new AbortController();
      try {
        await _p_PromiseRace([
          afterMergedStreamFinished(onFinished, stream, controller),
          onInputStreamEnd({
            passThroughStream,
            stream,
            streams,
            ended,
            aborted,
            controller,
          }),
          onInputStreamUnpipe({
            stream,
            streams,
            ended,
            aborted,
            unpipeEvent,
            controller,
          }),
        ]);
      } finally {
        controller.abort();
        updateMaxListeners(
          passThroughStream,
          -PASSTHROUGH_LISTENERS_PER_STREAM,
        );
      }
      if (streams.size > 0 && streams.size === ended.size + aborted.size) {
        if (ended.size === 0 && aborted.size > 0)
          abortStream(passThroughStream);
        else endStream(passThroughStream);
      }
    };
    afterMergedStreamFinished = async (onFinished, stream, { signal }) => {
      try {
        await onFinished;
        if (!signal.aborted) abortStream(stream);
      } catch (error) {
        if (!signal.aborted) errorOrAbortStream(stream, error);
      }
    };
    onInputStreamEnd = async ({
      passThroughStream,
      stream,
      streams,
      ended,
      aborted,
      controller: { signal },
    }) => {
      try {
        await (0, node_stream_promises.finished)(stream, {
          signal,
          cleanup: true,
          readable: true,
          writable: false,
        });
        if (streams.has(stream)) ended.add(stream);
      } catch (error) {
        if (signal.aborted || !streams.has(stream)) return;
        if (isAbortError(error)) aborted.add(stream);
        else errorStream(passThroughStream, error);
      }
    };
    onInputStreamUnpipe = async ({
      stream,
      streams,
      ended,
      aborted,
      unpipeEvent,
      controller: { signal },
    }) => {
      await (0, node_events.once)(stream, unpipeEvent, { signal });
      if (!stream.readable)
        return (0, node_events.once)(signal, "abort", { signal });
      streams.delete(stream);
      ended.delete(stream);
      aborted.delete(stream);
    };
    endStream = (stream) => {
      if (stream.writable) stream.end();
    };
    errorOrAbortStream = (stream, error) => {
      if (isAbortError(error)) abortStream(stream);
      else errorStream(stream, error);
    };
    isAbortError = (error) => error?.code === "ERR_STREAM_PREMATURE_CLOSE";
    abortStream = (stream) => {
      if (stream.readable || stream.writable) stream.destroy();
    };
    errorStream = (stream, error) => {
      if (!stream.destroyed) {
        stream.once("error", noop);
        stream.destroy(error);
      }
    };
    noop = () => {};
    updateMaxListeners = (passThroughStream, increment) => {
      const maxListeners = passThroughStream.getMaxListeners();
      if (maxListeners !== 0 && maxListeners !== Number.POSITIVE_INFINITY)
        passThroughStream.setMaxListeners(maxListeners + increment);
    };
    PASSTHROUGH_LISTENERS_COUNT = 2;
    PASSTHROUGH_LISTENERS_PER_STREAM = 1;
  });
  var require_array = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.splitWhen = exports.flatten = void 0;
    function flatten(items) {
      return items.reduce(
        (collection, item) => [].concat(collection, item),
        [],
      );
    }
    exports.flatten = flatten;
    function splitWhen(items, predicate) {
      const result = [[]];
      let groupIndex = 0;
      for (const item of items)
        if (predicate(item)) {
          groupIndex++;
          result[groupIndex] = [];
        } else result[groupIndex].push(item);
      return result;
    }
    exports.splitWhen = splitWhen;
  });
  var require_errno = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.isEnoentCodeError = void 0;
    function isEnoentCodeError(error) {
      return error.code === "ENOENT";
    }
    exports.isEnoentCodeError = isEnoentCodeError;
  });
  var require_fs$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports.createDirentFromStats = createDirentFromStats;
  });
  var require_path = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.convertPosixPathToPattern =
      exports.convertWindowsPathToPattern =
      exports.convertPathToPattern =
      exports.escapePosixPath =
      exports.escapeWindowsPath =
      exports.escape =
      exports.removeLeadingDotSegment =
      exports.makeAbsolute =
      exports.unixify =
        void 0;
    const os$2 = __require("os");
    const path$11 = __require("path");
    const IS_WINDOWS_PLATFORM = os$2.platform() === "win32";
    const LEADING_DOT_SEGMENT_CHARACTERS_COUNT = 2;
    /**
     * All non-escaped special characters.
     * Posix: ()*?[]{|}, !+@ before (, ! at the beginning, \\ before non-special characters.
     * Windows: (){}[], !+@ before (, ! at the beginning.
     */
    const POSIX_UNESCAPED_GLOB_SYMBOLS_RE =
      /(\\?)([()*?[\]{|}]|^!|[!+@](?=\()|\\(?![!()*+?@[\]{|}]))/g;
    const WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE =
      /(\\?)([()[\]{}]|^!|[!+@](?=\())/g;
    /**
     * The device path (\\.\ or \\?\).
     * https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats#dos-device-paths
     */
    const DOS_DEVICE_PATH_RE = /^\\\\([.?])/;
    /**
     * All backslashes except those escaping special characters.
     * Windows: !()+@{}
     * https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#naming-conventions
     */
    const WINDOWS_BACKSLASHES_RE = /\\(?![!()+@[\]{}])/g;
    /**
     * Designed to work only with simple paths: `dir\\file`.
     */
    function unixify(filepath) {
      return filepath.replace(/\\/g, "/");
    }
    exports.unixify = unixify;
    function makeAbsolute(cwd, filepath) {
      return path$11.resolve(cwd, filepath);
    }
    exports.makeAbsolute = makeAbsolute;
    function removeLeadingDotSegment(entry) {
      if (_p_StringPrototypeCharAt(entry, 0) === ".") {
        const secondCharactery = _p_StringPrototypeCharAt(entry, 1);
        if (secondCharactery === "/" || secondCharactery === "\\")
          return entry.slice(LEADING_DOT_SEGMENT_CHARACTERS_COUNT);
      }
      return entry;
    }
    exports.removeLeadingDotSegment = removeLeadingDotSegment;
    exports.escape = IS_WINDOWS_PLATFORM ? escapeWindowsPath : escapePosixPath;
    function escapeWindowsPath(pattern) {
      return pattern.replace(WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports.escapeWindowsPath = escapeWindowsPath;
    function escapePosixPath(pattern) {
      return pattern.replace(POSIX_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports.escapePosixPath = escapePosixPath;
    exports.convertPathToPattern = IS_WINDOWS_PLATFORM
      ? convertWindowsPathToPattern
      : convertPosixPathToPattern;
    function convertWindowsPathToPattern(filepath) {
      return escapeWindowsPath(filepath)
        .replace(DOS_DEVICE_PATH_RE, "//$1")
        .replace(WINDOWS_BACKSLASHES_RE, "/");
    }
    exports.convertWindowsPathToPattern = convertWindowsPathToPattern;
    function convertPosixPathToPattern(filepath) {
      return escapePosixPath(filepath);
    }
    exports.convertPosixPathToPattern = convertPosixPathToPattern;
  });
  var require_is_extglob = /* @__PURE__ */ __commonJSMin((exports, module) => {
    /*!
     * is-extglob <https://github.com/jonschlinkert/is-extglob>
     *
     * Copyright (c) 2014-2016, Jon Schlinkert.
     * Licensed under the MIT License.
     */
    module.exports = function isExtglob(str) {
      if (typeof str !== "string" || str === "") return false;
      var match;
      while ((match = /(\\).|([@?!+*]\(.*\))/g.exec(str))) {
        if (match[2]) return true;
        str = str.slice(match.index + match[0].length);
      }
      return false;
    };
  });
  var require_is_glob = /* @__PURE__ */ __commonJSMin((exports, module) => {
    /*!
     * is-glob <https://github.com/jonschlinkert/is-glob>
     *
     * Copyright (c) 2014-2017, Jon Schlinkert.
     * Released under the MIT License.
     */
    var isExtglob = require_is_extglob();
    var chars = {
      "{": "}",
      "(": ")",
      "[": "]",
    };
    var strictCheck = function (str) {
      if (str[0] === "!") return true;
      var index = 0;
      var pipeIndex = -2;
      var closeSquareIndex = -2;
      var closeCurlyIndex = -2;
      var closeParenIndex = -2;
      var backSlashIndex = -2;
      while (index < str.length) {
        if (str[index] === "*") return true;
        if (str[index + 1] === "?" && /[\].+)]/.test(str[index])) return true;
        if (
          closeSquareIndex !== -1 &&
          str[index] === "[" &&
          str[index + 1] !== "]"
        ) {
          if (closeSquareIndex < index)
            closeSquareIndex = str.indexOf("]", index);
          if (closeSquareIndex > index) {
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex)
              return true;
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex)
              return true;
          }
        }
        if (
          closeCurlyIndex !== -1 &&
          str[index] === "{" &&
          str[index + 1] !== "}"
        ) {
          closeCurlyIndex = str.indexOf("}", index);
          if (closeCurlyIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeCurlyIndex)
              return true;
          }
        }
        if (
          closeParenIndex !== -1 &&
          str[index] === "(" &&
          str[index + 1] === "?" &&
          /[:!=]/.test(str[index + 2]) &&
          str[index + 3] !== ")"
        ) {
          closeParenIndex = str.indexOf(")", index);
          if (closeParenIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeParenIndex)
              return true;
          }
        }
        if (pipeIndex !== -1 && str[index] === "(" && str[index + 1] !== "|") {
          if (pipeIndex < index) pipeIndex = str.indexOf("|", index);
          if (pipeIndex !== -1 && str[pipeIndex + 1] !== ")") {
            closeParenIndex = str.indexOf(")", pipeIndex);
            if (closeParenIndex > pipeIndex) {
              backSlashIndex = str.indexOf("\\", pipeIndex);
              if (backSlashIndex === -1 || backSlashIndex > closeParenIndex)
                return true;
            }
          }
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) index = n + 1;
          }
          if (str[index] === "!") return true;
        } else index++;
      }
      return false;
    };
    var relaxedCheck = function (str) {
      if (str[0] === "!") return true;
      var index = 0;
      while (index < str.length) {
        if (/[*?{}()[\]]/.test(str[index])) return true;
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) index = n + 1;
          }
          if (str[index] === "!") return true;
        } else index++;
      }
      return false;
    };
    module.exports = function isGlob(str, options) {
      if (typeof str !== "string" || str === "") return false;
      if (isExtglob(str)) return true;
      var check = strictCheck;
      if (options && options.strict === false) check = relaxedCheck;
      return check(str);
    };
  });
  var require_glob_parent = /* @__PURE__ */ __commonJSMin((exports, module) => {
    var isGlob = require_is_glob();
    var pathPosixDirname = __require("path").posix.dirname;
    var isWin32 = __require("os").platform() === "win32";
    var slash = "/";
    var backslash = /\\/g;
    var enclosure = /[\{\[].*[\}\]]$/;
    var globby = /(^|[^\\])([\{\[]|\([^\)]+$)/;
    var escaped = /\\([\!\*\?\|\[\]\(\)\{\}])/g;
    /**
     * @param {string} str
     * @param {Object} opts
     * @param {boolean} [opts.flipBackslashes=true]
     * @returns {string}
     */
    module.exports = function globParent(str, opts) {
      if (
        _p_ObjectAssign({ flipBackslashes: true }, opts).flipBackslashes &&
        isWin32 &&
        str.indexOf(slash) < 0
      )
        str = str.replace(backslash, slash);
      if (enclosure.test(str)) str += slash;
      str += "a";
      do str = pathPosixDirname(str);
      while (isGlob(str) || globby.test(str));
      return str.replace(escaped, "$1");
    };
  });
  var require_utils$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    exports.isInteger = (num) => {
      if (typeof num === "number") return _p_NumberIsInteger(num);
      if (typeof num === "string" && _p_StringPrototypeTrim(num) !== "")
        return _p_NumberIsInteger(Number(num));
      return false;
    };
    /**
     * Find a node of the given type
     */
    exports.find = (node, type) =>
      node.nodes.find((node) => node.type === type);
    /**
     * Find a node of the given type
     */
    exports.exceedsLimit = (min, max, step = 1, limit) => {
      if (limit === false) return false;
      if (!exports.isInteger(min) || !exports.isInteger(max)) return false;
      return (Number(max) - Number(min)) / Number(step) >= limit;
    };
    /**
     * Escape the given node with '\\' before node.value
     */
    exports.escapeNode = (block, n = 0, type) => {
      const node = block.nodes[n];
      if (!node) return;
      if (
        (type && node.type === type) ||
        node.type === "open" ||
        node.type === "close"
      ) {
        if (node.escaped !== true) {
          node.value = "\\" + node.value;
          node.escaped = true;
        }
      }
    };
    /**
     * Returns true if the given brace node should be enclosed in literal braces
     */
    exports.encloseBrace = (node) => {
      if (node.type !== "brace") return false;
      if ((node.commas >> (0 + node.ranges)) >> 0 === 0) {
        node.invalid = true;
        return true;
      }
      return false;
    };
    /**
     * Returns true if a brace node is invalid.
     */
    exports.isInvalidBrace = (block) => {
      if (block.type !== "brace") return false;
      if (block.invalid === true || block.dollar) return true;
      if ((block.commas >> (0 + block.ranges)) >> 0 === 0) {
        block.invalid = true;
        return true;
      }
      if (block.open !== true || block.close !== true) {
        block.invalid = true;
        return true;
      }
      return false;
    };
    /**
     * Returns true if a node is an open or close node
     */
    exports.isOpenOrClose = (node) => {
      if (node.type === "open" || node.type === "close") return true;
      return node.open === true || node.close === true;
    };
    /**
     * Reduce an array of text nodes.
     */
    exports.reduce = (nodes) =>
      nodes.reduce((acc, node) => {
        if (node.type === "text") acc.push(node.value);
        if (node.type === "range") node.type = "text";
        return acc;
      }, []);
    /**
     * Flatten an array
     */
    exports.flatten = (...args) => {
      const result = [];
      const flat = (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const ele = arr[i];
          if (_p_ArrayIsArray(ele)) {
            flat(ele);
            continue;
          }
          if (ele !== void 0) result.push(ele);
        }
        return result;
      };
      flat(args);
      return result;
    };
  });
  var require_stringify = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const utils = require_utils$2();
    module.exports = (ast, options = {}) => {
      const stringify = (node, parent = {}) => {
        const invalidBlock =
          options.escapeInvalid && utils.isInvalidBrace(parent);
        const invalidNode =
          node.invalid === true && options.escapeInvalid === true;
        let output = "";
        if (node.value) {
          if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node))
            return "\\" + node.value;
          return node.value;
        }
        if (node.value) return node.value;
        if (node.nodes)
          for (const child of node.nodes) output += stringify(child);
        return output;
      };
      return stringify(ast);
    };
  });
  /*!
   * is-number <https://github.com/jonschlinkert/is-number>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Released under the MIT License.
   */
  var require_is_number = /* @__PURE__ */ __commonJSMin((exports, module) => {
    module.exports = function (num) {
      if (typeof num === "number") return num - num === 0;
      if (typeof num === "string" && _p_StringPrototypeTrim(num) !== "")
        return Number.isFinite ? _p_NumberIsFinite(+num) : isFinite(+num);
      return false;
    };
  });
  /*!
   * to-regex-range <https://github.com/micromatch/to-regex-range>
   *
   * Copyright (c) 2015-present, Jon Schlinkert.
   * Released under the MIT License.
   */
  var require_to_regex_range = /* @__PURE__ */ __commonJSMin(
    (exports, module) => {
      const isNumber = require_is_number();
      const toRegexRange = (min, max, options) => {
        if (isNumber(min) === false)
          throw new _p_TypeErrorCtor(
            "toRegexRange: expected the first argument to be a number",
          );
        if (max === void 0 || min === max) return String(min);
        if (isNumber(max) === false)
          throw new _p_TypeErrorCtor(
            "toRegexRange: expected the second argument to be a number.",
          );
        let opts = {
          relaxZeros: true,
          ...options,
        };
        if (typeof opts.strictZeros === "boolean")
          opts.relaxZeros = opts.strictZeros === false;
        let relax = String(opts.relaxZeros);
        let shorthand = String(opts.shorthand);
        let capture = String(opts.capture);
        let wrap = String(opts.wrap);
        let cacheKey =
          min + ":" + max + "=" + relax + shorthand + capture + wrap;
        if (toRegexRange.cache.hasOwnProperty(cacheKey))
          return toRegexRange.cache[cacheKey].result;
        let a = _p_MathMin(min, max);
        let b = _p_MathMax(min, max);
        if (_p_MathAbs(a - b) === 1) {
          let result = min + "|" + max;
          if (opts.capture) return `(${result})`;
          if (opts.wrap === false) return result;
          return `(?:${result})`;
        }
        let isPadded = hasPadding(min) || hasPadding(max);
        let state = {
          min,
          max,
          a,
          b,
        };
        let positives = [];
        let negatives = [];
        if (isPadded) {
          state.isPadded = isPadded;
          state.maxLen = String(state.max).length;
        }
        if (a < 0) {
          negatives = splitToPatterns(
            b < 0 ? _p_MathAbs(b) : 1,
            _p_MathAbs(a),
            state,
            opts,
          );
          a = state.a = 0;
        }
        if (b >= 0) positives = splitToPatterns(a, b, state, opts);
        state.negatives = negatives;
        state.positives = positives;
        state.result = collatePatterns(negatives, positives, opts);
        if (opts.capture === true) state.result = `(${state.result})`;
        else if (opts.wrap !== false && positives.length + negatives.length > 1)
          state.result = `(?:${state.result})`;
        toRegexRange.cache[cacheKey] = state;
        return state.result;
      };
      function collatePatterns(neg, pos, options) {
        let onlyNegative = filterPatterns(neg, pos, "-", false, options) || [];
        let onlyPositive = filterPatterns(pos, neg, "", false, options) || [];
        let intersected = filterPatterns(neg, pos, "-?", true, options) || [];
        return onlyNegative.concat(intersected).concat(onlyPositive).join("|");
      }
      function splitToRanges(min, max) {
        let nines = 1;
        let zeros = 1;
        let stop = countNines(min, nines);
        let stops = /* @__PURE__ */ new _p_SetCtor([max]);
        while (min <= stop && stop <= max) {
          stops.add(stop);
          nines += 1;
          stop = countNines(min, nines);
        }
        stop = countZeros(max + 1, zeros) - 1;
        while (min < stop && stop <= max) {
          stops.add(stop);
          zeros += 1;
          stop = countZeros(max + 1, zeros) - 1;
        }
        stops = [...stops];
        stops.sort(compare);
        return stops;
      }
      /**
       * Convert a range to a regex pattern
       * @param {Number} `start`
       * @param {Number} `stop`
       * @return {String}
       */
      function rangeToPattern(start, stop, options) {
        if (start === stop)
          return {
            pattern: start,
            count: [],
            digits: 0,
          };
        let zipped = zip(start, stop);
        let digits = zipped.length;
        let pattern = "";
        let count = 0;
        for (let i = 0; i < digits; i++) {
          let [startDigit, stopDigit] = zipped[i];
          if (startDigit === stopDigit) pattern += startDigit;
          else if (startDigit !== "0" || stopDigit !== "9")
            pattern += toCharacterClass(startDigit, stopDigit, options);
          else count++;
        }
        if (count) pattern += options.shorthand === true ? "\\d" : "[0-9]";
        return {
          pattern,
          count: [count],
          digits,
        };
      }
      function splitToPatterns(min, max, tok, options) {
        let ranges = splitToRanges(min, max);
        let tokens = [];
        let start = min;
        let prev;
        for (let i = 0; i < ranges.length; i++) {
          let max = ranges[i];
          let obj = rangeToPattern(String(start), String(max), options);
          let zeros = "";
          if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
            if (prev.count.length > 1) prev.count.pop();
            prev.count.push(obj.count[0]);
            prev.string = prev.pattern + toQuantifier(prev.count);
            start = max + 1;
            continue;
          }
          if (tok.isPadded) zeros = padZeros(max, tok, options);
          obj.string = zeros + obj.pattern + toQuantifier(obj.count);
          tokens.push(obj);
          start = max + 1;
          prev = obj;
        }
        return tokens;
      }
      function filterPatterns(arr, comparison, prefix, intersection, options) {
        let result = [];
        for (let ele of arr) {
          let { string } = ele;
          if (!intersection && !contains(comparison, "string", string))
            result.push(prefix + string);
          if (intersection && contains(comparison, "string", string))
            result.push(prefix + string);
        }
        return result;
      }
      /**
       * Zip strings
       */
      function zip(a, b) {
        let arr = [];
        for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
        return arr;
      }
      function compare(a, b) {
        return a > b ? 1 : b > a ? -1 : 0;
      }
      function contains(arr, key, val) {
        return arr.some((ele) => ele[key] === val);
      }
      function countNines(min, len) {
        return Number(String(min).slice(0, -len) + "9".repeat(len));
      }
      function countZeros(integer, zeros) {
        return integer - (integer % _p_MathPow(10, zeros));
      }
      function toQuantifier(digits) {
        let [start = 0, stop = ""] = digits;
        if (stop || start > 1) return `{${start + (stop ? "," + stop : "")}}`;
        return "";
      }
      function toCharacterClass(a, b, options) {
        return `[${a}${b - a === 1 ? "" : "-"}${b}]`;
      }
      function hasPadding(str) {
        return /^-?(0+)\d/.test(str);
      }
      function padZeros(value, tok, options) {
        if (!tok.isPadded) return value;
        let diff = _p_MathAbs(tok.maxLen - String(value).length);
        let relax = options.relaxZeros !== false;
        switch (diff) {
          case 0:
            return "";
          case 1:
            return relax ? "0?" : "0";
          case 2:
            return relax ? "0{0,2}" : "00";
          default:
            return relax ? `0{0,${diff}}` : `0{${diff}}`;
        }
      }
      /**
       * Cache
       */
      toRegexRange.cache = {};
      toRegexRange.clearCache = () => (toRegexRange.cache = {});
      /**
       * Expose `toRegexRange`
       */
      module.exports = toRegexRange;
    },
  );
  /*!
   * fill-range <https://github.com/jonschlinkert/fill-range>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Licensed under the MIT License.
   */
  var require_fill_range = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const util$1 = __require("util");
    const toRegexRange = require_to_regex_range();
    const isObject = (val) =>
      val !== null && typeof val === "object" && !_p_ArrayIsArray(val);
    const transform = (toNumber) => {
      return (value) => (toNumber === true ? Number(value) : String(value));
    };
    const isValidValue = (value) => {
      return (
        typeof value === "number" || (typeof value === "string" && value !== "")
      );
    };
    const isNumber = (num) => _p_NumberIsInteger(+num);
    const zeros = (input) => {
      let value = `${input}`;
      let index = -1;
      if (value[0] === "-") value = value.slice(1);
      if (value === "0") return false;
      while (value[++index] === "0");
      return index > 0;
    };
    const stringify = (start, end, options) => {
      if (typeof start === "string" || typeof end === "string") return true;
      return options.stringify === true;
    };
    const pad = (input, maxLength, toNumber) => {
      if (maxLength > 0) {
        let dash = input[0] === "-" ? "-" : "";
        if (dash) input = input.slice(1);
        input =
          dash +
          _p_StringPrototypePadStart(
            input,
            dash ? maxLength - 1 : maxLength,
            "0",
          );
      }
      if (toNumber === false) return String(input);
      return input;
    };
    const toMaxLen = (input, maxLength) => {
      let negative = input[0] === "-" ? "-" : "";
      if (negative) {
        input = input.slice(1);
        maxLength--;
      }
      while (input.length < maxLength) input = "0" + input;
      return negative ? "-" + input : input;
    };
    const toSequence = (parts, options, maxLen) => {
      parts.negatives.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      parts.positives.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      let prefix = options.capture ? "" : "?:";
      let positives = "";
      let negatives = "";
      let result;
      if (parts.positives.length)
        positives = parts.positives
          .map((v) => toMaxLen(String(v), maxLen))
          .join("|");
      if (parts.negatives.length)
        negatives = `-(${prefix}${parts.negatives.map((v) => toMaxLen(String(v), maxLen)).join("|")})`;
      if (positives && negatives) result = `${positives}|${negatives}`;
      else result = positives || negatives;
      if (options.wrap) return `(${prefix}${result})`;
      return result;
    };
    const toRange = (a, b, isNumbers, options) => {
      if (isNumbers)
        return toRegexRange(a, b, {
          wrap: false,
          ...options,
        });
      let start = _p_StringFromCharCode(a);
      if (a === b) return start;
      return `[${start}-${_p_StringFromCharCode(b)}]`;
    };
    const toRegex = (start, end, options) => {
      if (_p_ArrayIsArray(start)) {
        let wrap = options.wrap === true;
        let prefix = options.capture ? "" : "?:";
        return wrap ? `(${prefix}${start.join("|")})` : start.join("|");
      }
      return toRegexRange(start, end, options);
    };
    const rangeError = (...args) => {
      return /* @__PURE__ */ new _p_RangeErrorCtor(
        "Invalid range arguments: " + util$1.inspect(...args),
      );
    };
    const invalidRange = (start, end, options) => {
      if (options.strictRanges === true) throw rangeError([start, end]);
      return [];
    };
    const invalidStep = (step, options) => {
      if (options.strictRanges === true)
        throw new _p_TypeErrorCtor(`Expected step "${step}" to be a number`);
      return [];
    };
    const fillNumbers = (start, end, step = 1, options = {}) => {
      let a = Number(start);
      let b = Number(end);
      if (!_p_NumberIsInteger(a) || !_p_NumberIsInteger(b)) {
        if (options.strictRanges === true) throw rangeError([start, end]);
        return [];
      }
      if (a === 0) a = 0;
      if (b === 0) b = 0;
      let descending = a > b;
      let startString = String(start);
      let endString = String(end);
      let stepString = String(step);
      step = _p_MathMax(_p_MathAbs(step), 1);
      let padded = zeros(startString) || zeros(endString) || zeros(stepString);
      let maxLen = padded
        ? _p_MathMax(startString.length, endString.length, stepString.length)
        : 0;
      let toNumber =
        padded === false && stringify(start, end, options) === false;
      let format = options.transform || transform(toNumber);
      if (options.toRegex && step === 1)
        return toRange(
          toMaxLen(start, maxLen),
          toMaxLen(end, maxLen),
          true,
          options,
        );
      let parts = {
        negatives: [],
        positives: [],
      };
      let push = (num) =>
        parts[num < 0 ? "negatives" : "positives"].push(_p_MathAbs(num));
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        if (options.toRegex === true && step > 1) push(a);
        else range.push(pad(format(a, index), maxLen, toNumber));
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true)
        return step > 1
          ? toSequence(parts, options, maxLen)
          : toRegex(range, null, {
              wrap: false,
              ...options,
            });
      return range;
    };
    const fillLetters = (start, end, step = 1, options = {}) => {
      if (
        (!isNumber(start) && start.length > 1) ||
        (!isNumber(end) && end.length > 1)
      )
        return invalidRange(start, end, options);
      let format = options.transform || ((val) => _p_StringFromCharCode(val));
      let a = `${start}`.charCodeAt(0);
      let b = `${end}`.charCodeAt(0);
      let descending = a > b;
      let min = _p_MathMin(a, b);
      let max = _p_MathMax(a, b);
      if (options.toRegex && step === 1)
        return toRange(min, max, false, options);
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        range.push(format(a, index));
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true)
        return toRegex(range, null, {
          wrap: false,
          options,
        });
      return range;
    };
    const fill = (start, end, step, options = {}) => {
      if (end == null && isValidValue(start)) return [start];
      if (!isValidValue(start) || !isValidValue(end))
        return invalidRange(start, end, options);
      if (typeof step === "function")
        return fill(start, end, 1, { transform: step });
      if (isObject(step)) return fill(start, end, 0, step);
      let opts = { ...options };
      if (opts.capture === true) opts.wrap = true;
      step = step || opts.step || 1;
      if (!isNumber(step)) {
        if (step != null && !isObject(step)) return invalidStep(step, opts);
        return fill(start, end, 1, step);
      }
      if (isNumber(start) && isNumber(end))
        return fillNumbers(start, end, step, opts);
      return fillLetters(start, end, _p_MathMax(_p_MathAbs(step), 1), opts);
    };
    module.exports = fill;
  });
  var require_compile = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const fill = require_fill_range();
    const utils = require_utils$2();
    const compile = (ast, options = {}) => {
      const walk = (node, parent = {}) => {
        const invalidBlock = utils.isInvalidBrace(parent);
        const invalidNode =
          node.invalid === true && options.escapeInvalid === true;
        const invalid = invalidBlock === true || invalidNode === true;
        const prefix = options.escapeInvalid === true ? "\\" : "";
        let output = "";
        if (node.isOpen === true) return prefix + node.value;
        if (node.isClose === true) {
          console.log("node.isClose", prefix, node.value);
          return prefix + node.value;
        }
        if (node.type === "open") return invalid ? prefix + node.value : "(";
        if (node.type === "close") return invalid ? prefix + node.value : ")";
        if (node.type === "comma")
          return node.prev.type === "comma" ? "" : invalid ? node.value : "|";
        if (node.value) return node.value;
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          const range = fill(...args, {
            ...options,
            wrap: false,
            toRegex: true,
            strictZeros: true,
          });
          if (range.length !== 0)
            return args.length > 1 && range.length > 1 ? `(${range})` : range;
        }
        if (node.nodes)
          for (const child of node.nodes) output += walk(child, node);
        return output;
      };
      return walk(ast);
    };
    module.exports = compile;
  });
  var require_expand = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const fill = require_fill_range();
    const stringify = require_stringify();
    const utils = require_utils$2();
    const append = (queue = "", stash = "", enclose = false) => {
      const result = [];
      queue = [].concat(queue);
      stash = [].concat(stash);
      if (!stash.length) return queue;
      if (!queue.length)
        return enclose ? utils.flatten(stash).map((ele) => `{${ele}}`) : stash;
      for (const item of queue)
        if (_p_ArrayIsArray(item))
          for (const value of item) result.push(append(value, stash, enclose));
        else
          for (let ele of stash) {
            if (enclose === true && typeof ele === "string") ele = `{${ele}}`;
            result.push(
              _p_ArrayIsArray(ele) ? append(item, ele, enclose) : item + ele,
            );
          }
      return utils.flatten(result);
    };
    const expand = (ast, options = {}) => {
      const rangeLimit =
        options.rangeLimit === void 0 ? 1e3 : options.rangeLimit;
      const walk = (node, parent = {}) => {
        node.queue = [];
        let p = parent;
        let q = parent.queue;
        while (p.type !== "brace" && p.type !== "root" && p.parent) {
          p = p.parent;
          q = p.queue;
        }
        if (node.invalid || node.dollar) {
          q.push(append(q.pop(), stringify(node, options)));
          return;
        }
        if (
          node.type === "brace" &&
          node.invalid !== true &&
          node.nodes.length === 2
        ) {
          q.push(append(q.pop(), ["{}"]));
          return;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          if (utils.exceedsLimit(...args, options.step, rangeLimit))
            throw new _p_RangeErrorCtor(
              "expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.",
            );
          let range = fill(...args, options);
          if (range.length === 0) range = stringify(node, options);
          q.push(append(q.pop(), range));
          node.nodes = [];
          return;
        }
        const enclose = utils.encloseBrace(node);
        let queue = node.queue;
        let block = node;
        while (
          block.type !== "brace" &&
          block.type !== "root" &&
          block.parent
        ) {
          block = block.parent;
          queue = block.queue;
        }
        for (let i = 0; i < node.nodes.length; i++) {
          const child = node.nodes[i];
          if (child.type === "comma" && node.type === "brace") {
            if (i === 1) queue.push("");
            queue.push("");
            continue;
          }
          if (child.type === "close") {
            q.push(append(q.pop(), queue, enclose));
            continue;
          }
          if (child.value && child.type !== "open") {
            queue.push(append(queue.pop(), child.value));
            continue;
          }
          if (child.nodes) walk(child, node);
        }
        return queue;
      };
      return utils.flatten(walk(ast));
    };
    module.exports = expand;
  });
  var require_constants$1 = /* @__PURE__ */ __commonJSMin((exports, module) => {
    module.exports = {
      MAX_LENGTH: 1e4,
      CHAR_0: "0",
      CHAR_9: "9",
      CHAR_UPPERCASE_A: "A",
      CHAR_LOWERCASE_A: "a",
      CHAR_UPPERCASE_Z: "Z",
      CHAR_LOWERCASE_Z: "z",
      CHAR_LEFT_PARENTHESES: "(",
      CHAR_RIGHT_PARENTHESES: ")",
      CHAR_ASTERISK: "*",
      CHAR_AMPERSAND: "&",
      CHAR_AT: "@",
      CHAR_BACKSLASH: "\\",
      CHAR_BACKTICK: "`",
      CHAR_CARRIAGE_RETURN: "\r",
      CHAR_CIRCUMFLEX_ACCENT: "^",
      CHAR_COLON: ":",
      CHAR_COMMA: ",",
      CHAR_DOLLAR: "$",
      CHAR_DOT: ".",
      CHAR_DOUBLE_QUOTE: '"',
      CHAR_EQUAL: "=",
      CHAR_EXCLAMATION_MARK: "!",
      CHAR_FORM_FEED: "\f",
      CHAR_FORWARD_SLASH: "/",
      CHAR_HASH: "#",
      CHAR_HYPHEN_MINUS: "-",
      CHAR_LEFT_ANGLE_BRACKET: "<",
      CHAR_LEFT_CURLY_BRACE: "{",
      CHAR_LEFT_SQUARE_BRACKET: "[",
      CHAR_LINE_FEED: "\n",
      CHAR_NO_BREAK_SPACE: "\xA0",
      CHAR_PERCENT: "%",
      CHAR_PLUS: "+",
      CHAR_QUESTION_MARK: "?",
      CHAR_RIGHT_ANGLE_BRACKET: ">",
      CHAR_RIGHT_CURLY_BRACE: "}",
      CHAR_RIGHT_SQUARE_BRACKET: "]",
      CHAR_SEMICOLON: ";",
      CHAR_SINGLE_QUOTE: "'",
      CHAR_SPACE: " ",
      CHAR_TAB: "	",
      CHAR_UNDERSCORE: "_",
      CHAR_VERTICAL_LINE: "|",
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: "﻿",
    };
  });
  var require_parse = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const stringify = require_stringify();
    const MAX_DEPTH = 64;
    /**
     * Constants
     */
    const {
      MAX_LENGTH,
      CHAR_BACKSLASH,
      CHAR_BACKTICK,
      CHAR_COMMA,
      CHAR_DOT,
      CHAR_LEFT_PARENTHESES,
      CHAR_RIGHT_PARENTHESES,
      CHAR_LEFT_CURLY_BRACE,
      CHAR_RIGHT_CURLY_BRACE,
      CHAR_LEFT_SQUARE_BRACKET,
      CHAR_RIGHT_SQUARE_BRACKET,
      CHAR_DOUBLE_QUOTE,
      CHAR_SINGLE_QUOTE,
      CHAR_NO_BREAK_SPACE,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE,
    } = require_constants$1();
    /**
     * parse
     */
    const parse = (input, options = {}) => {
      if (typeof input !== "string")
        throw new _p_TypeErrorCtor("Expected a string");
      const opts = options || {};
      const max =
        typeof opts.maxLength === "number"
          ? _p_MathMin(MAX_LENGTH, opts.maxLength)
          : MAX_LENGTH;
      if (input.length > max)
        throw new _p_SyntaxErrorCtor(
          `Input length (${input.length}), exceeds max characters (${max})`,
        );
      const ast = {
        type: "root",
        input,
        nodes: [],
      };
      const stack = [ast];
      let block = ast;
      let prev = ast;
      let brackets = 0;
      const length = input.length;
      let index = 0;
      let depth = 0;
      let value;
      /**
       * Helpers
       */
      const advance = () => input[index++];
      const push = (node) => {
        if (node.type === "text" && prev.type === "dot") prev.type = "text";
        if (prev && prev.type === "text" && node.type === "text") {
          prev.value += node.value;
          return;
        }
        block.nodes.push(node);
        node.parent = block;
        node.prev = prev;
        prev = node;
        return node;
      };
      push({ type: "bos" });
      while (index < length) {
        block = stack[stack.length - 1];
        value = advance();
        /**
         * Invalid chars
         */
        if (
          value === CHAR_ZERO_WIDTH_NOBREAK_SPACE ||
          value === CHAR_NO_BREAK_SPACE
        )
          continue;
        /**
         * Escaped chars
         */
        if (value === CHAR_BACKSLASH) {
          push({
            type: "text",
            value: (options.keepEscaping ? value : "") + advance(),
          });
          continue;
        }
        /**
         * Right square bracket (literal): ']'
         */
        if (value === CHAR_RIGHT_SQUARE_BRACKET) {
          push({
            type: "text",
            value: "\\" + value,
          });
          continue;
        }
        /**
         * Left square bracket: '['
         */
        if (value === CHAR_LEFT_SQUARE_BRACKET) {
          brackets++;
          let next;
          while (index < length && (next = advance())) {
            value += next;
            if (next === CHAR_LEFT_SQUARE_BRACKET) {
              brackets++;
              continue;
            }
            if (next === CHAR_BACKSLASH) {
              value += advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              brackets--;
              if (brackets === 0) break;
            }
          }
          push({
            type: "text",
            value,
          });
          continue;
        }
        /**
         * Parentheses
         */
        if (value === CHAR_LEFT_PARENTHESES) {
          block = push({
            type: "paren",
            nodes: [],
          });
          stack.push(block);
          push({
            type: "text",
            value,
          });
          continue;
        }
        if (value === CHAR_RIGHT_PARENTHESES) {
          if (block.type !== "paren") {
            push({
              type: "text",
              value,
            });
            continue;
          }
          block = stack.pop();
          push({
            type: "text",
            value,
          });
          block = stack[stack.length - 1];
          continue;
        }
        /**
         * Quotes: '|"|`
         */
        if (
          value === CHAR_DOUBLE_QUOTE ||
          value === CHAR_SINGLE_QUOTE ||
          value === CHAR_BACKTICK
        ) {
          const open = value;
          let next;
          if (options.keepQuotes !== true) value = "";
          while (index < length && (next = advance())) {
            if (next === CHAR_BACKSLASH) {
              value += next + advance();
              continue;
            }
            if (next === open) {
              if (options.keepQuotes === true) value += next;
              break;
            }
            value += next;
          }
          push({
            type: "text",
            value,
          });
          continue;
        }
        /**
         * Left curly brace: '{'
         */
        if (value === CHAR_LEFT_CURLY_BRACE) {
          depth++;
          if (depth > MAX_DEPTH)
            throw new _p_SyntaxErrorCtor(
              `Input nesting depth exceeds limit. Where: braces parser. Saw ${depth}; wanted at most ${MAX_DEPTH}. Fix: reduce nested brace groups.`,
            );
          block = push({
            type: "brace",
            open: true,
            close: false,
            dollar:
              (prev.value && prev.value.slice(-1) === "$") ||
              block.dollar === true,
            depth,
            commas: 0,
            ranges: 0,
            nodes: [],
          });
          stack.push(block);
          push({
            type: "open",
            value,
          });
          continue;
        }
        /**
         * Right curly brace: '}'
         */
        if (value === CHAR_RIGHT_CURLY_BRACE) {
          if (block.type !== "brace") {
            push({
              type: "text",
              value,
            });
            continue;
          }
          const type = "close";
          block = stack.pop();
          block.close = true;
          push({
            type,
            value,
          });
          depth--;
          block = stack[stack.length - 1];
          continue;
        }
        /**
         * Comma: ','
         */
        if (value === CHAR_COMMA && depth > 0) {
          if (block.ranges > 0) {
            block.ranges = 0;
            const open = block.nodes.shift();
            block.nodes = [
              open,
              {
                type: "text",
                value: stringify(block),
              },
            ];
          }
          push({
            type: "comma",
            value,
          });
          block.commas++;
          continue;
        }
        /**
         * Dot: '.'
         */
        if (value === CHAR_DOT && depth > 0 && block.commas === 0) {
          const siblings = block.nodes;
          if (depth === 0 || siblings.length === 0) {
            push({
              type: "text",
              value,
            });
            continue;
          }
          if (prev.type === "dot") {
            block.range = [];
            prev.value += value;
            prev.type = "range";
            if (block.nodes.length !== 3 && block.nodes.length !== 5) {
              block.invalid = true;
              block.ranges = 0;
              prev.type = "text";
              continue;
            }
            block.ranges++;
            block.args = [];
            continue;
          }
          if (prev.type === "range") {
            siblings.pop();
            const before = siblings[siblings.length - 1];
            before.value += prev.value + value;
            prev = before;
            block.ranges--;
            continue;
          }
          push({
            type: "dot",
            value,
          });
          continue;
        }
        /**
         * Text
         */
        push({
          type: "text",
          value,
        });
      }
      do {
        block = stack.pop();
        if (block.type !== "root") {
          block.nodes.forEach((node) => {
            if (!node.nodes) {
              if (node.type === "open") node.isOpen = true;
              if (node.type === "close") node.isClose = true;
              if (!node.nodes) node.type = "text";
              node.invalid = true;
            }
          });
          const parent = stack[stack.length - 1];
          const index = parent.nodes.indexOf(block);
          parent.nodes.splice(index, 1, ...block.nodes);
        }
      } while (stack.length > 0);
      push({ type: "eos" });
      return ast;
    };
    module.exports = parse;
  });
  var require_braces = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const stringify = require_stringify();
    const compile = require_compile();
    const expand = require_expand();
    const parse = require_parse();
    /**
     * Expand the given pattern or create a regex-compatible string.
     *
     * ```js
     * const braces = require('braces');
     * console.log(braces('{a,b,c}', { compile: true })); //=> ['(a|b|c)']
     * console.log(braces('{a,b,c}')); //=> ['a', 'b', 'c']
     * ```
     * @param {String} `str`
     * @param {Object} `options`
     * @return {String}
     * @api public
     */
    const braces = (input, options = {}) => {
      let output = [];
      if (_p_ArrayIsArray(input))
        for (const pattern of input) {
          const result = braces.create(pattern, options);
          if (_p_ArrayIsArray(result)) output.push(...result);
          else output.push(result);
        }
      else output = [].concat(braces.create(input, options));
      if (options && options.expand === true && options.nodupes === true)
        output = [...new _p_SetCtor(output)];
      return output;
    };
    /**
     * Parse the given `str` with the given `options`.
     *
     * ```js
     * // braces.parse(pattern, [, options]);
     * const ast = braces.parse('a/{b,c}/d');
     * console.log(ast);
     * ```
     * @param {String} pattern Brace pattern to parse
     * @param {Object} options
     * @return {Object} Returns an AST
     * @api public
     */
    braces.parse = (input, options = {}) => parse(input, options);
    /**
     * Creates a braces string from an AST, or an AST node.
     *
     * ```js
     * const braces = require('braces');
     * let ast = braces.parse('foo/{a,b}/bar');
     * console.log(stringify(ast.nodes[2])); //=> '{a,b}'
     * ```
     * @param {String} `input` Brace pattern or AST.
     * @param {Object} `options`
     * @return {Array} Returns an array of expanded values.
     * @api public
     */
    braces.stringify = (input, options = {}) => {
      if (typeof input === "string")
        return stringify(braces.parse(input, options), options);
      return stringify(input, options);
    };
    /**
     * Compiles a brace pattern into a regex-compatible, optimized string.
     * This method is called by the main [braces](#braces) function by default.
     *
     * ```js
     * const braces = require('braces');
     * console.log(braces.compile('a/{b,c}/d'));
     * //=> ['a/(b|c)/d']
     * ```
     * @param {String} `input` Brace pattern or AST.
     * @param {Object} `options`
     * @return {Array} Returns an array of expanded values.
     * @api public
     */
    braces.compile = (input, options = {}) => {
      if (typeof input === "string") input = braces.parse(input, options);
      return compile(input, options);
    };
    /**
     * Expands a brace pattern into an array. This method is called by the
     * main [braces](#braces) function when `options.expand` is true. Before
     * using this method it's recommended that you read the [performance notes](#performance))
     * and advantages of using [.compile](#compile) instead.
     *
     * ```js
     * const braces = require('braces');
     * console.log(braces.expand('a/{b,c}/d'));
     * //=> ['a/b/d', 'a/c/d'];
     * ```
     * @param {String} `pattern` Brace pattern
     * @param {Object} `options`
     * @return {Array} Returns an array of expanded values.
     * @api public
     */
    braces.expand = (input, options = {}) => {
      if (typeof input === "string") input = braces.parse(input, options);
      let result = expand(input, options);
      if (options.noempty === true) result = result.filter(Boolean);
      if (options.nodupes === true) result = [...new _p_SetCtor(result)];
      return result;
    };
    /**
     * Processes a brace pattern and returns either an expanded array
     * (if `options.expand` is true), a highly optimized regex-compatible string.
     * This method is called by the main [braces](#braces) function.
     *
     * ```js
     * const braces = require('braces');
     * console.log(braces.create('user-{200..300}/project-{a,b,c}-{1..10}'))
     * //=> 'user-(20[0-9]|2[1-9][0-9]|300)/project-(a|b|c)-([1-9]|10)'
     * ```
     * @param {String} `pattern` Brace pattern
     * @param {Object} `options`
     * @return {Array} Returns an array of expanded values.
     * @api public
     */
    braces.create = (input, options = {}) => {
      if (input === "" || input.length < 3) return [input];
      return options.expand !== true
        ? braces.compile(input, options)
        : braces.expand(input, options);
    };
    /**
     * Expose "braces"
     */
    module.exports = braces;
  });
  var require_micromatch = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const util = __require("util");
    const braces = require_braces();
    const picomatch = require_picomatch();
    const utils = require_utils$3();
    const isEmptyString = (v) => v === "" || v === "./";
    const hasBraces = (v) => {
      const index = v.indexOf("{");
      return index > -1 && v.indexOf("}", index) > -1;
    };
    /**
     * Returns an array of strings that match one or more glob patterns.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm(list, patterns[, options]);
     *
     * console.log(mm(['a.js', 'a.txt'], ['*.js']));
     * //=> [ 'a.js' ]
     * ```
     * @param {String|Array<string>} `list` List of strings to match.
     * @param {String|Array<string>} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `options` See available [options](#options)
     * @return {Array} Returns an array of matches
     * @summary false
     * @api public
     */
    const micromatch = (list, patterns, options) => {
      patterns = [].concat(patterns);
      list = [].concat(list);
      let omit = /* @__PURE__ */ new _p_SetCtor();
      let keep = /* @__PURE__ */ new _p_SetCtor();
      let items = /* @__PURE__ */ new _p_SetCtor();
      let negatives = 0;
      let onResult = (state) => {
        items.add(state.output);
        if (options && options.onResult) options.onResult(state);
      };
      for (let i = 0; i < patterns.length; i++) {
        let isMatch = picomatch(
          String(patterns[i]),
          {
            ...options,
            onResult,
          },
          true,
        );
        let negated = isMatch.state.negated || isMatch.state.negatedExtglob;
        if (negated) negatives++;
        for (let item of list) {
          let matched = isMatch(item, true);
          if (!(negated ? !matched.isMatch : matched.isMatch)) continue;
          if (negated) omit.add(matched.output);
          else {
            omit.delete(matched.output);
            keep.add(matched.output);
          }
        }
      }
      let matches = (
        negatives === patterns.length ? [...items] : [...keep]
      ).filter((item) => !omit.has(item));
      if (options && matches.length === 0) {
        if (options.failglob === true)
          throw new _p_ErrorCtor(
            `No matches found for "${patterns.join(", ")}"`,
          );
        if (options.nonull === true || options.nullglob === true)
          return options.unescape
            ? patterns.map((p) => p.replace(/\\/g, ""))
            : patterns;
      }
      return matches;
    };
    /**
     * Backwards compatibility
     */
    micromatch.match = micromatch;
    /**
     * Returns a matcher function from the given glob `pattern` and `options`.
     * The returned function takes a string to match as its only argument and returns
     * true if the string is a match.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.matcher(pattern[, options]);
     *
     * const isMatch = mm.matcher('*.!(*a)');
     * console.log(isMatch('a.a')); //=> false
     * console.log(isMatch('a.b')); //=> true
     * ```
     * @param {String} `pattern` Glob pattern
     * @param {Object} `options`
     * @return {Function} Returns a matcher function.
     * @api public
     */
    micromatch.matcher = (pattern, options) => picomatch(pattern, options);
    /**
     * Returns true if **any** of the given glob `patterns` match the specified `string`.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.isMatch(string, patterns[, options]);
     *
     * console.log(mm.isMatch('a.a', ['b.*', '*.a'])); //=> true
     * console.log(mm.isMatch('a.a', 'b.*')); //=> false
     * ```
     * @param {String} `str` The string to test.
     * @param {String|Array} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `[options]` See available [options](#options).
     * @return {Boolean} Returns true if any patterns match `str`
     * @api public
     */
    micromatch.isMatch = (str, patterns, options) =>
      picomatch(patterns, options)(str);
    /**
     * Backwards compatibility
     */
    micromatch.any = micromatch.isMatch;
    /**
     * Returns a list of strings that _**do not match any**_ of the given `patterns`.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.not(list, patterns[, options]);
     *
     * console.log(mm.not(['a.a', 'b.b', 'c.c'], '*.a'));
     * //=> ['b.b', 'c.c']
     * ```
     * @param {Array} `list` Array of strings to match.
     * @param {String|Array} `patterns` One or more glob pattern to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Array} Returns an array of strings that **do not match** the given patterns.
     * @api public
     */
    micromatch.not = (list, patterns, options = {}) => {
      patterns = [].concat(patterns).map(String);
      let result = /* @__PURE__ */ new _p_SetCtor();
      let items = [];
      let onResult = (state) => {
        if (options.onResult) options.onResult(state);
        items.push(state.output);
      };
      let matches = new _p_SetCtor(
        micromatch(list, patterns, {
          ...options,
          onResult,
        }),
      );
      for (let item of items) if (!matches.has(item)) result.add(item);
      return [...result];
    };
    /**
     * Returns true if the given `string` contains the given pattern. Similar
     * to [.isMatch](#isMatch) but the pattern can match any part of the string.
     *
     * ```js
     * var mm = require('micromatch');
     * // mm.contains(string, pattern[, options]);
     *
     * console.log(mm.contains('aa/bb/cc', '*b'));
     * //=> true
     * console.log(mm.contains('aa/bb/cc', '*d'));
     * //=> false
     * ```
     * @param {String} `str` The string to match.
     * @param {String|Array} `patterns` Glob pattern to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Boolean} Returns true if any of the patterns matches any part of `str`.
     * @api public
     */
    micromatch.contains = (str, pattern, options) => {
      if (typeof str !== "string")
        throw new _p_TypeErrorCtor(`Expected a string: "${util.inspect(str)}"`);
      if (_p_ArrayIsArray(pattern))
        return pattern.some((p) => micromatch.contains(str, p, options));
      if (typeof pattern === "string") {
        if (isEmptyString(str) || isEmptyString(pattern)) return false;
        if (
          str.includes(pattern) ||
          (_p_StringPrototypeStartsWith(str, "./") &&
            str.slice(2).includes(pattern))
        )
          return true;
      }
      return micromatch.isMatch(str, pattern, {
        ...options,
        contains: true,
      });
    };
    /**
     * Filter the keys of the given object with the given `glob` pattern
     * and `options`. Does not attempt to match nested keys. If you need this feature,
     * use [glob-object][] instead.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.matchKeys(object, patterns[, options]);
     *
     * const obj = { aa: 'a', ab: 'b', ac: 'c' };
     * console.log(mm.matchKeys(obj, '*b'));
     * //=> { ab: 'b' }
     * ```
     * @param {Object} `object` The object with keys to filter.
     * @param {String|Array} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Object} Returns an object with only keys that match the given patterns.
     * @api public
     */
    micromatch.matchKeys = (obj, patterns, options) => {
      if (!utils.isObject(obj))
        throw new _p_TypeErrorCtor(
          "Expected the first argument to be an object",
        );
      let keys = micromatch(_p_ObjectKeys(obj), patterns, options);
      let res = {};
      for (let key of keys) res[key] = obj[key];
      return res;
    };
    /**
     * Returns true if some of the strings in the given `list` match any of the given glob `patterns`.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.some(list, patterns[, options]);
     *
     * console.log(mm.some(['foo.js', 'bar.js'], ['*.js', '!foo.js']));
     * // true
     * console.log(mm.some(['foo.js'], ['*.js', '!foo.js']));
     * // false
     * ```
     * @param {String|Array} `list` The string or array of strings to test. Returns as soon as the first match is found.
     * @param {String|Array} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Boolean} Returns true if any `patterns` matches any of the strings in `list`
     * @api public
     */
    micromatch.some = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch(String(pattern), options);
        if (items.some((item) => isMatch(item))) return true;
      }
      return false;
    };
    /**
     * Returns true if every string in the given `list` matches
     * any of the given glob `patterns`.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.every(list, patterns[, options]);
     *
     * console.log(mm.every('foo.js', ['foo.js']));
     * // true
     * console.log(mm.every(['foo.js', 'bar.js'], ['*.js']));
     * // true
     * console.log(mm.every(['foo.js', 'bar.js'], ['*.js', '!foo.js']));
     * // false
     * console.log(mm.every(['foo.js'], ['*.js', '!foo.js']));
     * // false
     * ```
     * @param {String|Array} `list` The string or array of strings to test.
     * @param {String|Array} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Boolean} Returns true if all `patterns` matches all of the strings in `list`
     * @api public
     */
    micromatch.every = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch(String(pattern), options);
        if (!items.every((item) => isMatch(item))) return false;
      }
      return true;
    };
    /**
     * Returns true if **all** of the given `patterns` match
     * the specified string.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.all(string, patterns[, options]);
     *
     * console.log(mm.all('foo.js', ['foo.js']));
     * // true
     *
     * console.log(mm.all('foo.js', ['*.js', '!foo.js']));
     * // false
     *
     * console.log(mm.all('foo.js', ['*.js', 'foo.js']));
     * // true
     *
     * console.log(mm.all('foo.js', ['*.js', 'f*', '*o*', '*o.js']));
     * // true
     * ```
     * @param {String|Array} `str` The string to test.
     * @param {String|Array} `patterns` One or more glob patterns to use for matching.
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Boolean} Returns true if any patterns match `str`
     * @api public
     */
    micromatch.all = (str, patterns, options) => {
      if (typeof str !== "string")
        throw new _p_TypeErrorCtor(`Expected a string: "${util.inspect(str)}"`);
      return [].concat(patterns).every((p) => picomatch(p, options)(str));
    };
    /**
     * Returns an array of matches captured by `pattern` in `string, or `null` if the pattern did not match.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.capture(pattern, string[, options]);
     *
     * console.log(mm.capture('test/*.js', 'test/foo.js'));
     * //=> ['foo']
     * console.log(mm.capture('test/*.js', 'foo/bar.css'));
     * //=> null
     * ```
     * @param {String} `glob` Glob pattern to use for matching.
     * @param {String} `input` String to match
     * @param {Object} `options` See available [options](#options) for changing how matches are performed
     * @return {Array|null} Returns an array of captures if the input matches the glob pattern, otherwise `null`.
     * @api public
     */
    micromatch.capture = (glob, input, options) => {
      let posix = utils.isWindows(options);
      let match = picomatch
        .makeRe(String(glob), {
          ...options,
          capture: true,
        })
        .exec(posix ? utils.toPosixSlashes(input) : input);
      if (match) return match.slice(1).map((v) => (v === void 0 ? "" : v));
    };
    /**
     * Create a regular expression from the given glob `pattern`.
     *
     * ```js
     * const mm = require('micromatch');
     * // mm.makeRe(pattern[, options]);
     *
     * console.log(mm.makeRe('*.js'));
     * //=> /^(?:(\.[\\\/])?(?!\.)(?=.)[^\/]*?\.js)$/
     * ```
     * @param {String} `pattern` A glob pattern to convert to regex.
     * @param {Object} `options`
     * @return {RegExp} Returns a regex created from the given pattern.
     * @api public
     */
    micromatch.makeRe = (...args) => picomatch.makeRe(...args);
    /**
     * Scan a glob pattern to separate the pattern into segments. Used
     * by the [split](#split) method.
     *
     * ```js
     * const mm = require('micromatch');
     * const state = mm.scan(pattern[, options]);
     * ```
     * @param {String} `pattern`
     * @param {Object} `options`
     * @return {Object} Returns an object with
     * @api public
     */
    micromatch.scan = (...args) => picomatch.scan(...args);
    /**
     * Parse a glob pattern to create the source string for a regular
     * expression.
     *
     * ```js
     * const mm = require('micromatch');
     * const state = mm.parse(pattern[, options]);
     * ```
     * @param {String} `glob`
     * @param {Object} `options`
     * @return {Object} Returns an object with useful properties and output to be used as regex source string.
     * @api public
     */
    micromatch.parse = (patterns, options) => {
      let res = [];
      for (let pattern of [].concat(patterns || []))
        for (let str of braces(String(pattern), options))
          res.push(picomatch.parse(str, options));
      return res;
    };
    /**
     * Process the given brace `pattern`.
     *
     * ```js
     * const { braces } = require('micromatch');
     * console.log(braces('foo/{a,b,c}/bar'));
     * //=> [ 'foo/(a|b|c)/bar' ]
     *
     * console.log(braces('foo/{a,b,c}/bar', { expand: true }));
     * //=> [ 'foo/a/bar', 'foo/b/bar', 'foo/c/bar' ]
     * ```
     * @param {String} `pattern` String with brace pattern to process.
     * @param {Object} `options` Any [options](#options) to change how expansion is performed. See the [braces][] library for all available options.
     * @return {Array}
     * @api public
     */
    micromatch.braces = (pattern, options) => {
      if (typeof pattern !== "string")
        throw new _p_TypeErrorCtor("Expected a string");
      if ((options && options.nobrace === true) || !hasBraces(pattern))
        return [pattern];
      return braces(pattern, options);
    };
    /**
     * Expand braces
     */
    micromatch.braceExpand = (pattern, options) => {
      if (typeof pattern !== "string")
        throw new _p_TypeErrorCtor("Expected a string");
      return micromatch.braces(pattern, {
        ...options,
        expand: true,
      });
    };
    /**
     * Expose micromatch
     */
    micromatch.hasBraces = hasBraces;
    module.exports = micromatch;
  });
  var require_pattern = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.isAbsolute =
      exports.partitionAbsoluteAndRelative =
      exports.removeDuplicateSlashes =
      exports.matchAny =
      exports.convertPatternsToRe =
      exports.makeRe =
      exports.getPatternParts =
      exports.expandBraceExpansion =
      exports.expandPatternsWithBraceExpansion =
      exports.isAffectDepthOfReadingPattern =
      exports.endsWithSlashGlobStar =
      exports.hasGlobStar =
      exports.getBaseDirectory =
      exports.isPatternRelatedToParentDirectory =
      exports.getPatternsOutsideCurrentDirectory =
      exports.getPatternsInsideCurrentDirectory =
      exports.getPositivePatterns =
      exports.getNegativePatterns =
      exports.isPositivePattern =
      exports.isNegativePattern =
      exports.convertToNegativePattern =
      exports.convertToPositivePattern =
      exports.isDynamicPattern =
      exports.isStaticPattern =
        void 0;
    const path$10 = __require("path");
    const globParent = require_glob_parent();
    const micromatch = require_micromatch();
    const GLOBSTAR = "**";
    const ESCAPE_SYMBOL = "\\";
    const COMMON_GLOB_SYMBOLS_RE = /[*?]|^!/;
    const REGEX_CHARACTER_CLASS_SYMBOLS_RE = /\[[^[]*]/;
    const REGEX_GROUP_SYMBOLS_RE = /(?:^|[^!*+?@])\([^(]*\|[^|]*\)/;
    const GLOB_EXTENSION_SYMBOLS_RE = /[!*+?@]\([^(]*\)/;
    const BRACE_EXPANSION_SEPARATORS_RE = /,|\.\./;
    /**
     * Matches a sequence of two or more consecutive slashes, excluding the first two slashes at the beginning of the string.
     * The latter is due to the presence of the device path at the beginning of the UNC path.
     */
    const DOUBLE_SLASH_RE = /(?!^)\/{2,}/g;
    function isStaticPattern(pattern, options = {}) {
      return !isDynamicPattern(pattern, options);
    }
    exports.isStaticPattern = isStaticPattern;
    function isDynamicPattern(pattern, options = {}) {
      /**
       * A special case with an empty string is necessary for matching patterns that start with a forward slash.
       * An empty string cannot be a dynamic pattern.
       * For example, the pattern `/lib/*` will be spread into parts: '', 'lib', '*'.
       */
      if (pattern === "") return false;
      /**
       * When the `caseSensitiveMatch` option is disabled, all patterns must be marked as dynamic, because we cannot check
       * filepath directly (without read directory).
       */
      if (
        options.caseSensitiveMatch === false ||
        pattern.includes(ESCAPE_SYMBOL)
      )
        return true;
      if (
        COMMON_GLOB_SYMBOLS_RE.test(pattern) ||
        REGEX_CHARACTER_CLASS_SYMBOLS_RE.test(pattern) ||
        REGEX_GROUP_SYMBOLS_RE.test(pattern)
      )
        return true;
      if (options.extglob !== false && GLOB_EXTENSION_SYMBOLS_RE.test(pattern))
        return true;
      if (options.braceExpansion !== false && hasBraceExpansion(pattern))
        return true;
      return false;
    }
    exports.isDynamicPattern = isDynamicPattern;
    function hasBraceExpansion(pattern) {
      const openingBraceIndex = pattern.indexOf("{");
      if (openingBraceIndex === -1) return false;
      const closingBraceIndex = pattern.indexOf("}", openingBraceIndex + 1);
      if (closingBraceIndex === -1) return false;
      const braceContent = pattern.slice(openingBraceIndex, closingBraceIndex);
      return BRACE_EXPANSION_SEPARATORS_RE.test(braceContent);
    }
    function convertToPositivePattern(pattern) {
      return isNegativePattern(pattern) ? pattern.slice(1) : pattern;
    }
    exports.convertToPositivePattern = convertToPositivePattern;
    function convertToNegativePattern(pattern) {
      return "!" + pattern;
    }
    exports.convertToNegativePattern = convertToNegativePattern;
    function isNegativePattern(pattern) {
      return _p_StringPrototypeStartsWith(pattern, "!") && pattern[1] !== "(";
    }
    exports.isNegativePattern = isNegativePattern;
    function isPositivePattern(pattern) {
      return !isNegativePattern(pattern);
    }
    exports.isPositivePattern = isPositivePattern;
    function getNegativePatterns(patterns) {
      return patterns.filter(isNegativePattern);
    }
    exports.getNegativePatterns = getNegativePatterns;
    function getPositivePatterns(patterns) {
      return patterns.filter(isPositivePattern);
    }
    exports.getPositivePatterns = getPositivePatterns;
    /**
     * Returns patterns that can be applied inside the current directory.
     *
     * @example
     * // ['./*', '*', 'a/*']
     * getPatternsInsideCurrentDirectory(['./*', '*', 'a/*', '../*', './../*'])
     */
    function getPatternsInsideCurrentDirectory(patterns) {
      return patterns.filter(
        (pattern) => !isPatternRelatedToParentDirectory(pattern),
      );
    }
    exports.getPatternsInsideCurrentDirectory =
      getPatternsInsideCurrentDirectory;
    /**
     * Returns patterns to be expanded relative to (outside) the current directory.
     *
     * @example
     * // ['../*', './../*']
     * getPatternsInsideCurrentDirectory(['./*', '*', 'a/*', '../*', './../*'])
     */
    function getPatternsOutsideCurrentDirectory(patterns) {
      return patterns.filter(isPatternRelatedToParentDirectory);
    }
    exports.getPatternsOutsideCurrentDirectory =
      getPatternsOutsideCurrentDirectory;
    function isPatternRelatedToParentDirectory(pattern) {
      return (
        _p_StringPrototypeStartsWith(pattern, "..") ||
        _p_StringPrototypeStartsWith(pattern, "./..")
      );
    }
    exports.isPatternRelatedToParentDirectory =
      isPatternRelatedToParentDirectory;
    function getBaseDirectory(pattern) {
      return globParent(pattern, { flipBackslashes: false });
    }
    exports.getBaseDirectory = getBaseDirectory;
    function hasGlobStar(pattern) {
      return pattern.includes(GLOBSTAR);
    }
    exports.hasGlobStar = hasGlobStar;
    function endsWithSlashGlobStar(pattern) {
      return _p_StringPrototypeEndsWith(pattern, "/**");
    }
    exports.endsWithSlashGlobStar = endsWithSlashGlobStar;
    function isAffectDepthOfReadingPattern(pattern) {
      const basename = path$10.basename(pattern);
      return endsWithSlashGlobStar(pattern) || isStaticPattern(basename);
    }
    exports.isAffectDepthOfReadingPattern = isAffectDepthOfReadingPattern;
    function expandPatternsWithBraceExpansion(patterns) {
      return patterns.reduce((collection, pattern) => {
        return collection.concat(expandBraceExpansion(pattern));
      }, []);
    }
    exports.expandPatternsWithBraceExpansion = expandPatternsWithBraceExpansion;
    function expandBraceExpansion(pattern) {
      const patterns = micromatch.braces(pattern, {
        expand: true,
        nodupes: true,
        keepEscaping: true,
      });
      /**
       * Sort the patterns by length so that the same depth patterns are processed side by side.
       * `a/{b,}/{c,}/*` – `['a///*', 'a/b//*', 'a//c/*', 'a/b/c/*']`
       */
      patterns.sort((a, b) => a.length - b.length);
      /**
       * Micromatch can return an empty string in the case of patterns like `{a,}`.
       */
      return patterns.filter((pattern) => pattern !== "");
    }
    exports.expandBraceExpansion = expandBraceExpansion;
    function getPatternParts(pattern, options) {
      let { parts } = micromatch.scan(
        pattern,
        _p_ObjectAssign(_p_ObjectAssign({}, options), { parts: true }),
      );
      /**
       * The scan method returns an empty array in some cases.
       * See micromatch/picomatch#58 for more details.
       */
      if (parts.length === 0) parts = [pattern];
      /**
       * The scan method does not return an empty part for the pattern with a forward slash.
       * This is another part of micromatch/picomatch#58.
       */
      if (parts[0].startsWith("/")) {
        parts[0] = parts[0].slice(1);
        _p_ArrayPrototypeUnshift(parts, "");
      }
      return parts;
    }
    exports.getPatternParts = getPatternParts;
    function makeRe(pattern, options) {
      return micromatch.makeRe(pattern, options);
    }
    exports.makeRe = makeRe;
    function convertPatternsToRe(patterns, options) {
      return patterns.map((pattern) => makeRe(pattern, options));
    }
    exports.convertPatternsToRe = convertPatternsToRe;
    function matchAny(entry, patternsRe) {
      return patternsRe.some((patternRe) => patternRe.test(entry));
    }
    exports.matchAny = matchAny;
    /**
     * This package only works with forward slashes as a path separator.
     * Because of this, we cannot use the standard `path.normalize` method, because on Windows platform it will use of backslashes.
     */
    function removeDuplicateSlashes(pattern) {
      return pattern.replace(DOUBLE_SLASH_RE, "/");
    }
    exports.removeDuplicateSlashes = removeDuplicateSlashes;
    function partitionAbsoluteAndRelative(patterns) {
      const absolute = [];
      const relative = [];
      for (const pattern of patterns)
        if (isAbsolute(pattern)) absolute.push(pattern);
        else relative.push(pattern);
      return [absolute, relative];
    }
    exports.partitionAbsoluteAndRelative = partitionAbsoluteAndRelative;
    function isAbsolute(pattern) {
      return path$10.isAbsolute(pattern);
    }
    exports.isAbsolute = isAbsolute;
  });
  var require_merge2 = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const PassThrough = __require("stream").PassThrough;
    const slice = Array.prototype.slice;
    module.exports = merge2;
    function merge2() {
      const streamsQueue = [];
      const args = slice.call(arguments);
      let merging = false;
      let options = args[args.length - 1];
      if (options && !_p_ArrayIsArray(options) && options.pipe == null)
        args.pop();
      else options = {};
      const doEnd = options.end !== false;
      const doPipeError = options.pipeError === true;
      if (options.objectMode == null) options.objectMode = true;
      if (options.highWaterMark == null) options.highWaterMark = 65536;
      const mergedStream = PassThrough(options);
      function addStream() {
        for (let i = 0, len = arguments.length; i < len; i++)
          streamsQueue.push(pauseStreams(arguments[i], options));
        mergeStream();
        return this;
      }
      function mergeStream() {
        if (merging) return;
        merging = true;
        let streams = streamsQueue.shift();
        if (!streams) {
          _p_processNextTick(endStream);
          return;
        }
        if (!_p_ArrayIsArray(streams)) streams = [streams];
        let pipesCount = streams.length + 1;
        function next() {
          if (--pipesCount > 0) return;
          merging = false;
          mergeStream();
        }
        function pipe(stream) {
          function onend() {
            stream.removeListener("merge2UnpipeEnd", onend);
            stream.removeListener("end", onend);
            if (doPipeError) stream.removeListener("error", onerror);
            next();
          }
          function onerror(err) {
            mergedStream.emit("error", err);
          }
          if (stream._readableState.endEmitted) return next();
          stream.on("merge2UnpipeEnd", onend);
          stream.on("end", onend);
          if (doPipeError) stream.on("error", onerror);
          stream.pipe(mergedStream, { end: false });
          stream.resume();
        }
        for (let i = 0; i < streams.length; i++) pipe(streams[i]);
        next();
      }
      function endStream() {
        merging = false;
        mergedStream.emit("queueDrain");
        if (doEnd) mergedStream.end();
      }
      mergedStream.setMaxListeners(0);
      mergedStream.add = addStream;
      mergedStream.on("unpipe", function (stream) {
        stream.emit("merge2UnpipeEnd");
      });
      if (args.length) addStream.apply(null, args);
      return mergedStream;
    }
    function pauseStreams(streams, options) {
      if (!_p_ArrayIsArray(streams)) {
        if (!streams._readableState && streams.pipe)
          streams = streams.pipe(PassThrough(options));
        if (!streams._readableState || !streams.pause || !streams.pipe)
          throw new _p_ErrorCtor("Only readable stream can be merged.");
        streams.pause();
      } else
        for (let i = 0, len = streams.length; i < len; i++)
          streams[i] = pauseStreams(streams[i], options);
      return streams;
    }
  });
  var require_stream$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.merge = void 0;
    const merge2 = require_merge2();
    function merge(streams) {
      const mergedStream = merge2(streams);
      streams.forEach((stream) => {
        stream.once("error", (error) => mergedStream.emit("error", error));
      });
      mergedStream.once("close", () => propagateCloseEventToSources(streams));
      mergedStream.once("end", () => propagateCloseEventToSources(streams));
      return mergedStream;
    }
    exports.merge = merge;
    function propagateCloseEventToSources(streams) {
      streams.forEach((stream) => stream.emit("close"));
    }
  });
  var require_string = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.isEmpty = exports.isString = void 0;
    function isString(input) {
      return typeof input === "string";
    }
    exports.isString = isString;
    function isEmpty(input) {
      return input === "";
    }
    exports.isEmpty = isEmpty;
  });
  var require_utils$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.string =
      exports.stream =
      exports.pattern =
      exports.path =
      exports.fs =
      exports.errno =
      exports.array =
        void 0;
    exports.array = require_array();
    exports.errno = require_errno();
    exports.fs = require_fs$3();
    exports.path = require_path();
    exports.pattern = require_pattern();
    exports.stream = require_stream$3();
    exports.string = require_string();
  });
  var require_tasks = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.convertPatternGroupToTask =
      exports.convertPatternGroupsToTasks =
      exports.groupPatternsByBaseDirectory =
      exports.getNegativePatternsAsPositive =
      exports.getPositivePatterns =
      exports.convertPatternsToTasks =
      exports.generate =
        void 0;
    const utils = require_utils$1();
    function generate(input, settings) {
      const patterns = processPatterns(input, settings);
      const ignore = processPatterns(settings.ignore, settings);
      const positivePatterns = getPositivePatterns(patterns);
      const negativePatterns = getNegativePatternsAsPositive(patterns, ignore);
      const staticPatterns = positivePatterns.filter((pattern) =>
        utils.pattern.isStaticPattern(pattern, settings),
      );
      const dynamicPatterns = positivePatterns.filter((pattern) =>
        utils.pattern.isDynamicPattern(pattern, settings),
      );
      const staticTasks = convertPatternsToTasks(
        staticPatterns,
        negativePatterns,
        false,
      );
      const dynamicTasks = convertPatternsToTasks(
        dynamicPatterns,
        negativePatterns,
        true,
      );
      return staticTasks.concat(dynamicTasks);
    }
    exports.generate = generate;
    function processPatterns(input, settings) {
      let patterns = input;
      /**
       * The original pattern like `{,*,**,a/*}` can lead to problems checking the depth when matching entry
       * and some problems with the micromatch package (see fast-glob issues: #365, #394).
       *
       * To solve this problem, we expand all patterns containing brace expansion. This can lead to a slight slowdown
       * in matching in the case of a large set of patterns after expansion.
       */
      if (settings.braceExpansion)
        patterns = utils.pattern.expandPatternsWithBraceExpansion(patterns);
      /**
       * If the `baseNameMatch` option is enabled, we must add globstar to patterns, so that they can be used
       * at any nesting level.
       *
       * We do this here, because otherwise we have to complicate the filtering logic. For example, we need to change
       * the pattern in the filter before creating a regular expression. There is no need to change the patterns
       * in the application. Only on the input.
       */
      if (settings.baseNameMatch)
        patterns = patterns.map((pattern) =>
          pattern.includes("/") ? pattern : `**/${pattern}`,
        );
      /**
       * This method also removes duplicate slashes that may have been in the pattern or formed as a result of expansion.
       */
      return patterns.map((pattern) =>
        utils.pattern.removeDuplicateSlashes(pattern),
      );
    }
    /**
     * Returns tasks grouped by basic pattern directories.
     *
     * Patterns that can be found inside (`./`) and outside (`../`) the current directory are handled separately.
     * This is necessary because directory traversal starts at the base directory and goes deeper.
     */
    function convertPatternsToTasks(positive, negative, dynamic) {
      const tasks = [];
      const patternsOutsideCurrentDirectory =
        utils.pattern.getPatternsOutsideCurrentDirectory(positive);
      const patternsInsideCurrentDirectory =
        utils.pattern.getPatternsInsideCurrentDirectory(positive);
      const outsideCurrentDirectoryGroup = groupPatternsByBaseDirectory(
        patternsOutsideCurrentDirectory,
      );
      const insideCurrentDirectoryGroup = groupPatternsByBaseDirectory(
        patternsInsideCurrentDirectory,
      );
      tasks.push(
        ...convertPatternGroupsToTasks(
          outsideCurrentDirectoryGroup,
          negative,
          dynamic,
        ),
      );
      if ("." in insideCurrentDirectoryGroup)
        tasks.push(
          convertPatternGroupToTask(
            ".",
            patternsInsideCurrentDirectory,
            negative,
            dynamic,
          ),
        );
      else
        tasks.push(
          ...convertPatternGroupsToTasks(
            insideCurrentDirectoryGroup,
            negative,
            dynamic,
          ),
        );
      return tasks;
    }
    exports.convertPatternsToTasks = convertPatternsToTasks;
    function getPositivePatterns(patterns) {
      return utils.pattern.getPositivePatterns(patterns);
    }
    exports.getPositivePatterns = getPositivePatterns;
    function getNegativePatternsAsPositive(patterns, ignore) {
      return utils.pattern
        .getNegativePatterns(patterns)
        .concat(ignore)
        .map(utils.pattern.convertToPositivePattern);
    }
    exports.getNegativePatternsAsPositive = getNegativePatternsAsPositive;
    function groupPatternsByBaseDirectory(patterns) {
      return patterns.reduce((collection, pattern) => {
        const base = utils.pattern.getBaseDirectory(pattern);
        if (base in collection) collection[base].push(pattern);
        else collection[base] = [pattern];
        return collection;
      }, {});
    }
    exports.groupPatternsByBaseDirectory = groupPatternsByBaseDirectory;
    function convertPatternGroupsToTasks(positive, negative, dynamic) {
      return _p_ObjectKeys(positive).map((base) => {
        return convertPatternGroupToTask(
          base,
          positive[base],
          negative,
          dynamic,
        );
      });
    }
    exports.convertPatternGroupsToTasks = convertPatternGroupsToTasks;
    function convertPatternGroupToTask(base, positive, negative, dynamic) {
      return {
        dynamic,
        positive,
        negative,
        base,
        patterns: [].concat(
          positive,
          negative.map(utils.pattern.convertToNegativePattern),
        ),
      };
    }
    exports.convertPatternGroupToTask = convertPatternGroupToTask;
  });
  var require_async$5 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.read = void 0;
    function read(path, settings, callback) {
      settings.fs.lstat(path, (lstatError, lstat) => {
        if (lstatError !== null) {
          callFailureCallback(callback, lstatError);
          return;
        }
        if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) {
          callSuccessCallback(callback, lstat);
          return;
        }
        settings.fs.stat(path, (statError, stat) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              callFailureCallback(callback, statError);
              return;
            }
            callSuccessCallback(callback, lstat);
            return;
          }
          if (settings.markSymbolicLink) stat.isSymbolicLink = () => true;
          callSuccessCallback(callback, stat);
        });
      });
    }
    exports.read = read;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result) {
      callback(null, result);
    }
  });
  var require_sync$5 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.read = void 0;
    function read(path, settings) {
      const lstat = settings.fs.lstatSync(path);
      if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) return lstat;
      try {
        const stat = settings.fs.statSync(path);
        if (settings.markSymbolicLink) stat.isSymbolicLink = () => true;
        return stat;
      } catch (error) {
        if (!settings.throwErrorOnBrokenSymbolicLink) return lstat;
        throw error;
      }
    }
    exports.read = read;
  });
  var require_fs$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.createFileSystemAdapter = exports.FILE_SYSTEM_ADAPTER = void 0;
    const fs$6 = __require("fs");
    exports.FILE_SYSTEM_ADAPTER = {
      lstat: fs$6.lstat,
      stat: fs$6.stat,
      lstatSync: fs$6.lstatSync,
      statSync: fs$6.statSync,
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) return exports.FILE_SYSTEM_ADAPTER;
      return _p_ObjectAssign(
        _p_ObjectAssign({}, exports.FILE_SYSTEM_ADAPTER),
        fsMethods,
      );
    }
    exports.createFileSystemAdapter = createFileSystemAdapter;
  });
  var require_settings$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const fs = require_fs$2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLink = this._getValue(
          this._options.followSymbolicLink,
          true,
        );
        this.fs = fs.createFileSystemAdapter(this._options.fs);
        this.markSymbolicLink = this._getValue(
          this._options.markSymbolicLink,
          false,
        );
        this.throwErrorOnBrokenSymbolicLink = this._getValue(
          this._options.throwErrorOnBrokenSymbolicLink,
          true,
        );
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports.default = Settings;
  });
  var require_out$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.statSync = exports.stat = exports.Settings = void 0;
    const async = require_async$5();
    const sync = require_sync$5();
    const settings_1 = require_settings$3();
    exports.Settings = settings_1.default;
    function stat(path, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports.stat = stat;
    function statSync(path, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path, settings);
    }
    exports.statSync = statSync;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default)
        return settingsOrOptions;
      return new settings_1.default(settingsOrOptions);
    }
  });
  var require_queue_microtask = /* @__PURE__ */ __commonJSMin(
    (exports, module) => {
      /*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
      let promise;
      module.exports =
        typeof queueMicrotask === "function"
          ? queueMicrotask.bind(typeof window !== "undefined" ? void 0 : global)
          : (cb) =>
              (promise || (promise = _p_PromiseResolve()))
                .then(cb)
                .catch((err) =>
                  setTimeout(() => {
                    throw err;
                  }, 0),
                );
    },
  );
  var require_run_parallel = /* @__PURE__ */ __commonJSMin(
    (exports, module) => {
      /*! run-parallel. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
      module.exports = runParallel;
      const queueMicrotask = require_queue_microtask();
      function runParallel(tasks, cb) {
        let results;
        let pending;
        let keys;
        let isSync = true;
        if (_p_ArrayIsArray(tasks)) {
          results = [];
          pending = tasks.length;
        } else {
          keys = _p_ObjectKeys(tasks);
          results = {};
          pending = keys.length;
        }
        function done(err) {
          function end() {
            if (cb) cb(err, results);
            cb = null;
          }
          if (isSync) queueMicrotask(end);
          else end();
        }
        function each(i, err, result) {
          results[i] = result;
          if (--pending === 0 || err) done(err);
        }
        if (!pending) done(null);
        else if (keys)
          keys.forEach(function (key) {
            tasks[key](function (err, result) {
              each(key, err, result);
            });
          });
        else
          tasks.forEach(function (task, i) {
            task(function (err, result) {
              each(i, err, result);
            });
          });
        isSync = false;
      }
    },
  );
  var require_constants = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.IS_SUPPORT_READDIR_WITH_FILE_TYPES = void 0;
    const NODE_PROCESS_VERSION_PARTS = process.versions.node.split(".");
    if (
      NODE_PROCESS_VERSION_PARTS[0] === void 0 ||
      NODE_PROCESS_VERSION_PARTS[1] === void 0
    )
      throw new _p_ErrorCtor(
        `Unexpected behavior. The 'process.versions.node' variable has invalid value: ${process.versions.node}`,
      );
    const MAJOR_VERSION = _p_NumberParseInt(NODE_PROCESS_VERSION_PARTS[0], 10);
    const MINOR_VERSION = _p_NumberParseInt(NODE_PROCESS_VERSION_PARTS[1], 10);
    const SUPPORTED_MAJOR_VERSION = 10;
    /**
     * IS `true` for Node.js 10.10 and greater.
     */
    exports.IS_SUPPORT_READDIR_WITH_FILE_TYPES =
      MAJOR_VERSION > SUPPORTED_MAJOR_VERSION ||
      (MAJOR_VERSION === SUPPORTED_MAJOR_VERSION && MINOR_VERSION >= 10);
  });
  var require_fs$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports.createDirentFromStats = createDirentFromStats;
  });
  var require_utils = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.fs = void 0;
    exports.fs = require_fs$1();
  });
  var require_common$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.joinPathSegments = void 0;
    function joinPathSegments(a, b, separator) {
      /**
       * The correct handling of cases when the first segment is a root (`/`, `C:/`) or UNC path (`//?/C:/`).
       */
      if (_p_StringPrototypeEndsWith(a, separator)) return a + b;
      return a + separator + b;
    }
    exports.joinPathSegments = joinPathSegments;
  });
  var require_async$4 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.readdir = exports.readdirWithFileTypes = exports.read = void 0;
    const fsStat = require_out$3();
    const rpl = require_run_parallel();
    const constants_1 = require_constants();
    const utils = require_utils();
    const common = require_common$1();
    function read(directory, settings, callback) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES) {
        readdirWithFileTypes(directory, settings, callback);
        return;
      }
      readdir(directory, settings, callback);
    }
    exports.read = read;
    function readdirWithFileTypes(directory, settings, callback) {
      settings.fs.readdir(
        directory,
        { withFileTypes: true },
        (readdirError, dirents) => {
          if (readdirError !== null) {
            callFailureCallback(callback, readdirError);
            return;
          }
          const entries = dirents.map((dirent) => ({
            dirent,
            name: dirent.name,
            path: common.joinPathSegments(
              directory,
              dirent.name,
              settings.pathSegmentSeparator,
            ),
          }));
          if (!settings.followSymbolicLinks) {
            callSuccessCallback(callback, entries);
            return;
          }
          const tasks = entries.map((entry) =>
            makeRplTaskEntry(entry, settings),
          );
          rpl(tasks, (rplError, rplEntries) => {
            if (rplError !== null) {
              callFailureCallback(callback, rplError);
              return;
            }
            callSuccessCallback(callback, rplEntries);
          });
        },
      );
    }
    exports.readdirWithFileTypes = readdirWithFileTypes;
    function makeRplTaskEntry(entry, settings) {
      return (done) => {
        if (!entry.dirent.isSymbolicLink()) {
          done(null, entry);
          return;
        }
        settings.fs.stat(entry.path, (statError, stats) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              done(statError);
              return;
            }
            done(null, entry);
            return;
          }
          entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
          done(null, entry);
        });
      };
    }
    function readdir(directory, settings, callback) {
      settings.fs.readdir(directory, (readdirError, names) => {
        if (readdirError !== null) {
          callFailureCallback(callback, readdirError);
          return;
        }
        const tasks = names.map((name) => {
          const path = common.joinPathSegments(
            directory,
            name,
            settings.pathSegmentSeparator,
          );
          return (done) => {
            fsStat.stat(path, settings.fsStatSettings, (error, stats) => {
              if (error !== null) {
                done(error);
                return;
              }
              const entry = {
                name,
                path,
                dirent: utils.fs.createDirentFromStats(name, stats),
              };
              if (settings.stats) entry.stats = stats;
              done(null, entry);
            });
          };
        });
        rpl(tasks, (rplError, entries) => {
          if (rplError !== null) {
            callFailureCallback(callback, rplError);
            return;
          }
          callSuccessCallback(callback, entries);
        });
      });
    }
    exports.readdir = readdir;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result) {
      callback(null, result);
    }
  });
  var require_sync$4 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.readdir = exports.readdirWithFileTypes = exports.read = void 0;
    const fsStat = require_out$3();
    const constants_1 = require_constants();
    const utils = require_utils();
    const common = require_common$1();
    function read(directory, settings) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES)
        return readdirWithFileTypes(directory, settings);
      return readdir(directory, settings);
    }
    exports.read = read;
    function readdirWithFileTypes(directory, settings) {
      return settings.fs
        .readdirSync(directory, { withFileTypes: true })
        .map((dirent) => {
          const entry = {
            dirent,
            name: dirent.name,
            path: common.joinPathSegments(
              directory,
              dirent.name,
              settings.pathSegmentSeparator,
            ),
          };
          if (entry.dirent.isSymbolicLink() && settings.followSymbolicLinks)
            try {
              const stats = settings.fs.statSync(entry.path);
              entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
            } catch (error) {
              if (settings.throwErrorOnBrokenSymbolicLink) throw error;
            }
          return entry;
        });
    }
    exports.readdirWithFileTypes = readdirWithFileTypes;
    function readdir(directory, settings) {
      return settings.fs.readdirSync(directory).map((name) => {
        const entryPath = common.joinPathSegments(
          directory,
          name,
          settings.pathSegmentSeparator,
        );
        const stats = fsStat.statSync(entryPath, settings.fsStatSettings);
        const entry = {
          name,
          path: entryPath,
          dirent: utils.fs.createDirentFromStats(name, stats),
        };
        if (settings.stats) entry.stats = stats;
        return entry;
      });
    }
    exports.readdir = readdir;
  });
  var require_fs = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.createFileSystemAdapter = exports.FILE_SYSTEM_ADAPTER = void 0;
    const fs$5 = __require("fs");
    exports.FILE_SYSTEM_ADAPTER = {
      lstat: fs$5.lstat,
      stat: fs$5.stat,
      lstatSync: fs$5.lstatSync,
      statSync: fs$5.statSync,
      readdir: fs$5.readdir,
      readdirSync: fs$5.readdirSync,
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) return exports.FILE_SYSTEM_ADAPTER;
      return _p_ObjectAssign(
        _p_ObjectAssign({}, exports.FILE_SYSTEM_ADAPTER),
        fsMethods,
      );
    }
    exports.createFileSystemAdapter = createFileSystemAdapter;
  });
  var require_settings$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const path$9 = __require("path");
    const fsStat = require_out$3();
    const fs = require_fs();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLinks = this._getValue(
          this._options.followSymbolicLinks,
          false,
        );
        this.fs = fs.createFileSystemAdapter(this._options.fs);
        this.pathSegmentSeparator = this._getValue(
          this._options.pathSegmentSeparator,
          path$9.sep,
        );
        this.stats = this._getValue(this._options.stats, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(
          this._options.throwErrorOnBrokenSymbolicLink,
          true,
        );
        this.fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this.followSymbolicLinks,
          fs: this.fs,
          throwErrorOnBrokenSymbolicLink: this.throwErrorOnBrokenSymbolicLink,
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports.default = Settings;
  });
  var require_out$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.Settings = exports.scandirSync = exports.scandir = void 0;
    const async = require_async$4();
    const sync = require_sync$4();
    const settings_1 = require_settings$2();
    exports.Settings = settings_1.default;
    function scandir(path, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports.scandir = scandir;
    function scandirSync(path, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path, settings);
    }
    exports.scandirSync = scandirSync;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default)
        return settingsOrOptions;
      return new settings_1.default(settingsOrOptions);
    }
  });
  var require_reusify = /* @__PURE__ */ __commonJSMin((exports, module) => {
    function reusify(Constructor) {
      var head = new Constructor();
      var tail = head;
      function get() {
        var current = head;
        if (current.next) head = current.next;
        else {
          head = new Constructor();
          tail = head;
        }
        current.next = null;
        return current;
      }
      function release(obj) {
        tail.next = obj;
        tail = obj;
      }
      return {
        get,
        release,
      };
    }
    module.exports = reusify;
  });
  var require_queue = /* @__PURE__ */ __commonJSMin((exports, module) => {
    var reusify = require_reusify();
    function fastqueue(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      if (!(_concurrency >= 1))
        throw new _p_ErrorCtor(
          "fastqueue concurrency must be equal to or greater than 1",
        );
      var cache = reusify(Task);
      var queueHead = null;
      var queueTail = null;
      var _running = 0;
      var errorHandler = null;
      var self = {
        push,
        drain: noop,
        saturated: noop,
        pause,
        paused: false,
        get concurrency() {
          return _concurrency;
        },
        set concurrency(value) {
          if (!(value >= 1))
            throw new _p_ErrorCtor(
              "fastqueue concurrency must be equal to or greater than 1",
            );
          _concurrency = value;
          if (self.paused) return;
          for (; queueHead && _running < _concurrency;) {
            _running++;
            release();
          }
        },
        running,
        resume,
        idle,
        length,
        getQueue,
        unshift,
        empty: noop,
        kill,
        killAndDrain,
        error,
        abort,
      };
      return self;
      function running() {
        return _running;
      }
      function pause() {
        self.paused = true;
      }
      function length() {
        var current = queueHead;
        var counter = 0;
        while (current) {
          current = current.next;
          counter++;
        }
        return counter;
      }
      function getQueue() {
        var current = queueHead;
        var tasks = [];
        while (current) {
          tasks.push(current.value);
          current = current.next;
        }
        return tasks;
      }
      function resume() {
        if (!self.paused) return;
        self.paused = false;
        if (queueHead === null) {
          _running++;
          release();
          return;
        }
        for (; queueHead && _running < _concurrency;) {
          _running++;
          release();
        }
      }
      function idle() {
        return _running === 0 && self.length() === 0;
      }
      function push(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueTail) {
            queueTail.next = current;
            queueTail = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function unshift(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueHead) {
            current.next = queueHead;
            queueHead = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function release(holder) {
        if (holder) cache.release(holder);
        var next = queueHead;
        if (next && _running <= _concurrency) {
          if (!self.paused) {
            if (queueTail === queueHead) queueTail = null;
            queueHead = next.next;
            next.next = null;
            worker.call(context, next.value, next.worked);
            if (queueTail === null) self.empty();
          } else _running--;
        } else if (--_running === 0) self.drain();
      }
      function kill() {
        queueHead = null;
        queueTail = null;
        self.drain = noop;
      }
      function killAndDrain() {
        queueHead = null;
        queueTail = null;
        self.drain();
        self.drain = noop;
      }
      function abort() {
        var current = queueHead;
        queueHead = null;
        queueTail = null;
        while (current) {
          var next = current.next;
          var callback = current.callback;
          var errorHandler = current.errorHandler;
          var val = current.value;
          var context = current.context;
          current.value = null;
          current.callback = noop;
          current.errorHandler = null;
          if (errorHandler)
            errorHandler(/* @__PURE__ */ new _p_ErrorCtor("abort"), val);
          callback.call(context, /* @__PURE__ */ new _p_ErrorCtor("abort"));
          current.release(current);
          current = next;
        }
        self.drain = noop;
      }
      function error(handler) {
        errorHandler = handler;
      }
    }
    function noop() {}
    function Task() {
      this.value = null;
      this.callback = noop;
      this.next = null;
      this.release = noop;
      this.context = null;
      this.errorHandler = null;
      var self = this;
      this.worked = function worked(err, result) {
        var callback = self.callback;
        var errorHandler = self.errorHandler;
        var val = self.value;
        self.value = null;
        self.callback = noop;
        if (self.errorHandler) errorHandler(err, val);
        callback.call(self.context, err, result);
        self.release(self);
      };
    }
    function queueAsPromised(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      function asyncWrapper(arg, cb) {
        worker.call(this, arg).then(function (res) {
          cb(null, res);
        }, cb);
      }
      var queue = fastqueue(context, asyncWrapper, _concurrency);
      var pushCb = queue.push;
      var unshiftCb = queue.unshift;
      queue.push = push;
      queue.unshift = unshift;
      queue.drained = drained;
      return queue;
      function push(value) {
        var p = new _p_PromiseCtor(function (resolve, reject) {
          pushCb(value, function (err, result) {
            if (err) {
              reject(err);
              return;
            }
            resolve(result);
          });
        });
        p.catch(noop);
        return p;
      }
      function unshift(value) {
        var p = new _p_PromiseCtor(function (resolve, reject) {
          unshiftCb(value, function (err, result) {
            if (err) {
              reject(err);
              return;
            }
            resolve(result);
          });
        });
        p.catch(noop);
        return p;
      }
      function drained() {
        return new _p_PromiseCtor(function (resolve) {
          _p_processNextTick(function () {
            if (queue.idle()) resolve();
            else {
              var previousDrain = queue.drain;
              queue.drain = function () {
                if (typeof previousDrain === "function") previousDrain();
                resolve();
                queue.drain = previousDrain;
              };
            }
          });
        });
      }
    }
    module.exports = fastqueue;
    module.exports.promise = queueAsPromised;
  });
  var require_common = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.joinPathSegments =
      exports.replacePathSegmentSeparator =
      exports.isAppliedFilter =
      exports.isFatalError =
        void 0;
    function isFatalError(settings, error) {
      if (settings.errorFilter === null) return true;
      return !settings.errorFilter(error);
    }
    exports.isFatalError = isFatalError;
    function isAppliedFilter(filter, value) {
      return filter === null || filter(value);
    }
    exports.isAppliedFilter = isAppliedFilter;
    function replacePathSegmentSeparator(filepath, separator) {
      return filepath.split(/[/\\]/).join(separator);
    }
    exports.replacePathSegmentSeparator = replacePathSegmentSeparator;
    function joinPathSegments(a, b, separator) {
      if (a === "") return b;
      /**
       * The correct handling of cases when the first segment is a root (`/`, `C:/`) or UNC path (`//?/C:/`).
       */
      if (_p_StringPrototypeEndsWith(a, separator)) return a + b;
      return a + separator + b;
    }
    exports.joinPathSegments = joinPathSegments;
  });
  var require_reader$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const common = require_common();
    var Reader = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._root = common.replacePathSegmentSeparator(
          _root,
          _settings.pathSegmentSeparator,
        );
      }
    };
    exports.default = Reader;
  });
  var require_async$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const events_1 = __require("events");
    const fsScandir = require_out$2();
    const fastq = require_queue();
    const common = require_common();
    const reader_1 = require_reader$1();
    var AsyncReader = class extends reader_1.default {
      constructor(_root, _settings) {
        super(_root, _settings);
        this._settings = _settings;
        this._scandir = fsScandir.scandir;
        this._emitter = new events_1.EventEmitter();
        this._queue = fastq(
          this._worker.bind(this),
          this._settings.concurrency,
        );
        this._isFatalError = false;
        this._isDestroyed = false;
        this._queue.drain = () => {
          if (!this._isFatalError) this._emitter.emit("end");
        };
      }
      read() {
        this._isFatalError = false;
        this._isDestroyed = false;
        setImmediate(() => {
          this._pushToQueue(this._root, this._settings.basePath);
        });
        return this._emitter;
      }
      get isDestroyed() {
        return this._isDestroyed;
      }
      destroy() {
        if (this._isDestroyed)
          throw new _p_ErrorCtor("The reader is already destroyed");
        this._isDestroyed = true;
        this._queue.killAndDrain();
      }
      onEntry(callback) {
        this._emitter.on("entry", callback);
      }
      onError(callback) {
        this._emitter.once("error", callback);
      }
      onEnd(callback) {
        this._emitter.once("end", callback);
      }
      _pushToQueue(directory, base) {
        const queueItem = {
          directory,
          base,
        };
        this._queue.push(queueItem, (error) => {
          if (error !== null) this._handleError(error);
        });
      }
      _worker(item, done) {
        this._scandir(
          item.directory,
          this._settings.fsScandirSettings,
          (error, entries) => {
            if (error !== null) {
              done(error, void 0);
              return;
            }
            for (const entry of entries) this._handleEntry(entry, item.base);
            done(null, void 0);
          },
        );
      }
      _handleError(error) {
        if (this._isDestroyed || !common.isFatalError(this._settings, error))
          return;
        this._isFatalError = true;
        this._isDestroyed = true;
        this._emitter.emit("error", error);
      }
      _handleEntry(entry, base) {
        if (this._isDestroyed || this._isFatalError) return;
        const fullpath = entry.path;
        if (base !== void 0)
          entry.path = common.joinPathSegments(
            base,
            entry.name,
            this._settings.pathSegmentSeparator,
          );
        if (common.isAppliedFilter(this._settings.entryFilter, entry))
          this._emitEntry(entry);
        if (
          entry.dirent.isDirectory() &&
          common.isAppliedFilter(this._settings.deepFilter, entry)
        )
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
      }
      _emitEntry(entry) {
        this._emitter.emit("entry", entry);
      }
    };
    exports.default = AsyncReader;
  });
  var require_async$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const async_1 = require_async$3();
    var AsyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._storage = [];
      }
      read(callback) {
        this._reader.onError((error) => {
          callFailureCallback(callback, error);
        });
        this._reader.onEntry((entry) => {
          this._storage.push(entry);
        });
        this._reader.onEnd(() => {
          callSuccessCallback(callback, this._storage);
        });
        this._reader.read();
      }
    };
    exports.default = AsyncProvider;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, entries) {
      callback(null, entries);
    }
  });
  var require_stream$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const stream_1$2 = __require("stream");
    const async_1 = require_async$3();
    var StreamProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._stream = new stream_1$2.Readable({
          objectMode: true,
          read: () => {},
          destroy: () => {
            if (!this._reader.isDestroyed) this._reader.destroy();
          },
        });
      }
      read() {
        this._reader.onError((error) => {
          this._stream.emit("error", error);
        });
        this._reader.onEntry((entry) => {
          this._stream.push(entry);
        });
        this._reader.onEnd(() => {
          this._stream.push(null);
        });
        this._reader.read();
        return this._stream;
      }
    };
    exports.default = StreamProvider;
  });
  var require_sync$3 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const fsScandir = require_out$2();
    const common = require_common();
    const reader_1 = require_reader$1();
    var SyncReader = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._scandir = fsScandir.scandirSync;
        this._storage = [];
        this._queue = /* @__PURE__ */ new _p_SetCtor();
      }
      read() {
        this._pushToQueue(this._root, this._settings.basePath);
        this._handleQueue();
        return this._storage;
      }
      _pushToQueue(directory, base) {
        this._queue.add({
          directory,
          base,
        });
      }
      _handleQueue() {
        for (const item of this._queue.values())
          this._handleDirectory(item.directory, item.base);
      }
      _handleDirectory(directory, base) {
        try {
          const entries = this._scandir(
            directory,
            this._settings.fsScandirSettings,
          );
          for (const entry of entries) this._handleEntry(entry, base);
        } catch (error) {
          this._handleError(error);
        }
      }
      _handleError(error) {
        if (!common.isFatalError(this._settings, error)) return;
        throw error;
      }
      _handleEntry(entry, base) {
        const fullpath = entry.path;
        if (base !== void 0)
          entry.path = common.joinPathSegments(
            base,
            entry.name,
            this._settings.pathSegmentSeparator,
          );
        if (common.isAppliedFilter(this._settings.entryFilter, entry))
          this._pushToStorage(entry);
        if (
          entry.dirent.isDirectory() &&
          common.isAppliedFilter(this._settings.deepFilter, entry)
        )
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
      }
      _pushToStorage(entry) {
        this._storage.push(entry);
      }
    };
    exports.default = SyncReader;
  });
  var require_sync$2 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const sync_1 = require_sync$3();
    var SyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new sync_1.default(this._root, this._settings);
      }
      read() {
        return this._reader.read();
      }
    };
    exports.default = SyncProvider;
  });
  var require_settings$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const path$8 = __require("path");
    const fsScandir = require_out$2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.basePath = this._getValue(this._options.basePath, void 0);
        this.concurrency = this._getValue(
          this._options.concurrency,
          Number.POSITIVE_INFINITY,
        );
        this.deepFilter = this._getValue(this._options.deepFilter, null);
        this.entryFilter = this._getValue(this._options.entryFilter, null);
        this.errorFilter = this._getValue(this._options.errorFilter, null);
        this.pathSegmentSeparator = this._getValue(
          this._options.pathSegmentSeparator,
          path$8.sep,
        );
        this.fsScandirSettings = new fsScandir.Settings({
          followSymbolicLinks: this._options.followSymbolicLinks,
          fs: this._options.fs,
          pathSegmentSeparator: this._options.pathSegmentSeparator,
          stats: this._options.stats,
          throwErrorOnBrokenSymbolicLink:
            this._options.throwErrorOnBrokenSymbolicLink,
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports.default = Settings;
  });
  var require_out$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.Settings =
      exports.walkStream =
      exports.walkSync =
      exports.walk =
        void 0;
    const async_1 = require_async$2();
    const stream_1 = require_stream$2();
    const sync_1 = require_sync$2();
    const settings_1 = require_settings$1();
    exports.Settings = settings_1.default;
    function walk(directory, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        new async_1.default(directory, getSettings()).read(
          optionsOrSettingsOrCallback,
        );
        return;
      }
      new async_1.default(
        directory,
        getSettings(optionsOrSettingsOrCallback),
      ).read(callback);
    }
    exports.walk = walk;
    function walkSync(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return new sync_1.default(directory, settings).read();
    }
    exports.walkSync = walkSync;
    function walkStream(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return new stream_1.default(directory, settings).read();
    }
    exports.walkStream = walkStream;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default)
        return settingsOrOptions;
      return new settings_1.default(settingsOrOptions);
    }
  });
  var require_reader = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const path$7 = __require("path");
    const fsStat = require_out$3();
    const utils = require_utils$1();
    var Reader = class {
      constructor(_settings) {
        this._settings = _settings;
        this._fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          throwErrorOnBrokenSymbolicLink: this._settings.followSymbolicLinks,
        });
      }
      _getFullEntryPath(filepath) {
        return path$7.resolve(this._settings.cwd, filepath);
      }
      _makeEntry(stats, pattern) {
        const entry = {
          name: pattern,
          path: pattern,
          dirent: utils.fs.createDirentFromStats(pattern, stats),
        };
        if (this._settings.stats) entry.stats = stats;
        return entry;
      }
      _isFatalError(error) {
        return (
          !utils.errno.isEnoentCodeError(error) &&
          !this._settings.suppressErrors
        );
      }
    };
    exports.default = Reader;
  });
  var require_stream$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const stream_1$1 = __require("stream");
    const fsStat = require_out$3();
    const fsWalk = require_out$1();
    const reader_1 = require_reader();
    var ReaderStream = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkStream = fsWalk.walkStream;
        this._stat = fsStat.stat;
      }
      dynamic(root, options) {
        return this._walkStream(root, options);
      }
      static(patterns, options) {
        const filepaths = patterns.map(this._getFullEntryPath, this);
        const stream = new stream_1$1.PassThrough({ objectMode: true });
        stream._write = (index, _enc, done) => {
          return this._getEntry(filepaths[index], patterns[index], options)
            .then((entry) => {
              if (entry !== null && options.entryFilter(entry))
                stream.push(entry);
              if (index === filepaths.length - 1) stream.end();
              done();
            })
            .catch(done);
        };
        for (let i = 0; i < filepaths.length; i++) stream.write(i);
        return stream;
      }
      _getEntry(filepath, pattern, options) {
        return this._getStat(filepath)
          .then((stats) => this._makeEntry(stats, pattern))
          .catch((error) => {
            if (options.errorFilter(error)) return null;
            throw error;
          });
      }
      _getStat(filepath) {
        return new _p_PromiseCtor((resolve, reject) => {
          this._stat(filepath, this._fsStatSettings, (error, stats) => {
            return error === null ? resolve(stats) : reject(error);
          });
        });
      }
    };
    exports.default = ReaderStream;
  });
  var require_async$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const fsWalk = require_out$1();
    const reader_1 = require_reader();
    const stream_1 = require_stream$1();
    var ReaderAsync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkAsync = fsWalk.walk;
        this._readerStream = new stream_1.default(this._settings);
      }
      dynamic(root, options) {
        return new _p_PromiseCtor((resolve, reject) => {
          this._walkAsync(root, options, (error, entries) => {
            if (error === null) resolve(entries);
            else reject(error);
          });
        });
      }
      async static(patterns, options) {
        const entries = [];
        const stream = this._readerStream.static(patterns, options);
        return new _p_PromiseCtor((resolve, reject) => {
          stream.once("error", reject);
          stream.on("data", (entry) => entries.push(entry));
          stream.once("end", () => resolve(entries));
        });
      }
    };
    exports.default = ReaderAsync;
  });
  var require_matcher = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const utils = require_utils$1();
    var Matcher = class {
      constructor(_patterns, _settings, _micromatchOptions) {
        this._patterns = _patterns;
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this._storage = [];
        this._fillStorage();
      }
      _fillStorage() {
        for (const pattern of this._patterns) {
          const segments = this._getPatternSegments(pattern);
          const sections = this._splitSegmentsIntoSections(segments);
          this._storage.push({
            complete: sections.length <= 1,
            pattern,
            segments,
            sections,
          });
        }
      }
      _getPatternSegments(pattern) {
        return utils.pattern
          .getPatternParts(pattern, this._micromatchOptions)
          .map((part) => {
            if (!utils.pattern.isDynamicPattern(part, this._settings))
              return {
                dynamic: false,
                pattern: part,
              };
            return {
              dynamic: true,
              pattern: part,
              patternRe: utils.pattern.makeRe(part, this._micromatchOptions),
            };
          });
      }
      _splitSegmentsIntoSections(segments) {
        return utils.array.splitWhen(
          segments,
          (segment) =>
            segment.dynamic && utils.pattern.hasGlobStar(segment.pattern),
        );
      }
    };
    exports.default = Matcher;
  });
  var require_partial = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const matcher_1 = require_matcher();
    var PartialMatcher = class extends matcher_1.default {
      match(filepath) {
        const parts = filepath.split("/");
        const levels = parts.length;
        const patterns = this._storage.filter(
          (info) => !info.complete || info.segments.length > levels,
        );
        for (const pattern of patterns) {
          const section = pattern.sections[0];
          /**
           * In this case, the pattern has a globstar and we must read all directories unconditionally,
           * but only if the level has reached the end of the first group.
           *
           * fixtures/{a,b}/**
           *  ^ true/false  ^ always true
           */
          if (!pattern.complete && levels > section.length) return true;
          if (
            parts.every((part, index) => {
              const segment = pattern.segments[index];
              if (segment.dynamic && segment.patternRe.test(part)) return true;
              if (!segment.dynamic && segment.pattern === part) return true;
              return false;
            })
          )
            return true;
        }
        return false;
      }
    };
    exports.default = PartialMatcher;
  });
  var require_deep = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const utils = require_utils$1();
    const partial_1 = require_partial();
    var DeepFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
      }
      getFilter(basePath, positive, negative) {
        const matcher = this._getMatcher(positive);
        const negativeRe = this._getNegativePatternsRe(negative);
        return (entry) => this._filter(basePath, entry, matcher, negativeRe);
      }
      _getMatcher(patterns) {
        return new partial_1.default(
          patterns,
          this._settings,
          this._micromatchOptions,
        );
      }
      _getNegativePatternsRe(patterns) {
        const affectDepthOfReadingPatterns = patterns.filter(
          utils.pattern.isAffectDepthOfReadingPattern,
        );
        return utils.pattern.convertPatternsToRe(
          affectDepthOfReadingPatterns,
          this._micromatchOptions,
        );
      }
      _filter(basePath, entry, matcher, negativeRe) {
        if (this._isSkippedByDeep(basePath, entry.path)) return false;
        if (this._isSkippedSymbolicLink(entry)) return false;
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._isSkippedByPositivePatterns(filepath, matcher)) return false;
        return this._isSkippedByNegativePatterns(filepath, negativeRe);
      }
      _isSkippedByDeep(basePath, entryPath) {
        /**
         * Avoid unnecessary depth calculations when it doesn't matter.
         */
        if (this._settings.deep === Infinity) return false;
        return this._getEntryLevel(basePath, entryPath) >= this._settings.deep;
      }
      _getEntryLevel(basePath, entryPath) {
        const entryPathDepth = entryPath.split("/").length;
        if (basePath === "") return entryPathDepth;
        return entryPathDepth - basePath.split("/").length;
      }
      _isSkippedSymbolicLink(entry) {
        return (
          !this._settings.followSymbolicLinks && entry.dirent.isSymbolicLink()
        );
      }
      _isSkippedByPositivePatterns(entryPath, matcher) {
        return !this._settings.baseNameMatch && !matcher.match(entryPath);
      }
      _isSkippedByNegativePatterns(entryPath, patternsRe) {
        return !utils.pattern.matchAny(entryPath, patternsRe);
      }
    };
    exports.default = DeepFilter;
  });
  var require_entry$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const utils = require_utils$1();
    var EntryFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this.index = /* @__PURE__ */ new _p_MapCtor();
      }
      getFilter(positive, negative) {
        const [absoluteNegative, relativeNegative] =
          utils.pattern.partitionAbsoluteAndRelative(negative);
        const patterns = {
          positive: {
            all: utils.pattern.convertPatternsToRe(
              positive,
              this._micromatchOptions,
            ),
          },
          negative: {
            absolute: utils.pattern.convertPatternsToRe(
              absoluteNegative,
              _p_ObjectAssign(_p_ObjectAssign({}, this._micromatchOptions), {
                dot: true,
              }),
            ),
            relative: utils.pattern.convertPatternsToRe(
              relativeNegative,
              _p_ObjectAssign(_p_ObjectAssign({}, this._micromatchOptions), {
                dot: true,
              }),
            ),
          },
        };
        return (entry) => this._filter(entry, patterns);
      }
      _filter(entry, patterns) {
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._settings.unique && this._isDuplicateEntry(filepath))
          return false;
        if (this._onlyFileFilter(entry) || this._onlyDirectoryFilter(entry))
          return false;
        const isMatched = this._isMatchToPatternsSet(
          filepath,
          patterns,
          entry.dirent.isDirectory(),
        );
        if (this._settings.unique && isMatched)
          this._createIndexRecord(filepath);
        return isMatched;
      }
      _isDuplicateEntry(filepath) {
        return this.index.has(filepath);
      }
      _createIndexRecord(filepath) {
        this.index.set(filepath, void 0);
      }
      _onlyFileFilter(entry) {
        return this._settings.onlyFiles && !entry.dirent.isFile();
      }
      _onlyDirectoryFilter(entry) {
        return this._settings.onlyDirectories && !entry.dirent.isDirectory();
      }
      _isMatchToPatternsSet(filepath, patterns, isDirectory) {
        if (
          !this._isMatchToPatterns(filepath, patterns.positive.all, isDirectory)
        )
          return false;
        if (
          this._isMatchToPatterns(
            filepath,
            patterns.negative.relative,
            isDirectory,
          )
        )
          return false;
        if (
          this._isMatchToAbsoluteNegative(
            filepath,
            patterns.negative.absolute,
            isDirectory,
          )
        )
          return false;
        return true;
      }
      _isMatchToAbsoluteNegative(filepath, patternsRe, isDirectory) {
        if (patternsRe.length === 0) return false;
        const fullpath = utils.path.makeAbsolute(this._settings.cwd, filepath);
        return this._isMatchToPatterns(fullpath, patternsRe, isDirectory);
      }
      _isMatchToPatterns(filepath, patternsRe, isDirectory) {
        if (patternsRe.length === 0) return false;
        const isMatched = utils.pattern.matchAny(filepath, patternsRe);
        if (!isMatched && isDirectory)
          return utils.pattern.matchAny(filepath + "/", patternsRe);
        return isMatched;
      }
    };
    exports.default = EntryFilter;
  });
  var require_error = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const utils = require_utils$1();
    var ErrorFilter = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getFilter() {
        return (error) => this._isNonFatalError(error);
      }
      _isNonFatalError(error) {
        return (
          utils.errno.isEnoentCodeError(error) || this._settings.suppressErrors
        );
      }
    };
    exports.default = ErrorFilter;
  });
  var require_entry = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const utils = require_utils$1();
    var EntryTransformer = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getTransformer() {
        return (entry) => this._transform(entry);
      }
      _transform(entry) {
        let filepath = entry.path;
        if (this._settings.absolute) {
          filepath = utils.path.makeAbsolute(this._settings.cwd, filepath);
          filepath = utils.path.unixify(filepath);
        }
        if (this._settings.markDirectories && entry.dirent.isDirectory())
          filepath += "/";
        if (!this._settings.objectMode) return filepath;
        return _p_ObjectAssign(_p_ObjectAssign({}, entry), { path: filepath });
      }
    };
    exports.default = EntryTransformer;
  });
  var require_provider = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const path$6 = __require("path");
    const deep_1 = require_deep();
    const entry_1 = require_entry$1();
    const error_1 = require_error();
    const entry_2 = require_entry();
    var Provider = class {
      constructor(_settings) {
        this._settings = _settings;
        this.errorFilter = new error_1.default(this._settings);
        this.entryFilter = new entry_1.default(
          this._settings,
          this._getMicromatchOptions(),
        );
        this.deepFilter = new deep_1.default(
          this._settings,
          this._getMicromatchOptions(),
        );
        this.entryTransformer = new entry_2.default(this._settings);
      }
      _getRootDirectory(task) {
        return path$6.resolve(this._settings.cwd, task.base);
      }
      _getReaderOptions(task) {
        const basePath = task.base === "." ? "" : task.base;
        return {
          basePath,
          pathSegmentSeparator: "/",
          concurrency: this._settings.concurrency,
          deepFilter: this.deepFilter.getFilter(
            basePath,
            task.positive,
            task.negative,
          ),
          entryFilter: this.entryFilter.getFilter(task.positive, task.negative),
          errorFilter: this.errorFilter.getFilter(),
          followSymbolicLinks: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          stats: this._settings.stats,
          throwErrorOnBrokenSymbolicLink:
            this._settings.throwErrorOnBrokenSymbolicLink,
          transform: this.entryTransformer.getTransformer(),
        };
      }
      _getMicromatchOptions() {
        return {
          dot: this._settings.dot,
          matchBase: this._settings.baseNameMatch,
          nobrace: !this._settings.braceExpansion,
          nocase: !this._settings.caseSensitiveMatch,
          noext: !this._settings.extglob,
          noglobstar: !this._settings.globstar,
          posix: true,
          strictSlashes: false,
        };
      }
    };
    exports.default = Provider;
  });
  var require_async = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const async_1 = require_async$1();
    const provider_1 = require_provider();
    var ProviderAsync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new async_1.default(this._settings);
      }
      async read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        return (await this.api(root, task, options)).map((entry) =>
          options.transform(entry),
        );
      }
      api(root, task, options) {
        if (task.dynamic) return this._reader.dynamic(root, options);
        return this._reader.static(task.patterns, options);
      }
    };
    exports.default = ProviderAsync;
  });
  var require_stream = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const stream_1 = __require("stream");
    const stream_2 = require_stream$1();
    const provider_1 = require_provider();
    var ProviderStream = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new stream_2.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const source = this.api(root, task, options);
        const destination = new stream_1.Readable({
          objectMode: true,
          read: () => {},
        });
        source
          .once("error", (error) => destination.emit("error", error))
          .on("data", (entry) =>
            destination.emit("data", options.transform(entry)),
          )
          .once("end", () => destination.emit("end"));
        destination.once("close", () => source.destroy());
        return destination;
      }
      api(root, task, options) {
        if (task.dynamic) return this._reader.dynamic(root, options);
        return this._reader.static(task.patterns, options);
      }
    };
    exports.default = ProviderStream;
  });
  var require_sync$1 = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const fsStat = require_out$3();
    const fsWalk = require_out$1();
    const reader_1 = require_reader();
    var ReaderSync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkSync = fsWalk.walkSync;
        this._statSync = fsStat.statSync;
      }
      dynamic(root, options) {
        return this._walkSync(root, options);
      }
      static(patterns, options) {
        const entries = [];
        for (const pattern of patterns) {
          const filepath = this._getFullEntryPath(pattern);
          const entry = this._getEntry(filepath, pattern, options);
          if (entry === null || !options.entryFilter(entry)) continue;
          entries.push(entry);
        }
        return entries;
      }
      _getEntry(filepath, pattern, options) {
        try {
          const stats = this._getStat(filepath);
          return this._makeEntry(stats, pattern);
        } catch (error) {
          if (options.errorFilter(error)) return null;
          throw error;
        }
      }
      _getStat(filepath) {
        return this._statSync(filepath, this._fsStatSettings);
      }
    };
    exports.default = ReaderSync;
  });
  var require_sync = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    const sync_1 = require_sync$1();
    const provider_1 = require_provider();
    var ProviderSync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new sync_1.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        return this.api(root, task, options).map(options.transform);
      }
      api(root, task, options) {
        if (task.dynamic) return this._reader.dynamic(root, options);
        return this._reader.static(task.patterns, options);
      }
    };
    exports.default = ProviderSync;
  });
  var require_settings = /* @__PURE__ */ __commonJSMin((exports) => {
    _p_ObjectDefineProperty(exports, "__esModule", { value: true });
    exports.DEFAULT_FILE_SYSTEM_ADAPTER = void 0;
    const fs$4 = __require("fs");
    const os$1 = __require("os");
    /**
     * The `os.cpus` method can return zero. We expect the number of cores to be greater than zero.
     * https://github.com/nodejs/node/blob/7faeddf23a98c53896f8b574a6e66589e8fb1eb8/lib/os.js#L106-L107
     */
    const CPU_COUNT = _p_MathMax(os$1.cpus().length, 1);
    exports.DEFAULT_FILE_SYSTEM_ADAPTER = {
      lstat: fs$4.lstat,
      lstatSync: fs$4.lstatSync,
      stat: fs$4.stat,
      statSync: fs$4.statSync,
      readdir: fs$4.readdir,
      readdirSync: fs$4.readdirSync,
    };
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.absolute = this._getValue(this._options.absolute, false);
        this.baseNameMatch = this._getValue(this._options.baseNameMatch, false);
        this.braceExpansion = this._getValue(
          this._options.braceExpansion,
          true,
        );
        this.caseSensitiveMatch = this._getValue(
          this._options.caseSensitiveMatch,
          true,
        );
        this.concurrency = this._getValue(this._options.concurrency, CPU_COUNT);
        this.cwd = this._getValue(this._options.cwd, _p_processCwd());
        this.deep = this._getValue(this._options.deep, Infinity);
        this.dot = this._getValue(this._options.dot, false);
        this.extglob = this._getValue(this._options.extglob, true);
        this.followSymbolicLinks = this._getValue(
          this._options.followSymbolicLinks,
          true,
        );
        this.fs = this._getFileSystemMethods(this._options.fs);
        this.globstar = this._getValue(this._options.globstar, true);
        this.ignore = this._getValue(this._options.ignore, []);
        this.markDirectories = this._getValue(
          this._options.markDirectories,
          false,
        );
        this.objectMode = this._getValue(this._options.objectMode, false);
        this.onlyDirectories = this._getValue(
          this._options.onlyDirectories,
          false,
        );
        this.onlyFiles = this._getValue(this._options.onlyFiles, true);
        this.stats = this._getValue(this._options.stats, false);
        this.suppressErrors = this._getValue(
          this._options.suppressErrors,
          false,
        );
        this.throwErrorOnBrokenSymbolicLink = this._getValue(
          this._options.throwErrorOnBrokenSymbolicLink,
          false,
        );
        this.unique = this._getValue(this._options.unique, true);
        if (this.onlyDirectories) this.onlyFiles = false;
        if (this.stats) this.objectMode = true;
        this.ignore = [].concat(this.ignore);
      }
      _getValue(option, value) {
        return option === void 0 ? value : option;
      }
      _getFileSystemMethods(methods = {}) {
        return _p_ObjectAssign(
          _p_ObjectAssign({}, exports.DEFAULT_FILE_SYSTEM_ADAPTER),
          methods,
        );
      }
    };
    exports.default = Settings;
  });
  var require_out = /* @__PURE__ */ __commonJSMin((exports, module) => {
    const taskManager = require_tasks();
    const async_1 = require_async();
    const stream_1 = require_stream();
    const sync_1 = require_sync();
    const settings_1 = require_settings();
    const utils = require_utils$1();
    async function FastGlob(source, options) {
      assertPatternsInput(source);
      const works = getWorks(source, async_1.default, options);
      const result = await _p_PromiseAll(works);
      return utils.array.flatten(result);
    }
    (function (FastGlob) {
      FastGlob.glob = FastGlob;
      FastGlob.globSync = sync;
      FastGlob.globStream = stream;
      FastGlob.async = FastGlob;
      function sync(source, options) {
        assertPatternsInput(source);
        const works = getWorks(source, sync_1.default, options);
        return utils.array.flatten(works);
      }
      FastGlob.sync = sync;
      function stream(source, options) {
        assertPatternsInput(source);
        const works = getWorks(source, stream_1.default, options);
        /**
         * The stream returned by the provider cannot work with an asynchronous iterator.
         * To support asynchronous iterators, regardless of the number of tasks, we always multiplex streams.
         * This affects performance (+25%). I don't see best solution right now.
         */
        return utils.stream.merge(works);
      }
      FastGlob.stream = stream;
      function generateTasks(source, options) {
        assertPatternsInput(source);
        const patterns = [].concat(source);
        const settings = new settings_1.default(options);
        return taskManager.generate(patterns, settings);
      }
      FastGlob.generateTasks = generateTasks;
      function isDynamicPattern(source, options) {
        assertPatternsInput(source);
        const settings = new settings_1.default(options);
        return utils.pattern.isDynamicPattern(source, settings);
      }
      FastGlob.isDynamicPattern = isDynamicPattern;
      function escapePath(source) {
        assertPatternsInput(source);
        return utils.path.escape(source);
      }
      FastGlob.escapePath = escapePath;
      function convertPathToPattern(source) {
        assertPatternsInput(source);
        return utils.path.convertPathToPattern(source);
      }
      FastGlob.convertPathToPattern = convertPathToPattern;
      (function (posix) {
        function escapePath(source) {
          assertPatternsInput(source);
          return utils.path.escapePosixPath(source);
        }
        posix.escapePath = escapePath;
        function convertPathToPattern(source) {
          assertPatternsInput(source);
          return utils.path.convertPosixPathToPattern(source);
        }
        posix.convertPathToPattern = convertPathToPattern;
      })(FastGlob.posix || (FastGlob.posix = {}));
      (function (win32) {
        function escapePath(source) {
          assertPatternsInput(source);
          return utils.path.escapeWindowsPath(source);
        }
        win32.escapePath = escapePath;
        function convertPathToPattern(source) {
          assertPatternsInput(source);
          return utils.path.convertWindowsPathToPattern(source);
        }
        win32.convertPathToPattern = convertPathToPattern;
      })(FastGlob.win32 || (FastGlob.win32 = {}));
    })(FastGlob || (FastGlob = {}));
    function getWorks(source, _Provider, options) {
      const patterns = [].concat(source);
      const settings = new settings_1.default(options);
      const tasks = taskManager.generate(patterns, settings);
      const provider = new _Provider(settings);
      return tasks.map(provider.read, provider);
    }
    function assertPatternsInput(input) {
      if (
        ![]
          .concat(input)
          .every(
            (item) =>
              utils.string.isString(item) && !utils.string.isEmpty(item),
          )
      )
        throw new _p_TypeErrorCtor(
          "Patterns must be a string (non empty) or an array of strings",
        );
    }
    module.exports = FastGlob;
  });
  var init_default = __esmMin(() => {});
  function toPath(urlOrPath) {
    return urlOrPath instanceof URL
      ? (0, node_url.fileURLToPath)(urlOrPath)
      : urlOrPath;
  }
  var init_node = __esmMin(() => {
    init_default();
    (0, node_util.promisify)(node_child_process.execFile);
  });
  var require_ignore = /* @__PURE__ */ __commonJSMin((exports, module) => {
    function makeArray(subject) {
      return _p_ArrayIsArray(subject) ? subject : [subject];
    }
    const UNDEFINED = void 0;
    const EMPTY = "";
    const SPACE = " ";
    const ESCAPE = "\\";
    const REGEX_TEST_BLANK_LINE = /^\s+$/;
    const REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
    const REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
    const REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
    const REGEX_SPLITALL_CRLF = /\r?\n/g;
    const REGEX_TEST_INVALID_PATH = /^\.{0,2}\/|^\.{1,2}$/;
    const REGEX_TEST_TRAILING_SLASH = /\/$/;
    const SLASH = "/";
    let TMP_KEY_IGNORE = "node-ignore";
    /* istanbul ignore else */
    if (typeof Symbol !== "undefined")
      TMP_KEY_IGNORE = Symbol.for("node-ignore");
    const KEY_IGNORE = TMP_KEY_IGNORE;
    const define = (object, key, value) => {
      _p_ObjectDefineProperty(object, key, { value });
      return value;
    };
    const REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
    const RETURN_FALSE = () => false;
    const sanitizeRange = (range) =>
      range.replace(REGEX_REGEXP_RANGE, (match, from, to) =>
        _p_StringPrototypeCharCodeAt(from, 0) <=
        _p_StringPrototypeCharCodeAt(to, 0)
          ? match
          : EMPTY,
      );
    const cleanRangeBackSlash = (slashes) => {
      const { length } = slashes;
      return slashes.slice(0, length - (length % 2));
    };
    const REPLACERS = [
      [/^\uFEFF/, () => EMPTY],
      [
        /((?:\\\\)*?)(\\?\s+)$/,
        (_, m1, m2) => m1 + (m2.indexOf("\\") === 0 ? SPACE : EMPTY),
      ],
      [
        /(\\+?)\s/g,
        (_, m1) => {
          const { length } = m1;
          return m1.slice(0, length - (length % 2)) + SPACE;
        },
      ],
      [/[\\$.|*+(){^]/g, (match) => `\\${match}`],
      [/(?!\\)\?/g, () => "[^/]"],
      [/^\//, () => "^"],
      [/\//g, () => "\\/"],
      [/^\^*\\\*\\\*\\\//, () => "^(?:.*\\/)?"],
      [
        /^(?=[^^])/,
        function startingReplacer() {
          return !/\/(?!$)/.test(this) ? "(?:^|\\/)" : "^";
        },
      ],
      [
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        (_, index, str) =>
          index + 6 < str.length ? "(?:\\/[^\\/]+)*" : "\\/.+",
      ],
      [
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        (_, p1, p2) => {
          return p1 + p2.replace(/\\\*/g, "[^\\/]*");
        },
      ],
      [/\\\\\\(?=[$.|*+(){^])/g, () => ESCAPE],
      [/\\\\/g, () => ESCAPE],
      [
        /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
        (match, leadEscape, range, endEscape, close) =>
          leadEscape === ESCAPE
            ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}`
            : close === "]"
              ? endEscape.length % 2 === 0
                ? `[${sanitizeRange(range)}${endEscape}]`
                : "[]"
              : "[]",
      ],
      [
        /(?:[^*])$/,
        (match) => (/\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`),
      ],
    ];
    const REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\\\*$/;
    const MODE_IGNORE = "regex";
    const MODE_CHECK_IGNORE = "checkRegex";
    const TRAILING_WILD_CARD_REPLACERS = {
      [MODE_IGNORE](_, p1) {
        return `${p1 ? `${p1}[^/]+` : "[^/]*"}(?=$|\\/$)`;
      },
      [MODE_CHECK_IGNORE](_, p1) {
        return `${p1 ? `${p1}[^/]*` : "[^/]*"}(?=$|\\/$)`;
      },
    };
    const makeRegexPrefix = (pattern) =>
      REPLACERS.reduce(
        (prev, [matcher, replacer]) =>
          prev.replace(matcher, replacer.bind(pattern)),
        pattern,
      );
    const isString = (subject) => typeof subject === "string";
    const checkPattern = (pattern) =>
      pattern &&
      isString(pattern) &&
      !REGEX_TEST_BLANK_LINE.test(pattern) &&
      !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) &&
      pattern.indexOf("#") !== 0;
    const splitPattern = (pattern) =>
      pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);
    var IgnoreRule = class {
      constructor(pattern, mark, body, ignoreCase, negative, prefix) {
        this.pattern = pattern;
        this.mark = mark;
        this.negative = negative;
        define(this, "body", body);
        define(this, "ignoreCase", ignoreCase);
        define(this, "regexPrefix", prefix);
      }
      get regex() {
        const key = "_regex";
        if (this[key]) return this[key];
        return this._make(MODE_IGNORE, key);
      }
      get checkRegex() {
        const key = "_checkRegex";
        if (this[key]) return this[key];
        return this._make(MODE_CHECK_IGNORE, key);
      }
      _make(mode, key) {
        const str = this.regexPrefix.replace(
          REGEX_REPLACE_TRAILING_WILDCARD,
          TRAILING_WILD_CARD_REPLACERS[mode],
        );
        const regex = this.ignoreCase
          ? new _p_RegExpCtor(str, "i")
          : new _p_RegExpCtor(str);
        return define(this, key, regex);
      }
    };
    const createRule = ({ pattern, mark }, ignoreCase) => {
      let negative = false;
      let body = pattern;
      if (body.indexOf("!") === 0) {
        negative = true;
        body = body.substr(1);
      }
      body = body
        .replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!")
        .replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
      const regexPrefix = makeRegexPrefix(body);
      return new IgnoreRule(
        pattern,
        mark,
        body,
        ignoreCase,
        negative,
        regexPrefix,
      );
    };
    var RuleManager = class {
      constructor(ignoreCase) {
        this._ignoreCase = ignoreCase;
        this._rules = [];
      }
      _add(pattern) {
        if (pattern && pattern[KEY_IGNORE]) {
          this._rules = this._rules.concat(pattern._rules._rules);
          this._added = true;
          return;
        }
        if (isString(pattern)) pattern = { pattern };
        if (checkPattern(pattern.pattern)) {
          const rule = createRule(pattern, this._ignoreCase);
          this._added = true;
          this._rules.push(rule);
        }
      }
      add(pattern) {
        this._added = false;
        makeArray(isString(pattern) ? splitPattern(pattern) : pattern).forEach(
          this._add,
          this,
        );
        return this._added;
      }
      test(path, checkUnignored, mode) {
        let ignored = false;
        let unignored = false;
        let matchedRule;
        this._rules.forEach((rule) => {
          const { negative } = rule;
          if (
            (unignored === negative && ignored !== unignored) ||
            (negative && !ignored && !unignored && !checkUnignored)
          )
            return;
          if (!rule[mode].test(path)) return;
          ignored = !negative;
          unignored = negative;
          matchedRule = negative ? UNDEFINED : rule;
        });
        const ret = {
          ignored,
          unignored,
        };
        if (matchedRule) ret.rule = matchedRule;
        return ret;
      }
    };
    const throwError = (message, Ctor) => {
      throw new Ctor(message);
    };
    const checkPath = (path, originalPath, doThrow) => {
      if (!isString(path))
        return doThrow(
          `path must be a string, but got \`${originalPath}\``,
          TypeError,
        );
      if (!path) return doThrow(`path must not be empty`, TypeError);
      if (checkPath.isNotRelative(path))
        return doThrow(
          `path should be a \`path.relative()\`d string, but got "${originalPath}"`,
          RangeError,
        );
      return true;
    };
    const isNotRelative = (path) => REGEX_TEST_INVALID_PATH.test(path);
    checkPath.isNotRelative = isNotRelative;
    /* istanbul ignore next */
    checkPath.convert = (p) => p;
    var Ignore = class {
      constructor({
        ignorecase = true,
        ignoreCase = ignorecase,
        allowRelativePaths = false,
      } = {}) {
        define(this, KEY_IGNORE, true);
        this._rules = new RuleManager(ignoreCase);
        this._strictPathCheck = !allowRelativePaths;
        this._initCache();
      }
      _initCache() {
        this._ignoreCache = _p_ObjectCreate(null);
        this._testCache = _p_ObjectCreate(null);
      }
      add(pattern) {
        if (this._rules.add(pattern)) this._initCache();
        return this;
      }
      addPattern(pattern) {
        return this.add(pattern);
      }
      _test(originalPath, cache, checkUnignored, slices) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(
          path,
          originalPath,
          this._strictPathCheck ? throwError : RETURN_FALSE,
        );
        return this._t(path, cache, checkUnignored, slices);
      }
      checkIgnore(path) {
        if (!REGEX_TEST_TRAILING_SLASH.test(path)) return this.test(path);
        const slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        if (slices.length) {
          const parent = this._t(
            slices.join(SLASH) + SLASH,
            this._testCache,
            true,
            slices,
          );
          if (parent.ignored) return parent;
        }
        return this._rules.test(path, false, MODE_CHECK_IGNORE);
      }
      _t(path, cache, checkUnignored, slices) {
        if (path in cache) return cache[path];
        if (!slices) slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        if (!slices.length)
          return (cache[path] = this._rules.test(
            path,
            checkUnignored,
            MODE_IGNORE,
          ));
        const parent = this._t(
          slices.join(SLASH) + SLASH,
          cache,
          checkUnignored,
          slices,
        );
        return (cache[path] = parent.ignored
          ? parent
          : this._rules.test(path, checkUnignored, MODE_IGNORE));
      }
      ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
      }
      createFilter() {
        return (path) => !this.ignores(path);
      }
      filter(paths) {
        return makeArray(paths).filter(this.createFilter());
      }
      test(path) {
        return this._test(path, this._testCache, true);
      }
    };
    const factory = (options) => new Ignore(options);
    const isPathValid = (path) =>
      checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
    /* istanbul ignore next */
    const setupWindows = () => {
      const makePosix = (str) =>
        /^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str)
          ? str
          : str.replace(/\\/g, "/");
      checkPath.convert = makePosix;
      const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
      checkPath.isNotRelative = (path) =>
        REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
    };
    /* istanbul ignore next */
    if (typeof process !== "undefined" && process.platform === "win32")
      setupWindows();
    module.exports = factory;
    factory.default = factory;
    module.exports.isPathValid = isPathValid;
    define(module.exports, Symbol.for("setupWindows"), setupWindows);
  });
  function isPathInside(childPath, parentPath) {
    const relation = node_path.default.relative(parentPath, childPath);
    return Boolean(
      relation &&
      relation !== ".." &&
      !_p_StringPrototypeStartsWith(relation, `..${node_path.default.sep}`) &&
      relation !== node_path.default.resolve(childPath),
    );
  }
  var init_is_path_inside = __esmMin(() => {});
  function slash(path) {
    if (_p_StringPrototypeStartsWith(path, "\\\\?\\")) return path;
    return path.replace(/\\/g, "/");
  }
  var init_slash = __esmMin(() => {});
  var import_out$2;
  var import_ignore$1;
  var import_micromatch;
  var isNegativePattern;
  var normalizeAbsolutePatternToRelative;
  var absolutePrefixesMatch;
  var getStaticAbsolutePathPrefix;
  var normalizeNegativePattern;
  var bindFsMethod;
  var promisifyFsMethod;
  var normalizeDirectoryPatternForFastGlob;
  var getParentDirectoryPrefix;
  var adjustIgnorePatternsForParentDirectories;
  var getAsyncStatMethod;
  var getStatSyncMethod$1;
  var pathHasGitDirectory;
  var buildPathChain;
  var findGitRootInChain;
  var findGitRootSyncUncached;
  var findGitRootSync;
  var findGitRootAsyncUncached;
  var findGitRoot;
  var isWithinGitRoot;
  var getParentGitignorePaths;
  var GITIGNORE_WILDCARDS;
  var hasGitignoreWildcards;
  var MICROMATCH_ONLY_SYNTAX;
  var unescapeGitignorePattern;
  var normalizeGitignorePatternForIgnore;
  var toLiteralPattern;
  var finalSegment;
  var toStandaloneRule;
  var isInsideCwd;
  var anchorToCwd;
  var createNameComparer;
  var getNegationFinalSegments;
  var negationsCouldRescue;
  var expandBraceGroups;
  var convertIgnorePatternsForIgnoreFileSearch;
  var getRulePrune;
  var buildPrunePatternsAndGuards;
  var convertPatternsForFastGlob;
  var init_utilities = __esmMin(() => {
    import_out$2 = /* @__PURE__ */ __toESM(require_out(), 1);
    import_ignore$1 = /* @__PURE__ */ __toESM(require_ignore(), 1);
    init_is_path_inside();
    import_micromatch = /* @__PURE__ */ __toESM(require_micromatch(), 1);
    init_slash();
    isNegativePattern = (pattern) => pattern[0] === "!";
    normalizeAbsolutePatternToRelative = (pattern) => {
      if (!_p_StringPrototypeStartsWith(pattern, "/")) return pattern;
      const inner = pattern.slice(1);
      const firstSlashIndex = inner.indexOf("/");
      const firstSegment =
        firstSlashIndex > 0 ? inner.slice(0, firstSlashIndex) : inner;
      if (
        firstSlashIndex > 0 &&
        !import_out$2.default.isDynamicPattern(firstSegment)
      )
        return pattern;
      return inner;
    };
    absolutePrefixesMatch = (positivePrefix, negativePrefix) =>
      negativePrefix === positivePrefix;
    getStaticAbsolutePathPrefix = (pattern) => {
      if (!node_path.default.isAbsolute(pattern)) return;
      const staticSegments = [];
      for (const segment of pattern.split("/")) {
        if (!segment) continue;
        if (import_out$2.default.isDynamicPattern(segment)) break;
        staticSegments.push(segment);
      }
      return staticSegments.length === 0
        ? void 0
        : `/${staticSegments.join("/")}`;
    };
    normalizeNegativePattern = (
      pattern,
      positiveAbsolutePathPrefixes = [],
      hasRelativePositivePattern = false,
    ) => {
      if (!_p_StringPrototypeStartsWith(pattern, "/")) return pattern;
      const normalizedPattern = normalizeAbsolutePatternToRelative(pattern);
      if (normalizedPattern !== pattern) return normalizedPattern;
      if (hasRelativePositivePattern) return pattern.slice(1);
      const negativeAbsolutePathPrefix = getStaticAbsolutePathPrefix(pattern);
      return negativeAbsolutePathPrefix !== void 0 &&
        positiveAbsolutePathPrefixes.some((positiveAbsolutePathPrefix) =>
          absolutePrefixesMatch(
            positiveAbsolutePathPrefix,
            negativeAbsolutePathPrefix,
          ),
        )
        ? pattern
        : pattern.slice(1);
    };
    bindFsMethod = (object, methodName) => {
      const method = object?.[methodName];
      return typeof method === "function" ? method.bind(object) : void 0;
    };
    promisifyFsMethod = (object, methodName) => {
      const method = object?.[methodName];
      if (typeof method !== "function") return;
      return (0, node_util.promisify)(method.bind(object));
    };
    normalizeDirectoryPatternForFastGlob = (pattern) => {
      if (!_p_StringPrototypeEndsWith(pattern, "/")) return pattern;
      const trimmedPattern = pattern.replace(/\/+$/u, "");
      if (!trimmedPattern) return "/**";
      if (trimmedPattern === "**") return "**/**";
      const hasLeadingSlash = _p_StringPrototypeStartsWith(trimmedPattern, "/");
      const hasInnerSlash = (
        hasLeadingSlash ? trimmedPattern.slice(1) : trimmedPattern
      ).includes("/");
      return `${!hasLeadingSlash && !hasInnerSlash && !_p_StringPrototypeStartsWith(trimmedPattern, "**/") ? "**/" : ""}${trimmedPattern}/**`;
    };
    getParentDirectoryPrefix = (pattern) => {
      const match = (
        isNegativePattern(pattern) ? pattern.slice(1) : pattern
      ).match(/^(\.\.\/)+/);
      return match ? match[0] : "";
    };
    adjustIgnorePatternsForParentDirectories = (patterns, ignorePatterns) => {
      if (patterns.length === 0 || ignorePatterns.length === 0)
        return ignorePatterns;
      const parentPrefixes = patterns.map((pattern) =>
        getParentDirectoryPrefix(pattern),
      );
      const firstPrefix = parentPrefixes[0];
      if (!firstPrefix) return ignorePatterns;
      if (!parentPrefixes.every((prefix) => prefix === firstPrefix))
        return ignorePatterns;
      return ignorePatterns.map((pattern) => {
        if (
          _p_StringPrototypeStartsWith(pattern, "**/") &&
          !_p_StringPrototypeStartsWith(pattern, "../")
        )
          return firstPrefix + pattern;
        return pattern;
      });
    };
    getAsyncStatMethod = (fsImplementation) =>
      bindFsMethod(fsImplementation?.promises, "stat") ??
      bindFsMethod(node_fs.default.promises, "stat");
    getStatSyncMethod$1 = /* @__PURE__ */ __name((fsImplementation) => {
      if (fsImplementation) return bindFsMethod(fsImplementation, "statSync");
      return bindFsMethod(node_fs.default, "statSync");
    }, "getStatSyncMethod");
    pathHasGitDirectory = (stats) =>
      Boolean(stats?.isDirectory?.() || stats?.isFile?.());
    buildPathChain = (startPath, rootPath) => {
      const chain = [];
      let currentPath = startPath;
      chain.push(currentPath);
      while (currentPath !== rootPath) {
        const parentPath = node_path.default.dirname(currentPath);
        if (parentPath === currentPath) break;
        currentPath = parentPath;
        chain.push(currentPath);
      }
      return chain;
    };
    findGitRootInChain = async (paths, statMethod) => {
      for (const directory of paths) {
        const gitPath = node_path.default.join(directory, ".git");
        try {
          const stats = await statMethod(gitPath);
          if (pathHasGitDirectory(stats)) return directory;
        } catch {}
      }
    };
    findGitRootSyncUncached = (cwd, fsImplementation) => {
      const statSyncMethod = getStatSyncMethod$1(fsImplementation);
      if (!statSyncMethod) return;
      const currentPath = node_path.default.resolve(cwd);
      const { root } = node_path.default.parse(currentPath);
      const chain = buildPathChain(currentPath, root);
      for (const directory of chain) {
        const gitPath = node_path.default.join(directory, ".git");
        try {
          const stats = statSyncMethod(gitPath);
          if (pathHasGitDirectory(stats)) return directory;
        } catch {}
      }
    };
    findGitRootSync = (cwd, fsImplementation) => {
      if (typeof cwd !== "string")
        throw new _p_TypeErrorCtor("cwd must be a string");
      return findGitRootSyncUncached(cwd, fsImplementation);
    };
    findGitRootAsyncUncached = async (cwd, fsImplementation) => {
      const statMethod = getAsyncStatMethod(fsImplementation);
      if (!statMethod) return findGitRootSync(cwd, fsImplementation);
      const currentPath = node_path.default.resolve(cwd);
      const { root } = node_path.default.parse(currentPath);
      const chain = buildPathChain(currentPath, root);
      return findGitRootInChain(chain, statMethod);
    };
    findGitRoot = async (cwd, fsImplementation) => {
      if (typeof cwd !== "string")
        throw new _p_TypeErrorCtor("cwd must be a string");
      return findGitRootAsyncUncached(cwd, fsImplementation);
    };
    isWithinGitRoot = (gitRoot, cwd) => {
      const resolvedGitRoot = node_path.default.resolve(gitRoot);
      const resolvedCwd = node_path.default.resolve(cwd);
      return (
        resolvedCwd === resolvedGitRoot ||
        isPathInside(resolvedCwd, resolvedGitRoot)
      );
    };
    getParentGitignorePaths = (gitRoot, cwd) => {
      if (gitRoot && typeof gitRoot !== "string")
        throw new _p_TypeErrorCtor("gitRoot must be a string or undefined");
      if (typeof cwd !== "string")
        throw new _p_TypeErrorCtor("cwd must be a string");
      if (!gitRoot) return [];
      if (!isWithinGitRoot(gitRoot, cwd)) return [];
      return [
        ...buildPathChain(
          node_path.default.resolve(cwd),
          node_path.default.resolve(gitRoot),
        ),
      ]
        .reverse()
        .map((directory) => node_path.default.join(directory, ".gitignore"));
    };
    GITIGNORE_WILDCARDS = /(?<!\\)[*?[]/u;
    hasGitignoreWildcards = (value) => GITIGNORE_WILDCARDS.test(value);
    MICROMATCH_ONLY_SYNTAX = /[(){}|\\]/u;
    unescapeGitignorePattern = (value) =>
      _p_StringPrototypeReplaceAll(value, /\\(.)/gu, "$1");
    normalizeGitignorePatternForIgnore = (value) =>
      _p_StringPrototypeReplaceAll(value, /\\(.)/gu, (match, character) =>
        "*[]\\".includes(character) ? match : character,
      );
    toLiteralPattern = (value) =>
      import_out$2.default.escapePath(unescapeGitignorePattern(value));
    finalSegment = (value) => value.replace(/\/+$/u, "").split("/").pop();
    toStandaloneRule = (value) => value.replace(/^([#!])/u, String.raw`\$1`);
    isInsideCwd = (relativePath) =>
      relativePath !== "" &&
      !_p_StringPrototypeStartsWith(relativePath, "..") &&
      !node_path.default.isAbsolute(relativePath);
    anchorToCwd = (directory, body, cwd) => {
      const relativePath = slash(
        node_path.default.relative(
          cwd,
          node_path.default.join(directory, body),
        ),
      );
      return isInsideCwd(relativePath) ? relativePath : void 0;
    };
    createNameComparer = () => {
      const nameMatchers = /* @__PURE__ */ new _p_MapCtor();
      const matchesName = (pattern, name) => {
        const namePath = unescapeGitignorePattern(name);
        if (!(0, import_ignore$1.isPathValid)(namePath)) return true;
        const normalizedPattern = normalizeGitignorePatternForIgnore(pattern);
        let nameMatcher = nameMatchers.get(normalizedPattern);
        if (!nameMatcher) {
          nameMatcher = (0, import_ignore$1.default)().add([
            toStandaloneRule(normalizedPattern),
          ]);
          nameMatchers.set(normalizedPattern, nameMatcher);
        }
        return nameMatcher.ignores(namePath);
      };
      return (pattern, name) => {
        if (hasGitignoreWildcards(pattern) && hasGitignoreWildcards(name))
          return true;
        return hasGitignoreWildcards(name)
          ? matchesName(name, pattern)
          : matchesName(pattern, name);
      };
    };
    getNegationFinalSegments = (rules) =>
      rules
        .filter((rule) => isNegativePattern(rule.pattern))
        .map((rule) => finalSegment(rule.pattern.slice(1)))
        .filter(Boolean);
    negationsCouldRescue = (rules, names) => {
      if (names.length === 0) return false;
      const couldNameTheSamePath = createNameComparer();
      return getNegationFinalSegments(rules).some((negation) =>
        names.some((name) => couldNameTheSamePath(name, negation)),
      );
    };
    expandBraceGroups = (pattern) => {
      if (!pattern.includes("{")) return [pattern];
      const expandedPatterns = import_out$2.default
        .generateTasks(pattern)
        .flatMap((task) => task.patterns);
      return expandedPatterns.length > 0 ? expandedPatterns : [pattern];
    };
    convertIgnorePatternsForIgnoreFileSearch = (
      ignorePatterns,
      searchPatterns,
    ) => {
      if (ignorePatterns.length === 0) return ignorePatterns;
      const couldNameTheSamePath = createNameComparer();
      const expandedSearchPatterns = _p_ArrayPrototypeFlatMap(
        searchPatterns,
        (pattern) => expandBraceGroups(pattern),
      );
      if (
        expandedSearchPatterns.some((pattern) =>
          MICROMATCH_ONLY_SYNTAX.test(
            pattern.slice(0, pattern.lastIndexOf("/") + 1),
          ),
        )
      )
        return [];
      const ignoreFileNames = expandedSearchPatterns
        .map((pattern) => finalSegment(pattern))
        .filter(Boolean);
      const couldNameAnIgnoreFile = (pattern) => {
        const name = finalSegment(pattern.replace(/\/\*\*$/u, ""));
        if (!name || MICROMATCH_ONLY_SYNTAX.test(name)) return true;
        return ignoreFileNames.some((ignoreFileName) =>
          MICROMATCH_ONLY_SYNTAX.test(ignoreFileName)
            ? hasGitignoreWildcards(name) ||
              import_micromatch.default.isMatch(
                unescapeGitignorePattern(name),
                ignoreFileName,
                {
                  dot: true,
                  nocase: true,
                },
              )
            : couldNameTheSamePath(name, ignoreFileName),
        );
      };
      return ignorePatterns.filter(
        (pattern) =>
          !expandBraceGroups(pattern).some((expanded) =>
            couldNameAnIgnoreFile(expanded),
          ),
      );
    };
    getRulePrune = (
      { pattern, directory },
      {
        cwd,
        matcher,
        hasNegations,
        canSkipAtAnyDepth,
        canMatchIgnoreFile,
        gitignoreOnlySearch,
      },
    ) => {
      if (isNegativePattern(pattern)) return;
      const isDirectoryPattern = _p_StringPrototypeEndsWith(pattern, "/");
      const clean = pattern.replace(/\/+$/u, "");
      if (!clean) return;
      const body =
        _p_StringPrototypeStartsWith(clean, "**/") &&
        !clean.slice(3).includes("/")
          ? clean.slice(3)
          : clean;
      if (canMatchIgnoreFile(finalSegment(body))) return;
      const isGlob = hasGitignoreWildcards(body);
      if (isGlob && MICROMATCH_ONLY_SYNTAX.test(body)) return;
      const toFastGlob = (value) =>
        normalizeDirectoryPatternForFastGlob(
          `/${value}${isDirectoryPattern ? "/" : ""}`,
        ).replace(/^\//u, "");
      if (!body.includes("/") && canSkipAtAnyDepth(body)) {
        const relativeDirectory = slash(
          node_path.default.relative(cwd, directory),
        );
        return {
          pattern: toFastGlob(
            `${isInsideCwd(relativeDirectory) ? `${import_out$2.default.escapePath(relativeDirectory)}/` : ""}**/${isGlob ? body : toLiteralPattern(body)}`,
          ),
          guardName: body,
        };
      }
      const anchoredBody = body.replace(/^\//u, "");
      const target = anchorToCwd(
        directory,
        isGlob ? anchoredBody : unescapeGitignorePattern(anchoredBody),
        cwd,
      );
      if (target === void 0) return;
      const guardName = finalSegment(anchoredBody);
      if (isGlob)
        return hasNegations
          ? void 0
          : {
              pattern: toFastGlob(target),
              guardName,
            };
      if (
        !matcher(node_path.default.resolve(cwd, target) + node_path.default.sep)
          .ignored
      )
        return;
      const needsGuard = !gitignoreOnlySearch || target.includes("/");
      return {
        pattern: toFastGlob(import_out$2.default.escapePath(target)),
        guardName: needsGuard ? guardName : void 0,
      };
    };
    buildPrunePatternsAndGuards = (
      rules,
      matcher,
      cwd,
      { gitignoreOnlySearch = false, searchesForGitignoreFiles = false } = {},
    ) => {
      if (!matcher || !cwd || !rules || rules.length === 0)
        return {
          patterns: [],
          guardNames: [],
        };
      const negationNames = getNegationFinalSegments(rules);
      const couldNameTheSamePath = createNameComparer();
      const context = {
        cwd,
        matcher,
        hasNegations: negationNames.length > 0,
        canSkipAtAnyDepth: (pattern) =>
          !negationNames.some((name) => couldNameTheSamePath(pattern, name)),
        canMatchIgnoreFile: (pattern) =>
          searchesForGitignoreFiles &&
          couldNameTheSamePath(pattern, ".gitignore"),
        gitignoreOnlySearch,
      };
      const patterns = [];
      const guardNames = [];
      for (const rule of rules) {
        const prune = getRulePrune(rule, context);
        if (!prune) continue;
        patterns.push(prune.pattern);
        if (prune.guardName !== void 0) guardNames.push(prune.guardName);
      }
      return {
        patterns,
        guardNames,
      };
    };
    convertPatternsForFastGlob = (rules, matcher, cwd) =>
      buildPrunePatternsAndGuards(rules, matcher, cwd).patterns;
  });
  var import_out$1;
  var import_ignore;
  var defaultIgnoredDirectories;
  var ignoreFilesGlobOptions;
  var GITIGNORE_FILES_PATTERN;
  var MAX_INCLUDE_DEPTH;
  var getReadFileMethod;
  var getReadFileSyncMethod;
  var shouldSkipIgnoreFileError;
  var createReadError;
  var createIgnoreFileReadError;
  var createGitConfigReadError;
  var processIgnoreFileCore;
  var readIgnoreFilesSafely;
  var readIgnoreFilesSafelySync;
  var dedupePaths;
  var globIgnoreFiles;
  var normalizeIgnoreFileLine;
  var readIgnoreFileLines;
  var getIgnoreRules;
  var buildIgnoreResult;
  var applyBaseToPattern;
  var parseIgnoreFile;
  var toRelativePath;
  var notIgnored;
  var createIgnoreMatcher;
  var normalizeOptions$1;
  var unescapeGitQuotedValue;
  var parseGitConfigValue;
  var resolveConfigPath;
  var parseGitConfigSection;
  var parseGitConfigEntry;
  var parseIncludeIfCondition;
  var normalizeGitConfigConditionPattern;
  var gitConfigGlobToRegex;
  var matchesIncludeIfCondition;
  var shouldIncludeConfigSection;
  var createExcludesFileValue;
  var parseGitConfigForExcludesFile;
  var readGitConfigFile;
  var getExcludesFileFromGitConfigSync;
  var getExcludesFileFromGitConfigAsync;
  var resolveGitDirectoryFromFile;
  var getGitDirectorySync;
  var getGitDirectoryAsync;
  var getXdgConfigHome;
  var getGitConfigPaths;
  var getDefaultGlobalGitignorePath;
  var resolveExcludesFilePath;
  var readGlobalGitignoreContent;
  var getGlobalGitignoreFile;
  var getGlobalGitignoreFileAsync;
  var buildGlobalMatcher;
  var getKnownIgnoreFilePaths;
  var getKnownIgnoreFileSearchOptions;
  var getKnownIgnoreFilePattern;
  var getMatchingKnownIgnoreFilePaths;
  var globKnownIgnoreFilePaths;
  var filterKnownIgnoreFilePathsAsync;
  var filterKnownIgnoreFilePathsSync;
  var getIgnoreFileSearchPrune;
  var withPrunedSearch;
  var getUnreadPaths;
  var collectIgnoreFileArtifactsAsync;
  var collectIgnoreFileArtifactsSync;
  var getPatternsFromIgnoreFiles;
  var getIgnorePatternsAndPredicate;
  var getIgnorePatternsAndPredicateSync;
  var init_ignore = __esmMin(() => {
    import_out$1 = /* @__PURE__ */ __toESM(require_out(), 1);
    import_ignore = /* @__PURE__ */ __toESM(require_ignore(), 1);
    init_is_path_inside();
    init_slash();
    init_node();
    init_utilities();
    defaultIgnoredDirectories = [
      "**/node_modules",
      "**/flow-typed",
      "**/coverage",
      "**/.git",
    ];
    ignoreFilesGlobOptions = {
      absolute: true,
      dot: true,
    };
    GITIGNORE_FILES_PATTERN = "**/.gitignore";
    MAX_INCLUDE_DEPTH = 10;
    getReadFileMethod = (fsImplementation) =>
      bindFsMethod(fsImplementation?.promises, "readFile") ??
      bindFsMethod(node_fs_promises.default, "readFile") ??
      promisifyFsMethod(fsImplementation, "readFile");
    getReadFileSyncMethod = (fsImplementation) =>
      bindFsMethod(fsImplementation, "readFileSync") ??
      bindFsMethod(node_fs.default, "readFileSync");
    shouldSkipIgnoreFileError = (error, suppressErrors) => {
      if (!error) return Boolean(suppressErrors);
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return true;
      return Boolean(suppressErrors);
    };
    createReadError = (kind, filePath, error) => {
      const prefix = `Failed to read ${kind} at ${filePath}`;
      if (error instanceof Error)
        return new _p_ErrorCtor(`${prefix}: ${error.message}`, {
          cause: error,
        });
      return /* @__PURE__ */ new _p_ErrorCtor(`${prefix}: ${String(error)}`);
    };
    createIgnoreFileReadError = (filePath, error) =>
      createReadError("ignore file", filePath, error);
    createGitConfigReadError = (filePath, error) =>
      createReadError("git config", filePath, error);
    processIgnoreFileCore = (filePath, readMethod, suppressErrors) => {
      try {
        return {
          filePath,
          content: readMethod(filePath, "utf8"),
        };
      } catch (error) {
        if (shouldSkipIgnoreFileError(error, suppressErrors)) return;
        throw createIgnoreFileReadError(filePath, error);
      }
    };
    readIgnoreFilesSafely = async (paths, readFileMethod, suppressErrors) => {
      return (
        await _p_PromiseAll(
          paths.map(async (filePath) => {
            try {
              return {
                filePath,
                content: await readFileMethod(filePath, "utf8"),
              };
            } catch (error) {
              if (shouldSkipIgnoreFileError(error, suppressErrors)) return;
              throw createIgnoreFileReadError(filePath, error);
            }
          }),
        )
      ).filter(Boolean);
    };
    readIgnoreFilesSafelySync = (paths, readFileSyncMethod, suppressErrors) =>
      paths
        .map((filePath) =>
          processIgnoreFileCore(filePath, readFileSyncMethod, suppressErrors),
        )
        .filter(Boolean);
    dedupePaths = (paths) => {
      const seen = /* @__PURE__ */ new _p_SetCtor();
      return paths.filter((filePath) => {
        if (seen.has(filePath)) return false;
        seen.add(filePath);
        return true;
      });
    };
    globIgnoreFiles = (globFunction, patterns, normalizedOptions) =>
      globFunction(patterns, {
        ...normalizedOptions,
        ...ignoreFilesGlobOptions,
      });
    normalizeIgnoreFileLine = (line) => {
      line = line.replace(/^\uFEFF/u, "");
      let whitespaceStart = line.length;
      while (whitespaceStart > 0 && /\s/u.test(line[whitespaceStart - 1]))
        whitespaceStart--;
      if (whitespaceStart === line.length) return line;
      let backslashCount = 0;
      for (
        let index = whitespaceStart - 1;
        index >= 0 && line[index] === "\\";
        index--
      )
        backslashCount++;
      return backslashCount % 2 === 1
        ? line.slice(0, whitespaceStart) + " "
        : line.slice(0, whitespaceStart);
    };
    readIgnoreFileLines = (content) =>
      content
        .split(/\r?\n/)
        .map((line) => normalizeIgnoreFileLine(line))
        .filter((line) => line && !_p_StringPrototypeStartsWith(line, "#"));
    getIgnoreRules = (files) =>
      _p_ArrayPrototypeFlatMap(files, (file) => {
        const directory = node_path.default.dirname(file.filePath);
        return readIgnoreFileLines(file.content).map((pattern) => ({
          pattern,
          directory,
        }));
      });
    buildIgnoreResult = (files, normalizedOptions, gitRoot) => {
      const baseDir = gitRoot || normalizedOptions.cwd;
      const patterns = getPatternsFromIgnoreFiles(files, baseDir);
      const matcher = createIgnoreMatcher(
        patterns,
        normalizedOptions.cwd,
        baseDir,
      );
      return {
        patterns,
        rules: getIgnoreRules(files),
        matcher,
        predicate: (fileOrDirectory) => matcher(fileOrDirectory).ignored,
        usingGitRoot: Boolean(gitRoot && gitRoot !== normalizedOptions.cwd),
      };
    };
    applyBaseToPattern = (pattern, base) => {
      if (!base) return pattern;
      const isNegative = isNegativePattern(pattern);
      const cleanPattern = isNegative ? pattern.slice(1) : pattern;
      const slashIndex = cleanPattern.indexOf("/");
      const hasNonTrailingSlash =
        slashIndex !== -1 && slashIndex !== cleanPattern.length - 1;
      let result;
      if (!hasNonTrailingSlash)
        result = node_path.default.posix.join(base, "**", cleanPattern);
      else if (_p_StringPrototypeStartsWith(cleanPattern, "/"))
        result = node_path.default.posix.join(base, cleanPattern.slice(1));
      else result = node_path.default.posix.join(base, cleanPattern);
      return isNegative ? "!" + result : result;
    };
    parseIgnoreFile = (file, cwd) => {
      const base = slash(
        node_path.default.relative(
          cwd,
          node_path.default.dirname(file.filePath),
        ),
      );
      return readIgnoreFileLines(file.content).map((pattern) =>
        applyBaseToPattern(pattern, base),
      );
    };
    toRelativePath = (fileOrDirectory, cwd) => {
      if (node_path.default.isAbsolute(fileOrDirectory)) {
        const relativePath = node_path.default.relative(cwd, fileOrDirectory);
        if (relativePath && !isPathInside(fileOrDirectory, cwd)) return;
        return relativePath;
      }
      if (_p_StringPrototypeStartsWith(fileOrDirectory, "./"))
        return fileOrDirectory.slice(2);
      if (_p_StringPrototypeStartsWith(fileOrDirectory, "../")) return;
      return fileOrDirectory;
    };
    notIgnored = {
      ignored: false,
      unignored: false,
    };
    createIgnoreMatcher = (patterns, cwd, baseDir) => {
      const ignores = (0, import_ignore.default)().add(patterns);
      const resolvedCwd = node_path.default.normalize(
        node_path.default.resolve(cwd),
      );
      const resolvedBaseDir = node_path.default.normalize(
        node_path.default.resolve(baseDir),
      );
      return (fileOrDirectory) => {
        fileOrDirectory = toPath(fileOrDirectory);
        const hasTrailingSeparator = /[/\\]$/.test(fileOrDirectory);
        if (
          node_path.default.normalize(
            node_path.default.resolve(fileOrDirectory),
          ) === resolvedCwd
        )
          return notIgnored;
        let relativePath = toRelativePath(fileOrDirectory, resolvedBaseDir);
        if (relativePath === void 0) return notIgnored;
        if (!relativePath) return notIgnored;
        if (
          hasTrailingSeparator &&
          !_p_StringPrototypeEndsWith(relativePath, node_path.default.sep)
        )
          relativePath += node_path.default.sep;
        return ignores.test(slash(relativePath));
      };
    };
    normalizeOptions$1 = /* @__PURE__ */ __name((options = {}) => {
      const ignoreOption = options.ignore
        ? _p_ArrayIsArray(options.ignore)
          ? options.ignore
          : [options.ignore]
        : [];
      const cwd = toPath(options.cwd) ?? node_process.default.cwd();
      const deep =
        typeof options.deep === "number"
          ? _p_MathMax(0, options.deep) + 1
          : Number.POSITIVE_INFINITY;
      return {
        cwd,
        suppressErrors: options.suppressErrors ?? false,
        deep,
        ignore: [...ignoreOption, ...defaultIgnoredDirectories],
        followSymbolicLinks: options.followSymbolicLinks ?? true,
        concurrency: options.concurrency,
        throwErrorOnBrokenSymbolicLink:
          options.throwErrorOnBrokenSymbolicLink ?? false,
        fs: options.fs,
      };
    }, "normalizeOptions");
    unescapeGitQuotedValue = (value) =>
      _p_StringPrototypeReplaceAll(
        value,
        /\\(["\\abfnrtv])/g,
        (_match, escapedCharacter) => {
          switch (escapedCharacter) {
            case "a":
              return "\x07";
            case "b":
              return "\b";
            case "f":
              return "\f";
            case "n":
              return "\n";
            case "r":
              return "\r";
            case "t":
              return "	";
            case "v":
              return "\v";
            default:
              return escapedCharacter;
          }
        },
      );
    parseGitConfigValue = (value) => {
      const trimmedValue = _p_StringPrototypeTrim(value);
      const quotedMatch = trimmedValue.match(
        /^"((?:[^"\\]|\\.)*)"\s*(?:[#;].*)?$/,
      );
      if (quotedMatch) return unescapeGitQuotedValue(quotedMatch[1]);
      return trimmedValue.replace(/\s[#;].*$/, "").trim();
    };
    resolveConfigPath = (filePath, configPath) => {
      if (_p_StringPrototypeStartsWith(configPath, "~/")) {
        const homeDirectory = node_os.default.homedir();
        const resolved = node_path.default.join(
          homeDirectory,
          configPath.slice(2),
        );
        if (!isPathInside(resolved, homeDirectory))
          return node_path.default.join(
            homeDirectory,
            ".globby-invalid-path-traversal",
          );
        return resolved;
      }
      if (node_path.default.isAbsolute(configPath)) return configPath;
      return node_path.default.resolve(
        node_path.default.dirname(filePath),
        configPath,
      );
    };
    parseGitConfigSection = (line) => {
      if (!_p_StringPrototypeStartsWith(line, "[")) return;
      let inQuotes = false;
      let isEscaped = false;
      for (let index = 1; index < line.length; index++) {
        const character = line[index];
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (character === "\\") {
          isEscaped = true;
          continue;
        }
        if (character === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (character === "]" && !inQuotes) {
          const remainder = line.slice(index + 1).trimStart();
          if (
            remainder &&
            !_p_StringPrototypeStartsWith(remainder, "#") &&
            !_p_StringPrototypeStartsWith(remainder, ";")
          )
            return;
          return line.slice(1, index).trim();
        }
      }
    };
    parseGitConfigEntry = (line) => {
      const match = line.match(/^([A-Za-z\d-.]+)\s*=\s*(.*)$/);
      if (!match) return;
      return {
        key: match[1].toLowerCase(),
        value: parseGitConfigValue(match[2]),
      };
    };
    parseIncludeIfCondition = (section) => {
      if (!section) return;
      const match = section.match(/^includeif\s+"([^"]+)"$/i);
      return match ? match[1] : void 0;
    };
    normalizeGitConfigConditionPattern = (pattern, configFilePath) => {
      if (_p_StringPrototypeStartsWith(pattern, "~/"))
        pattern = node_path.default.join(
          node_os.default.homedir(),
          pattern.slice(2),
        );
      else if (_p_StringPrototypeStartsWith(pattern, "./"))
        pattern = node_path.default.resolve(
          node_path.default.dirname(configFilePath),
          pattern.slice(2),
        );
      else if (!node_path.default.isAbsolute(pattern))
        pattern = `**/${pattern}`;
      if (_p_StringPrototypeEndsWith(pattern, "/")) pattern += "**";
      return slash(pattern);
    };
    gitConfigGlobToRegex = (pattern, flags) => {
      let regex = "";
      for (let index = 0; index < pattern.length; index++) {
        const character = pattern[index];
        const nextCharacter = pattern[index + 1];
        const nextNextCharacter = pattern[index + 2];
        if (
          character === "*" &&
          nextCharacter === "*" &&
          nextNextCharacter === "/"
        ) {
          regex += "(?:.*/)?";
          index += 2;
          continue;
        }
        if (character === "*" && nextCharacter === "*") {
          regex += ".*";
          index += 1;
          continue;
        }
        if (character === "*") {
          regex += "[^/]*";
          continue;
        }
        if (character === "?") {
          regex += "[^/]";
          continue;
        }
        if (character === "[") {
          const closingBracketIndex = pattern.indexOf("]", index + 1);
          if (closingBracketIndex !== -1) {
            const bracketContent = pattern.slice(
              index + 1,
              closingBracketIndex,
            );
            if (bracketContent) {
              const negatedBracketContent =
                bracketContent[0] === "!"
                  ? `^${bracketContent.slice(1)}`
                  : bracketContent;
              regex += `[${negatedBracketContent}]`;
              index = closingBracketIndex;
              continue;
            }
          }
        }
        regex += /[|\\{}()[\]^$+?.]/.test(character)
          ? `\\${character}`
          : character;
      }
      try {
        return new _p_RegExpCtor(`^${regex}$`, flags);
      } catch {
        return /(?!)/;
      }
    };
    matchesIncludeIfCondition = (condition, gitDirectory, configFilePath) => {
      if (!gitDirectory) return false;
      const match = condition.match(/^(gitdir|gitdir\/i):(.*)$/i);
      if (!match) return false;
      const [, keyword, rawPattern] = match;
      const pattern = normalizeGitConfigConditionPattern(
        _p_StringPrototypeTrim(rawPattern),
        configFilePath,
      );
      const isCaseInsensitive =
        _p_StringPrototypeToLowerCase(keyword) === "gitdir/i";
      const regularExpression = gitConfigGlobToRegex(
        pattern,
        isCaseInsensitive ? "i" : void 0,
      );
      const normalizedGitDirectory = slash(
        node_path.default.resolve(gitDirectory),
      );
      return regularExpression.test(normalizedGitDirectory);
    };
    shouldIncludeConfigSection = (section, gitDirectory, configFilePath) => {
      if (_p_StringPrototypeToLowerCase(section) === "include") return true;
      const condition = parseIncludeIfCondition(section);
      return condition
        ? matchesIncludeIfCondition(condition, gitDirectory, configFilePath)
        : false;
    };
    createExcludesFileValue = (value, declaringFilePath) => ({
      value,
      declaringFilePath,
    });
    parseGitConfigForExcludesFile = (content, normalizedPath, gitDirectory) => {
      let currentSection;
      let excludesFile;
      const includePaths = [];
      for (const line of content.split(/\r?\n/)) {
        const trimmed = _p_StringPrototypeTrim(line);
        if (
          !trimmed ||
          _p_StringPrototypeStartsWith(trimmed, "#") ||
          _p_StringPrototypeStartsWith(trimmed, ";")
        )
          continue;
        if (_p_StringPrototypeStartsWith(trimmed, "[")) {
          currentSection = parseGitConfigSection(trimmed);
          continue;
        }
        const entry = parseGitConfigEntry(trimmed);
        if (!entry) continue;
        if (
          _p_StringPrototypeToLowerCase(currentSection) === "core" &&
          entry.key === "excludesfile"
        ) {
          excludesFile = createExcludesFileValue(entry.value, normalizedPath);
          continue;
        }
        if (
          shouldIncludeConfigSection(
            currentSection,
            gitDirectory,
            normalizedPath,
          ) &&
          entry.key === "path" &&
          entry.value
        )
          includePaths.push(resolveConfigPath(normalizedPath, entry.value));
      }
      return {
        excludesFile,
        includePaths,
      };
    };
    readGitConfigFile = (normalizedPath, readMethod, suppressErrors) => {
      try {
        return readMethod(normalizedPath, "utf8");
      } catch (error) {
        if (shouldSkipIgnoreFileError(error, suppressErrors)) return;
        throw createGitConfigReadError(normalizedPath, error);
      }
    };
    getExcludesFileFromGitConfigSync = (
      filePath,
      readFileSync,
      gitDirectory,
      options = {},
    ) => {
      const {
        suppressErrors,
        includeStack = /* @__PURE__ */ new _p_SetCtor(),
        depth = 0,
      } = options;
      const normalizedPath = node_path.default.resolve(filePath);
      if (includeStack.has(normalizedPath)) return;
      if (depth >= MAX_INCLUDE_DEPTH) return;
      includeStack.add(normalizedPath);
      const content = readGitConfigFile(
        normalizedPath,
        readFileSync,
        suppressErrors,
      );
      if (content === void 0) {
        includeStack.delete(normalizedPath);
        return;
      }
      let { excludesFile, includePaths } = parseGitConfigForExcludesFile(
        content,
        normalizedPath,
        gitDirectory,
      );
      for (const includePath of includePaths) {
        const includedExcludesFile = getExcludesFileFromGitConfigSync(
          includePath,
          readFileSync,
          gitDirectory,
          {
            suppressErrors,
            includeStack,
            depth: depth + 1,
          },
        );
        if (includedExcludesFile !== void 0)
          excludesFile = includedExcludesFile;
      }
      includeStack.delete(normalizedPath);
      return excludesFile;
    };
    getExcludesFileFromGitConfigAsync = async (
      filePath,
      readFile,
      gitDirectory,
      options = {},
    ) => {
      const {
        suppressErrors,
        includeStack = /* @__PURE__ */ new _p_SetCtor(),
        depth = 0,
      } = options;
      const normalizedPath = node_path.default.resolve(filePath);
      if (includeStack.has(normalizedPath)) return;
      if (depth >= MAX_INCLUDE_DEPTH) return;
      includeStack.add(normalizedPath);
      let content;
      try {
        content = await readFile(normalizedPath, "utf8");
      } catch (error) {
        includeStack.delete(normalizedPath);
        if (shouldSkipIgnoreFileError(error, suppressErrors)) return;
        throw createGitConfigReadError(normalizedPath, error);
      }
      let { excludesFile, includePaths } = parseGitConfigForExcludesFile(
        content,
        normalizedPath,
        gitDirectory,
      );
      for (const includePath of includePaths) {
        const includedExcludesFile = await getExcludesFileFromGitConfigAsync(
          includePath,
          readFile,
          gitDirectory,
          {
            suppressErrors,
            includeStack,
            depth: depth + 1,
          },
        );
        if (includedExcludesFile !== void 0)
          excludesFile = includedExcludesFile;
      }
      includeStack.delete(normalizedPath);
      return excludesFile;
    };
    resolveGitDirectoryFromFile = (gitFilePath, content) => {
      const match = content.match(/^gitdir:\s*(.+?)\s*$/i);
      if (!match) return gitFilePath;
      return node_path.default.resolve(
        node_path.default.dirname(gitFilePath),
        match[1],
      );
    };
    getGitDirectorySync = (gitRoot, readFileSync) => {
      if (!gitRoot) return;
      const gitFilePath = node_path.default.join(gitRoot, ".git");
      try {
        return resolveGitDirectoryFromFile(
          gitFilePath,
          readFileSync(gitFilePath, "utf8"),
        );
      } catch {
        return gitFilePath;
      }
    };
    getGitDirectoryAsync = async (gitRoot, readFile) => {
      if (!gitRoot) return;
      const gitFilePath = node_path.default.join(gitRoot, ".git");
      try {
        return resolveGitDirectoryFromFile(
          gitFilePath,
          await readFile(gitFilePath, "utf8"),
        );
      } catch {
        return gitFilePath;
      }
    };
    getXdgConfigHome = () =>
      node_process.default.env.XDG_CONFIG_HOME ||
      node_path.default.join(node_os.default.homedir(), ".config");
    getGitConfigPaths = () => {
      if ("GIT_CONFIG_GLOBAL" in node_process.default.env) {
        const value = node_process.default.env.GIT_CONFIG_GLOBAL;
        return value ? [value] : [];
      }
      return [
        node_path.default.join(getXdgConfigHome(), "git", "config"),
        node_path.default.join(node_os.default.homedir(), ".gitconfig"),
      ];
    };
    getDefaultGlobalGitignorePath = () =>
      node_path.default.join(getXdgConfigHome(), "git", "ignore");
    resolveExcludesFilePath = (excludesFileConfig) => {
      if (excludesFileConfig?.value === "") return;
      if (excludesFileConfig === void 0) return getDefaultGlobalGitignorePath();
      return resolveConfigPath(
        excludesFileConfig.declaringFilePath,
        excludesFileConfig.value,
      );
    };
    readGlobalGitignoreContent = (filePath, readMethod, suppressErrors) => {
      try {
        return {
          filePath,
          content: readMethod(filePath, "utf8"),
        };
      } catch (error) {
        if (shouldSkipIgnoreFileError(error, suppressErrors)) return;
        throw createIgnoreFileReadError(filePath, error);
      }
    };
    getGlobalGitignoreFile = (options = {}) => {
      const cwd = toPath(options.cwd) ?? node_process.default.cwd();
      const readFileSync = getReadFileSyncMethod(options.fs);
      const gitRoot = findGitRootSync(cwd, options.fs);
      const gitDirectory = getGitDirectorySync(gitRoot, readFileSync);
      let excludesFileConfig;
      for (const gitConfigPath of getGitConfigPaths()) {
        const value = getExcludesFileFromGitConfigSync(
          gitConfigPath,
          readFileSync,
          gitDirectory,
          { suppressErrors: options.suppressErrors },
        );
        if (value !== void 0) excludesFileConfig = value;
      }
      const filePath = resolveExcludesFilePath(excludesFileConfig);
      return filePath === void 0
        ? void 0
        : readGlobalGitignoreContent(
            filePath,
            readFileSync,
            options.suppressErrors,
          );
    };
    getGlobalGitignoreFileAsync = async (options = {}) => {
      const cwd = toPath(options.cwd) ?? node_process.default.cwd();
      const readFile = getReadFileMethod(options.fs);
      const gitRoot = await findGitRoot(cwd, options.fs);
      const gitDirectory = await getGitDirectoryAsync(gitRoot, readFile);
      const excludesFileConfig = (
        await _p_PromiseAll(
          getGitConfigPaths().map((gitConfigPath) =>
            getExcludesFileFromGitConfigAsync(
              gitConfigPath,
              readFile,
              gitDirectory,
              { suppressErrors: options.suppressErrors },
            ),
          ),
        )
      ).findLast((value) => value !== void 0);
      const filePath = resolveExcludesFilePath(excludesFileConfig);
      if (filePath === void 0) return;
      try {
        return {
          filePath,
          content: await readFile(filePath, "utf8"),
        };
      } catch (error) {
        if (shouldSkipIgnoreFileError(error, options.suppressErrors)) return;
        throw createIgnoreFileReadError(filePath, error);
      }
    };
    buildGlobalMatcher = (globalIgnoreFile, cwd, rootDirectory = cwd) => {
      const patterns = parseIgnoreFile(
        globalIgnoreFile,
        node_path.default.dirname(globalIgnoreFile.filePath),
      );
      return createIgnoreMatcher(patterns, cwd, rootDirectory);
    };
    getKnownIgnoreFilePaths = (patterns, normalizedOptions, gitRoot) => {
      if (![patterns].flat().includes("**/.gitignore")) return [];
      return gitRoot
        ? getParentGitignorePaths(gitRoot, normalizedOptions.cwd)
        : [node_path.default.join(normalizedOptions.cwd, ".gitignore")];
    };
    getKnownIgnoreFileSearchOptions = (patterns, normalizedOptions) => ({
      ...normalizedOptions,
      ignore: [
        ...normalizedOptions.ignore,
        ...[patterns]
          .flat()
          .filter((pattern) => isNegativePattern(pattern))
          .map((pattern) => pattern.slice(1)),
      ],
    });
    getKnownIgnoreFilePattern = (filePath, cwd) => {
      const pattern = isPathInside(filePath, cwd)
        ? node_path.default.relative(cwd, filePath)
        : filePath;
      return import_out$1.default.convertPathToPattern(pattern);
    };
    getMatchingKnownIgnoreFilePaths = (knownPaths, matchingPaths) => {
      const matchingPathSet = new _p_SetCtor(
        matchingPaths.map((filePath) => node_path.default.resolve(filePath)),
      );
      return knownPaths.filter((filePath) =>
        matchingPathSet.has(node_path.default.resolve(filePath)),
      );
    };
    globKnownIgnoreFilePaths = (
      globFunction,
      knownPaths,
      patterns,
      normalizedOptions,
    ) => {
      if (knownPaths.length === 0) return [];
      return globIgnoreFiles(
        globFunction,
        knownPaths.map((filePath) =>
          getKnownIgnoreFilePattern(filePath, normalizedOptions.cwd),
        ),
        getKnownIgnoreFileSearchOptions(patterns, normalizedOptions),
      );
    };
    filterKnownIgnoreFilePathsAsync = async (
      knownPaths,
      patterns,
      normalizedOptions,
    ) => {
      const matchingPaths = await globKnownIgnoreFilePaths(
        import_out$1.default,
        knownPaths,
        patterns,
        normalizedOptions,
      );
      return getMatchingKnownIgnoreFilePaths(knownPaths, matchingPaths);
    };
    filterKnownIgnoreFilePathsSync = (
      knownPaths,
      patterns,
      normalizedOptions,
    ) => {
      const matchingPaths = globKnownIgnoreFilePaths(
        import_out$1.default.sync,
        knownPaths,
        patterns,
        normalizedOptions,
      );
      return getMatchingKnownIgnoreFilePaths(knownPaths, matchingPaths);
    };
    getIgnoreFileSearchPrune = (
      searchPatterns,
      files,
      normalizedOptions,
      gitRoot,
    ) => {
      if (files.length === 0)
        return {
          patterns: [],
          guardNames: [],
        };
      const { cwd } = normalizedOptions;
      const baseDir = gitRoot || cwd;
      const ignorePatterns = getPatternsFromIgnoreFiles(files, baseDir);
      const matcher = createIgnoreMatcher(ignorePatterns, cwd, baseDir);
      const searchPatternsArray = [searchPatterns].flat();
      const gitignoreOnlySearch = searchPatternsArray.every(
        (pattern) => pattern === GITIGNORE_FILES_PATTERN,
      );
      const searchesForGitignoreFiles = searchPatternsArray.includes(
        GITIGNORE_FILES_PATTERN,
      );
      return buildPrunePatternsAndGuards(getIgnoreRules(files), matcher, cwd, {
        gitignoreOnlySearch,
        searchesForGitignoreFiles,
      });
    };
    withPrunedSearch = (normalizedOptions, prunePatterns) =>
      prunePatterns.length === 0
        ? normalizedOptions
        : {
            ...normalizedOptions,
            ignore: [...normalizedOptions.ignore, ...prunePatterns],
          };
    getUnreadPaths = (childPaths, knownPaths) => {
      const alreadyRead = new _p_SetCtor(
        knownPaths.map((filePath) => node_path.default.resolve(filePath)),
      );
      return dedupePaths(childPaths).filter(
        (filePath) => !alreadyRead.has(node_path.default.resolve(filePath)),
      );
    };
    collectIgnoreFileArtifactsAsync = async (
      patterns,
      options,
      includeParentIgnoreFiles,
    ) => {
      const normalizedOptions = normalizeOptions$1(options);
      const readFileMethod = getReadFileMethod(normalizedOptions.fs);
      const gitRoot = includeParentIgnoreFiles
        ? await findGitRoot(normalizedOptions.cwd, normalizedOptions.fs)
        : void 0;
      const knownPaths = await filterKnownIgnoreFilePathsAsync(
        getKnownIgnoreFilePaths(patterns, normalizedOptions, gitRoot),
        patterns,
        normalizedOptions,
      );
      const knownFiles = await readIgnoreFilesSafely(
        knownPaths,
        readFileMethod,
        normalizedOptions.suppressErrors,
      );
      const { patterns: prunePatterns, guardNames } = getIgnoreFileSearchPrune(
        patterns,
        knownFiles,
        normalizedOptions,
        gitRoot,
      );
      const childPaths = await globIgnoreFiles(
        import_out$1.default,
        patterns,
        withPrunedSearch(normalizedOptions, prunePatterns),
      );
      let childFiles = await readIgnoreFilesSafely(
        getUnreadPaths(childPaths, knownPaths),
        readFileMethod,
        normalizedOptions.suppressErrors,
      );
      if (negationsCouldRescue(getIgnoreRules(childFiles), guardNames)) {
        const allPaths = await globIgnoreFiles(
          import_out$1.default,
          patterns,
          normalizedOptions,
        );
        childFiles = await readIgnoreFilesSafely(
          getUnreadPaths(allPaths, knownPaths),
          readFileMethod,
          normalizedOptions.suppressErrors,
        );
      }
      return {
        files: [...knownFiles, ...childFiles],
        normalizedOptions,
        gitRoot,
      };
    };
    collectIgnoreFileArtifactsSync = (
      patterns,
      options,
      includeParentIgnoreFiles,
    ) => {
      const normalizedOptions = normalizeOptions$1(options);
      const readFileSyncMethod = getReadFileSyncMethod(normalizedOptions.fs);
      const gitRoot = includeParentIgnoreFiles
        ? findGitRootSync(normalizedOptions.cwd, normalizedOptions.fs)
        : void 0;
      const knownPaths = filterKnownIgnoreFilePathsSync(
        getKnownIgnoreFilePaths(patterns, normalizedOptions, gitRoot),
        patterns,
        normalizedOptions,
      );
      const knownFiles = readIgnoreFilesSafelySync(
        knownPaths,
        readFileSyncMethod,
        normalizedOptions.suppressErrors,
      );
      const { patterns: prunePatterns, guardNames } = getIgnoreFileSearchPrune(
        patterns,
        knownFiles,
        normalizedOptions,
        gitRoot,
      );
      const childPaths = globIgnoreFiles(
        import_out$1.default.sync,
        patterns,
        withPrunedSearch(normalizedOptions, prunePatterns),
      );
      let childFiles = readIgnoreFilesSafelySync(
        getUnreadPaths(childPaths, knownPaths),
        readFileSyncMethod,
        normalizedOptions.suppressErrors,
      );
      if (negationsCouldRescue(getIgnoreRules(childFiles), guardNames)) {
        const allPaths = globIgnoreFiles(
          import_out$1.default.sync,
          patterns,
          normalizedOptions,
        );
        childFiles = readIgnoreFilesSafelySync(
          getUnreadPaths(allPaths, knownPaths),
          readFileSyncMethod,
          normalizedOptions.suppressErrors,
        );
      }
      return {
        files: [...knownFiles, ...childFiles],
        normalizedOptions,
        gitRoot,
      };
    };
    getPatternsFromIgnoreFiles = (files, baseDir) =>
      _p_ArrayPrototypeFlatMap(files, (file) => parseIgnoreFile(file, baseDir));
    getIgnorePatternsAndPredicate = async (
      patterns,
      options,
      includeParentIgnoreFiles = false,
    ) => {
      const { files, normalizedOptions, gitRoot } =
        await collectIgnoreFileArtifactsAsync(
          patterns,
          options,
          includeParentIgnoreFiles,
        );
      return buildIgnoreResult(files, normalizedOptions, gitRoot);
    };
    getIgnorePatternsAndPredicateSync = (
      patterns,
      options,
      includeParentIgnoreFiles = false,
    ) => {
      const { files, normalizedOptions, gitRoot } =
        collectIgnoreFileArtifactsSync(
          patterns,
          options,
          includeParentIgnoreFiles,
        );
      return buildIgnoreResult(files, normalizedOptions, gitRoot);
    };
  });
  var import_out;
  var assertPatternsInput;
  var getStatMethod;
  var getStatSyncMethod;
  var isDirectory;
  var isDirectorySync;
  var normalizePathForDirectoryGlob;
  var shouldExpandGlobstarDirectory;
  var getDirectoryGlob;
  var directoryToGlob;
  var directoryToGlobSync;
  var toPatternsArray;
  var checkCwdOption;
  var normalizeOptions;
  var normalizeArguments;
  var normalizeArgumentsSync;
  var getIgnoreFilesPatterns;
  var isPathIgnored;
  var hasIgnoredAncestorDirectory;
  var combinePredicate;
  var buildIgnoreFilterResult;
  var getIgnoreFileSearchOptions;
  var applyIgnoreFilesAndGetFilter;
  var applyIgnoreFilesAndGetFilterSync;
  var assertGlobalGitignoreSyncSupport;
  var globalGitignoreAsyncStatErrorMessage;
  var assertGlobalGitignoreAsyncSupport;
  var createPathResolver;
  var createAsyncDirectoryCheck;
  var createDirectoryCheck;
  var createFilterFunctionAsync;
  var createFilterFunction;
  var unionFastGlobResults;
  var unionFastGlobResultsAsync;
  var convertNegativePatterns;
  var applyParentDirectoryIgnoreAdjustments;
  var appendPruneIgnorePatterns;
  var normalizeExpandDirectoriesOption;
  var generateTasks;
  var generateTasksSync;
  var globby;
  var globbySync;
  var convertPathToPattern;
  var init_globby = __esmMin(() => {
    init_merge_streams();
    import_out = /* @__PURE__ */ __toESM(require_out(), 1);
    init_node();
    init_ignore();
    init_utilities();
    assertPatternsInput = (patterns) => {
      if (patterns.some((pattern) => typeof pattern !== "string"))
        throw new _p_TypeErrorCtor(
          "Patterns must be a string or an array of strings",
        );
    };
    getStatMethod = (fsImplementation) => {
      if (fsImplementation)
        return (
          bindFsMethod(fsImplementation.promises, "stat") ??
          promisifyFsMethod(fsImplementation, "stat")
        );
      return bindFsMethod(node_fs.default.promises, "stat");
    };
    getStatSyncMethod = (fsImplementation) =>
      bindFsMethod(fsImplementation, "statSync") ??
      bindFsMethod(node_fs.default, "statSync");
    isDirectory = async (path, fsImplementation) => {
      try {
        return (await getStatMethod(fsImplementation)(path)).isDirectory();
      } catch {
        return false;
      }
    };
    isDirectorySync = (path, fsImplementation) => {
      try {
        return getStatSyncMethod(fsImplementation)(path).isDirectory();
      } catch {
        return false;
      }
    };
    normalizePathForDirectoryGlob = (filePath, cwd) => {
      const path = isNegativePattern(filePath) ? filePath.slice(1) : filePath;
      return node_path.default.isAbsolute(path)
        ? path
        : node_path.default.join(cwd, path);
    };
    shouldExpandGlobstarDirectory = (pattern) => {
      const match = pattern?.match(/\*\*\/([^/]+)$/);
      if (!match) return false;
      const dirname = match[1];
      const hasWildcards = /[*?[\]{}]/.test(dirname);
      const hasExtension =
        node_path.default.extname(dirname) &&
        !_p_StringPrototypeStartsWith(dirname, ".");
      return !hasWildcards && !hasExtension;
    };
    getDirectoryGlob = ({ directoryPath, files, extensions }) => {
      const extensionGlob =
        extensions?.length > 0
          ? `.${extensions.length > 1 ? `{${extensions.join(",")}}` : extensions[0]}`
          : "";
      return files
        ? files.map((file) =>
            node_path.default.posix.join(
              directoryPath,
              `**/${node_path.default.extname(file) ? file : `${file}${extensionGlob}`}`,
            ),
          )
        : [
            node_path.default.posix.join(
              directoryPath,
              `**${extensionGlob ? `/*${extensionGlob}` : ""}`,
            ),
          ];
    };
    directoryToGlob = async (
      directoryPaths,
      {
        cwd = node_process.default.cwd(),
        files,
        extensions,
        fs: fsImplementation,
      } = {},
    ) => {
      return (
        await _p_PromiseAll(
          directoryPaths.map(async (directoryPath) => {
            const checkPattern = isNegativePattern(directoryPath)
              ? directoryPath.slice(1)
              : directoryPath;
            if (shouldExpandGlobstarDirectory(checkPattern))
              return getDirectoryGlob({
                directoryPath,
                files,
                extensions,
              });
            const pathToCheck = normalizePathForDirectoryGlob(
              directoryPath,
              cwd,
            );
            return (await isDirectory(pathToCheck, fsImplementation))
              ? getDirectoryGlob({
                  directoryPath,
                  files,
                  extensions,
                })
              : directoryPath;
          }),
        )
      ).flat();
    };
    directoryToGlobSync = (
      directoryPaths,
      {
        cwd = node_process.default.cwd(),
        files,
        extensions,
        fs: fsImplementation,
      } = {},
    ) =>
      _p_ArrayPrototypeFlatMap(directoryPaths, (directoryPath) => {
        const checkPattern = isNegativePattern(directoryPath)
          ? directoryPath.slice(1)
          : directoryPath;
        if (shouldExpandGlobstarDirectory(checkPattern))
          return getDirectoryGlob({
            directoryPath,
            files,
            extensions,
          });
        const pathToCheck = normalizePathForDirectoryGlob(directoryPath, cwd);
        return isDirectorySync(pathToCheck, fsImplementation)
          ? getDirectoryGlob({
              directoryPath,
              files,
              extensions,
            })
          : directoryPath;
      });
    toPatternsArray = (patterns) => {
      patterns = [...new _p_SetCtor([patterns].flat())];
      assertPatternsInput(patterns);
      return patterns;
    };
    checkCwdOption = (cwd, fsImplementation = node_fs.default) => {
      if (!cwd || !fsImplementation.statSync) return;
      let stats;
      try {
        stats = fsImplementation.statSync(cwd);
      } catch {
        return;
      }
      if (!stats.isDirectory())
        throw new _p_ErrorCtor(
          `The \`cwd\` option must be a path to a directory, got: ${cwd}`,
        );
    };
    normalizeOptions = (options = {}) => {
      const ignore = options.ignore
        ? _p_ArrayIsArray(options.ignore)
          ? options.ignore
          : [options.ignore]
        : [];
      options = {
        ...options,
        ignore,
        expandDirectories: options.expandDirectories ?? true,
        cwd: toPath(options.cwd),
      };
      checkCwdOption(options.cwd, options.fs);
      return options;
    };
    normalizeArguments = (function_) => async (patterns, options) =>
      function_(toPatternsArray(patterns), normalizeOptions(options));
    normalizeArgumentsSync = (function_) => (patterns, options) =>
      function_(toPatternsArray(patterns), normalizeOptions(options));
    getIgnoreFilesPatterns = (options) => {
      const { ignoreFiles, gitignore } = options;
      const patterns = ignoreFiles ? toPatternsArray(ignoreFiles) : [];
      if (gitignore) patterns.push(GITIGNORE_FILES_PATTERN);
      return patterns;
    };
    isPathIgnored = (matcher, globalMatcher, path) => {
      const globalResult = globalMatcher ? globalMatcher(path) : void 0;
      const result = matcher ? matcher(path) : void 0;
      if (result?.unignored) return false;
      return Boolean(result?.ignored || globalResult?.ignored);
    };
    hasIgnoredAncestorDirectory = (matcher, globalMatcher, file) => {
      let currentPath = file;
      while (true) {
        const parentDirectory = node_path.default.dirname(currentPath);
        if (parentDirectory === currentPath) return false;
        if (
          isPathIgnored(
            matcher,
            globalMatcher,
            `${parentDirectory}${node_path.default.sep}`,
          )
        )
          return true;
        currentPath = parentDirectory;
      }
    };
    combinePredicate = (matcher, globalMatcher) => {
      if (!matcher && !globalMatcher) return false;
      return (file) => {
        if ((matcher ? matcher(file) : void 0)?.unignored)
          return (
            (globalMatcher ? globalMatcher(file) : void 0)?.ignored &&
            hasIgnoredAncestorDirectory(matcher, globalMatcher, file)
          );
        return isPathIgnored(matcher, globalMatcher, file);
      };
    };
    buildIgnoreFilterResult = ({
      options,
      cwd,
      ignoreResult: { rules, matcher },
      globalMatcher,
      createFilter,
    }) => {
      const finalPredicate = combinePredicate(matcher, globalMatcher);
      return {
        options,
        pruneIgnorePatterns: convertPatternsForFastGlob(rules, matcher, cwd),
        filter: createFilter(finalPredicate, cwd, options.fs),
      };
    };
    getIgnoreFileSearchOptions = (options, searchPatterns) => ({
      ...options,
      ignore: convertIgnorePatternsForIgnoreFileSearch(
        options.ignore,
        searchPatterns,
      ),
    });
    applyIgnoreFilesAndGetFilter = async (options) => {
      const cwd = options.cwd ?? node_process.default.cwd();
      const ignoreFilesPatterns = getIgnoreFilesPatterns(options);
      const globalIgnoreFile = options.globalGitignore
        ? await getGlobalGitignoreFileAsync(options)
        : void 0;
      if (ignoreFilesPatterns.length === 0 && !globalIgnoreFile)
        return {
          options,
          pruneIgnorePatterns: [],
          filter: createFilterFunctionAsync(false, cwd, options.fs),
        };
      const includeParentIgnoreFiles = options.gitignore === true;
      const ignoreResult =
        ignoreFilesPatterns.length > 0
          ? await getIgnorePatternsAndPredicate(
              ignoreFilesPatterns,
              getIgnoreFileSearchOptions(options, ignoreFilesPatterns),
              includeParentIgnoreFiles,
            )
          : {
              rules: [],
              matcher: false,
            };
      const globalGitRoot = globalIgnoreFile
        ? await findGitRoot(cwd, options.fs)
        : void 0;
      const globalMatcher = globalIgnoreFile
        ? buildGlobalMatcher(globalIgnoreFile, cwd, globalGitRoot ?? cwd)
        : void 0;
      return buildIgnoreFilterResult({
        options,
        cwd,
        ignoreResult,
        globalMatcher,
        createFilter: createFilterFunctionAsync,
      });
    };
    applyIgnoreFilesAndGetFilterSync = (options) => {
      const cwd = options.cwd ?? node_process.default.cwd();
      const ignoreFilesPatterns = getIgnoreFilesPatterns(options);
      const globalIgnoreFile = options.globalGitignore
        ? getGlobalGitignoreFile(options)
        : void 0;
      if (ignoreFilesPatterns.length === 0 && !globalIgnoreFile)
        return {
          options,
          pruneIgnorePatterns: [],
          filter: createFilterFunction(false, cwd, options.fs),
        };
      const includeParentIgnoreFiles = options.gitignore === true;
      const ignoreResult =
        ignoreFilesPatterns.length > 0
          ? getIgnorePatternsAndPredicateSync(
              ignoreFilesPatterns,
              getIgnoreFileSearchOptions(options, ignoreFilesPatterns),
              includeParentIgnoreFiles,
            )
          : {
              rules: [],
              matcher: false,
            };
      const globalGitRoot = globalIgnoreFile
        ? findGitRootSync(cwd, options.fs)
        : void 0;
      const globalMatcher = globalIgnoreFile
        ? buildGlobalMatcher(globalIgnoreFile, cwd, globalGitRoot ?? cwd)
        : void 0;
      return buildIgnoreFilterResult({
        options,
        cwd,
        ignoreResult,
        globalMatcher,
        createFilter: createFilterFunction,
      });
    };
    assertGlobalGitignoreSyncSupport = (options) => {
      if (options.globalGitignore && options.fs && !options.fs.statSync)
        throw new _p_ErrorCtor(
          "The `globalGitignore` option in `globbySync()` requires `fs.statSync` when a custom `fs` is provided.",
        );
    };
    globalGitignoreAsyncStatErrorMessage =
      "The `globalGitignore` option in `globby()` and `globbyStream()` requires `fs.promises.stat` or `fs.stat` when a custom `fs` is provided.";
    assertGlobalGitignoreAsyncSupport = (options) => {
      if (!options.globalGitignore || !options.fs) return;
      if (!options.fs.promises?.stat && !options.fs.stat)
        throw new _p_ErrorCtor(globalGitignoreAsyncStatErrorMessage);
    };
    createPathResolver = (cwd) => {
      const basePath = cwd || node_process.default.cwd();
      const pathCache = /* @__PURE__ */ new _p_MapCtor();
      return (pathKey) => {
        let absolutePath = pathCache.get(pathKey);
        if (absolutePath === void 0) {
          if (pathCache.size > 1e4) pathCache.clear();
          absolutePath = node_path.default.isAbsolute(pathKey)
            ? pathKey
            : node_path.default.resolve(basePath, pathKey);
          pathCache.set(pathKey, absolutePath);
        }
        return absolutePath;
      };
    };
    createAsyncDirectoryCheck = (fsMethod) => {
      const directoryCache = /* @__PURE__ */ new _p_MapCtor();
      return async (absolutePath) => {
        let isDirectory = directoryCache.get(absolutePath);
        if (isDirectory !== void 0) return isDirectory;
        try {
          const stats = await fsMethod?.(absolutePath);
          isDirectory = Boolean(stats?.isDirectory());
        } catch {
          isDirectory = false;
        }
        if (directoryCache.size > 1e4) directoryCache.clear();
        directoryCache.set(absolutePath, isDirectory);
        return isDirectory;
      };
    };
    createDirectoryCheck = (fsMethod) => {
      const directoryCache = /* @__PURE__ */ new _p_MapCtor();
      return (absolutePath) => {
        let isDirectory = directoryCache.get(absolutePath);
        if (isDirectory !== void 0) return isDirectory;
        try {
          isDirectory = Boolean(fsMethod?.(absolutePath)?.isDirectory());
        } catch {
          isDirectory = false;
        }
        if (directoryCache.size > 1e4) directoryCache.clear();
        directoryCache.set(absolutePath, isDirectory);
        return isDirectory;
      };
    };
    createFilterFunctionAsync = (isIgnored, cwd, fsImplementation) => {
      const resolveAbsolutePath = createPathResolver(cwd);
      const isDirectoryEntry = createAsyncDirectoryCheck(
        getStatMethod(fsImplementation),
      );
      return async (fastGlobResult) => {
        if (!isIgnored) return true;
        const absolutePath = resolveAbsolutePath(
          node_path.default.normalize(fastGlobResult.path ?? fastGlobResult),
        );
        if (isIgnored(absolutePath)) return false;
        return !(
          (await isDirectoryEntry(absolutePath)) &&
          isIgnored(`${absolutePath}${node_path.default.sep}`)
        );
      };
    };
    createFilterFunction = (isIgnored, cwd, fsImplementation) => {
      const seen = /* @__PURE__ */ new _p_SetCtor();
      const resolveAbsolutePath = createPathResolver(cwd);
      const isDirectoryEntry = createDirectoryCheck(
        getStatSyncMethod(fsImplementation),
      );
      return (fastGlobResult) => {
        const pathKey = node_path.default.normalize(
          fastGlobResult.path ?? fastGlobResult,
        );
        if (seen.has(pathKey)) return false;
        if (isIgnored) {
          const absolutePath = resolveAbsolutePath(pathKey);
          if (isIgnored(absolutePath)) return false;
          if (
            isDirectoryEntry(absolutePath) &&
            isIgnored(`${absolutePath}${node_path.default.sep}`)
          )
            return false;
        }
        seen.add(pathKey);
        return true;
      };
    };
    unionFastGlobResults = (results, filter) =>
      _p_ArrayPrototypeFlat(results).filter((fastGlobResult) =>
        filter(fastGlobResult),
      );
    unionFastGlobResultsAsync = async (results, filter) => {
      results = _p_ArrayPrototypeFlat(results);
      const matches = await _p_PromiseAll(
        results.map((fastGlobResult) => filter(fastGlobResult)),
      );
      const seen = /* @__PURE__ */ new _p_SetCtor();
      return results.filter((fastGlobResult, index) => {
        if (!matches[index]) return false;
        const pathKey = node_path.default.normalize(
          fastGlobResult.path ?? fastGlobResult,
        );
        if (seen.has(pathKey)) return false;
        seen.add(pathKey);
        return true;
      });
    };
    convertNegativePatterns = (patterns, options) => {
      if (
        patterns.length > 0 &&
        patterns.every((pattern) => isNegativePattern(pattern))
      ) {
        if (options.expandNegationOnlyPatterns === false) return [];
        patterns = ["**/*", ...patterns];
      }
      const positiveAbsolutePathPrefixes = [];
      let hasRelativePositivePattern = false;
      const normalizedPatterns = [];
      for (const pattern of patterns) {
        if (isNegativePattern(pattern)) {
          normalizedPatterns.push(
            `!${normalizeNegativePattern(pattern.slice(1), positiveAbsolutePathPrefixes, hasRelativePositivePattern)}`,
          );
          continue;
        }
        normalizedPatterns.push(pattern);
        const staticAbsolutePathPrefix = getStaticAbsolutePathPrefix(pattern);
        if (staticAbsolutePathPrefix === void 0) {
          hasRelativePositivePattern = true;
          continue;
        }
        positiveAbsolutePathPrefixes.push(staticAbsolutePathPrefix);
      }
      patterns = normalizedPatterns;
      const tasks = [];
      while (patterns.length > 0) {
        const index = patterns.findIndex((pattern) =>
          isNegativePattern(pattern),
        );
        if (index === -1) {
          tasks.push({
            patterns,
            options,
          });
          break;
        }
        const ignorePattern = patterns[index].slice(1);
        for (const task of tasks) task.options.ignore.push(ignorePattern);
        if (index !== 0)
          tasks.push({
            patterns: patterns.slice(0, index),
            options: {
              ...options,
              ignore: [...options.ignore, ignorePattern],
            },
          });
        patterns = patterns.slice(index + 1);
      }
      return tasks;
    };
    applyParentDirectoryIgnoreAdjustments = (tasks) =>
      tasks.map((task) => ({
        patterns: task.patterns,
        options: {
          ...task.options,
          ignore: adjustIgnorePatternsForParentDirectories(
            task.patterns,
            task.options.ignore,
          ),
        },
      }));
    appendPruneIgnorePatterns = (tasks, pruneIgnorePatterns) =>
      pruneIgnorePatterns.length === 0
        ? tasks
        : tasks.map((task) => ({
            patterns: task.patterns,
            options: {
              ...task.options,
              ignore: [...task.options.ignore, ...pruneIgnorePatterns],
            },
          }));
    normalizeExpandDirectoriesOption = (options, cwd) => ({
      ...(cwd ? { cwd } : {}),
      ...(_p_ArrayIsArray(options) ? { files: options } : options),
    });
    generateTasks = async (patterns, options, pruneIgnorePatterns = []) => {
      const globTasks = convertNegativePatterns(patterns, options);
      const { cwd, expandDirectories, fs: fsImplementation } = options;
      if (!expandDirectories)
        return appendPruneIgnorePatterns(
          applyParentDirectoryIgnoreAdjustments(globTasks),
          pruneIgnorePatterns,
        );
      const directoryToGlobOptions = {
        ...normalizeExpandDirectoriesOption(expandDirectories, cwd),
        fs: fsImplementation,
      };
      const tasks = await _p_PromiseAll(
        globTasks.map(async (task) => {
          let { patterns, options } = task;
          [patterns, options.ignore] = await _p_PromiseAll([
            directoryToGlob(patterns, directoryToGlobOptions),
            directoryToGlob(options.ignore, {
              cwd,
              fs: fsImplementation,
            }),
          ]);
          options.ignore = adjustIgnorePatternsForParentDirectories(
            patterns,
            options.ignore,
          );
          return {
            patterns,
            options,
          };
        }),
      );
      return appendPruneIgnorePatterns(tasks, pruneIgnorePatterns);
    };
    generateTasksSync = (patterns, options, pruneIgnorePatterns = []) => {
      const globTasks = convertNegativePatterns(patterns, options);
      const { cwd, expandDirectories, fs: fsImplementation } = options;
      if (!expandDirectories)
        return appendPruneIgnorePatterns(
          applyParentDirectoryIgnoreAdjustments(globTasks),
          pruneIgnorePatterns,
        );
      const directoryToGlobSyncOptions = {
        ...normalizeExpandDirectoriesOption(expandDirectories, cwd),
        fs: fsImplementation,
      };
      const tasks = globTasks.map((task) => {
        let { patterns, options } = task;
        patterns = directoryToGlobSync(patterns, directoryToGlobSyncOptions);
        options.ignore = directoryToGlobSync(options.ignore, {
          cwd,
          fs: fsImplementation,
        });
        options.ignore = adjustIgnorePatternsForParentDirectories(
          patterns,
          options.ignore,
        );
        return {
          patterns,
          options,
        };
      });
      return appendPruneIgnorePatterns(tasks, pruneIgnorePatterns);
    };
    globby = normalizeArguments(async (patterns, options) => {
      assertGlobalGitignoreAsyncSupport(options);
      const {
        options: modifiedOptions,
        pruneIgnorePatterns,
        filter,
      } = await applyIgnoreFilesAndGetFilter(options);
      const tasks = await generateTasks(
        patterns,
        modifiedOptions,
        pruneIgnorePatterns,
      );
      const results = await _p_PromiseAll(
        tasks.map((task) =>
          (0, import_out.default)(task.patterns, task.options),
        ),
      );
      return unionFastGlobResultsAsync(results, filter);
    });
    globbySync = normalizeArgumentsSync((patterns, options) => {
      assertGlobalGitignoreSyncSupport(options);
      const {
        options: modifiedOptions,
        pruneIgnorePatterns,
        filter,
      } = applyIgnoreFilesAndGetFilterSync(options);
      const results = generateTasksSync(
        patterns,
        modifiedOptions,
        pruneIgnorePatterns,
      ).map((task) => import_out.default.sync(task.patterns, task.options));
      return unionFastGlobResults(results, filter);
    });
    normalizeArgumentsSync((patterns, options) => {
      assertGlobalGitignoreAsyncSupport(options);
      const seen = /* @__PURE__ */ new _p_SetCtor();
      return node_stream.Readable.from(
        (async function* () {
          const {
            options: modifiedOptions,
            pruneIgnorePatterns,
            filter,
          } = await applyIgnoreFilesAndGetFilter(options);
          const tasks = await generateTasks(
            patterns,
            modifiedOptions,
            pruneIgnorePatterns,
          );
          if (tasks.length === 0) return;
          const streams = tasks.map((task) =>
            import_out.default.stream(task.patterns, task.options),
          );
          for await (const fastGlobResult of mergeStreams(streams)) {
            const pathKey = node_path.default.normalize(
              fastGlobResult.path ?? fastGlobResult,
            );
            if (!seen.has(pathKey) && (await filter(fastGlobResult))) {
              seen.add(pathKey);
              yield fastGlobResult;
            }
          }
        })(),
      );
    });
    normalizeArgumentsSync((patterns, options) =>
      patterns.some((pattern) =>
        import_out.default.isDynamicPattern(pattern, options),
      ),
    );
    normalizeArguments(generateTasks);
    normalizeArgumentsSync(generateTasksSync);
    ({ convertPathToPattern } = import_out.default);
  });
  function isPathCwd(path_) {
    let cwd = node_process.default.cwd();
    path_ = node_path.default.resolve(path_);
    if (node_process.default.platform === "win32") {
      cwd = _p_StringPrototypeToLowerCase(cwd);
      path_ = _p_StringPrototypeToLowerCase(path_);
    }
    return path_ === cwd;
  }
  var init_is_path_cwd = __esmMin(() => {});
  async function pMap(
    iterable,
    mapper,
    { concurrency = Number.POSITIVE_INFINITY, stopOnError = true, signal } = {},
  ) {
    return new _p_PromiseCtor((resolve_, reject_) => {
      if (
        iterable[Symbol.iterator] === void 0 &&
        iterable[Symbol.asyncIterator] === void 0
      )
        throw new _p_TypeErrorCtor(
          `Expected \`input\` to be either an \`Iterable\` or \`AsyncIterable\`, got (${typeof iterable})`,
        );
      if (typeof mapper !== "function")
        throw new _p_TypeErrorCtor("Mapper function is required");
      if (
        !(
          (_p_NumberIsSafeInteger(concurrency) && concurrency >= 1) ||
          concurrency === Number.POSITIVE_INFINITY
        )
      )
        throw new _p_TypeErrorCtor(
          `Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`,
        );
      const result = [];
      const errors = [];
      const skippedIndexesMap = /* @__PURE__ */ new _p_MapCtor();
      let isRejected = false;
      let isResolved = false;
      let isIterableDone = false;
      let resolvingCount = 0;
      let currentIndex = 0;
      const iterator =
        iterable[Symbol.asyncIterator] === void 0
          ? iterable[Symbol.iterator]()
          : iterable[Symbol.asyncIterator]();
      const signalListener = () => {
        reject(signal.reason);
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", signalListener);
      };
      const resolve = (value) => {
        resolve_(value);
        cleanup();
      };
      const reject = (reason) => {
        if (isResolved) return;
        isRejected = true;
        isResolved = true;
        reject_(reason);
        cleanup();
        if (!isIterableDone) closeIterator(iterator);
      };
      if (signal) {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", signalListener, { once: true });
      }
      const next = async () => {
        if (isResolved) return;
        const nextItem = isIterableDone
          ? { done: true }
          : await iterator.next();
        const index = currentIndex;
        currentIndex++;
        if (nextItem.done) {
          isIterableDone = true;
          if (resolvingCount === 0 && !isResolved) {
            if (!stopOnError && errors.length > 0) {
              reject(new _p_AggregateErrorCtor(errors));
              return;
            }
            isResolved = true;
            if (skippedIndexesMap.size === 0) {
              resolve(result);
              return;
            }
            const pureResult = [];
            for (const [index, value] of result.entries()) {
              if (skippedIndexesMap.get(index) === pMapSkip) continue;
              pureResult.push(value);
            }
            resolve(pureResult);
          }
          return;
        }
        resolvingCount++;
        (async () => {
          try {
            const element = await nextItem.value;
            if (isResolved) return;
            const value = await mapper(element, index);
            if (value === pMapSkip) skippedIndexesMap.set(index, value);
            result[index] = value;
          } catch (error) {
            if (stopOnError) {
              reject(error);
              return;
            }
            errors.push(error);
          }
          resolvingCount--;
          try {
            await next();
          } catch (error) {
            reject(error);
          }
        })();
      };
      (async () => {
        for (let index = 0; index < concurrency; index++) {
          try {
            await next();
          } catch (error) {
            reject(error);
            break;
          }
          if (isIterableDone || isRejected) break;
        }
      })();
    });
  }
  async function closeIterator(iterator) {
    try {
      await iterator.return?.();
    } catch {}
  }
  var pMapSkip;
  var init_p_map = __esmMin(() => {
    pMapSkip = Symbol("skip");
  });
  var toString;
  var PresentableError;
  var init_presentable_error = __esmMin(() => {
    ({ toString } = Object.prototype);
    PresentableError = class PresentableError extends Error {
      constructor(message, { cause } = {}) {
        super();
        if (message instanceof PresentableError) return message;
        if (typeof message !== "string")
          throw new _p_TypeErrorCtor("Message required.");
        this.name = "PresentableError";
        this.message = message;
        this.cause = cause;
      }
      get isPresentable() {
        return true;
      }
    };
  });
  var del_exports = /* @__PURE__ */ __exportAll({
    deleteAsync: () => deleteAsync$1,
    deleteSync: () => deleteSync$1,
  });
  function safeCheck(file, cwd) {
    if (isPathCwd(file))
      throw new PresentableError(
        "Cannot delete the current working directory. Can be overridden with the `force` option.",
      );
    if (!isPathInside(file, cwd))
      throw new PresentableError(
        "Cannot delete files/directories outside the current working directory. Can be overridden with the `force` option.",
      );
  }
  function normalizePatterns(patterns) {
    patterns = _p_ArrayIsArray(patterns) ? patterns : [patterns];
    patterns = patterns.map((pattern) => {
      if (
        node_process.default.platform === "win32" &&
        (0, import_is_glob.default)(pattern) === false
      )
        return slash(pattern);
      return pattern;
    });
    return patterns;
  }
  async function deleteAsync$1(
    patterns,
    {
      force,
      dryRun,
      cwd = node_process.default.cwd(),
      onProgress = () => {},
      ...options
    } = {},
  ) {
    options = {
      expandDirectories: false,
      onlyFiles: false,
      followSymbolicLinks: false,
      cwd,
      ...options,
    };
    patterns = normalizePatterns(patterns);
    const files = (await globby(patterns, options)).sort((a, b) =>
      _p_StringPrototypeLocaleCompare(b, a),
    );
    if (files.length === 0)
      onProgress({
        totalCount: 0,
        deletedCount: 0,
        percent: 1,
      });
    let deletedCount = 0;
    const mapper = async (file) => {
      file = node_path.default.resolve(cwd, file);
      if (!force) safeCheck(file, cwd);
      if (!dryRun)
        await node_fs_promises.default.rm(file, {
          recursive: true,
          force: true,
        });
      deletedCount += 1;
      onProgress({
        totalCount: files.length,
        deletedCount,
        percent: deletedCount / files.length,
        path: file,
      });
      return file;
    };
    const removedFiles = await pMap(files, mapper, options);
    removedFiles.sort((a, b) => _p_StringPrototypeLocaleCompare(a, b));
    return removedFiles;
  }
  function deleteSync$1(
    patterns,
    { force, dryRun, cwd = node_process.default.cwd(), ...options } = {},
  ) {
    options = {
      expandDirectories: false,
      onlyFiles: false,
      followSymbolicLinks: false,
      cwd,
      ...options,
    };
    patterns = normalizePatterns(patterns);
    const removedFiles = globbySync(patterns, options)
      .sort((a, b) => _p_StringPrototypeLocaleCompare(b, a))
      .map((file) => {
        file = node_path.default.resolve(cwd, file);
        if (!force) safeCheck(file, cwd);
        if (!dryRun)
          node_fs.default.rmSync(file, {
            recursive: true,
            force: true,
          });
        return file;
      });
    removedFiles.sort((a, b) => _p_StringPrototypeLocaleCompare(a, b));
    return removedFiles;
  }
  var import_is_glob;
  var init_del = __esmMin(() => {
    init_globby();
    import_is_glob = /* @__PURE__ */ __toESM(require_is_glob(), 1);
    init_is_path_cwd();
    init_is_path_inside();
    init_p_map();
    init_slash();
    init_presentable_error();
    __name(deleteAsync$1, "deleteAsync");
    __name(deleteSync$1, "deleteSync");
  });
  const picomatch = require_picomatch();
  const { deleteAsync, deleteSync } = (init_del(), __toCommonJS(del_exports));
  const fastGlob = require_out();
  const del = {
    deleteAsync,
    deleteSync,
  };
  const glob = fastGlob.globStream
    ? {
        glob: fastGlob,
        globStream: fastGlob.globStream,
        globSync: fastGlob.sync,
      }
    : fastGlob;
  module.exports = {
    del,
    glob,
    picomatch,
  };
});

var require_del = /* @__PURE__ */ __commonJSMin$1((exports, module) => {
  const { del } = require_pico_pack();
  module.exports = del;
});

var require_safe = /* @__PURE__ */ __commonJSMin$1((exports) => {
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const require_node_fs = require_fs$4();
  const require_arrays_predicates = require_predicates$1();
  const require_paths_shared = require_shared$2();
  const require_objects_mutate = require_mutate();
  const require_primordials_array = require_array$1();
  const require_errors_predicates = require_predicates$2();
  const require_primordials_globals = require_globals();
  const require_promises_retry = require_retry();
  const require_fs_shared = require_shared();
  /**
   * @file Safe deletion + idempotent directory creation. The delete helpers gate
   *   destructive operations behind an "allowed directories" allow-list (temp
   *   dir, cacache dir, ~/.socket). A path outside those either names its own
   *   root via `allowedDirs` or `cwd`, which keeps containment enforced against
   *   the named tree, or calls `forceDelete`, which drops the boundary
   *   altogether. Three names, widest to narrowest: `forceDelete` ignores
   *   location, `safeDelete` widens by location, `strictDelete` refuses a
   *   root-resolving target outright. Forcing is a NAME rather than an option so
   *   a linter can match it at the call site and a reader can grep it. The mkdir
   *   helpers default to `recursive: true` and swallow `EEXIST` so concurrent
   *   callers don't race-condition each other. The allow-list carries each
   *   directory twice — as `path.resolve` returns it and as its real path —
   *   because a symlinked component makes those differ and a caller may hold
   *   either. On macOS, `os.tmpdir()` can contain a symlinked component. Walking
   *   or globbing the temp tree can return its real path instead. Both forms must
   *   match the allowed tree. The two forms are computed once per process and
   *   cached, so this costs a handful of `realpathSync` calls at first use and
   *   plain string comparisons thereafter. The target path is deliberately NOT
   *   resolved per call: that would put a syscall on every delete and need a
   *   cache keyed by caller input, which is the kind that grows without bound.
   *
   * @warning `forceDelete`/`forceDeleteSync` drop the boundary that stands
   *   between a delete and a working checkout. `socket/no-force-delete` flags
   *   every call, so clearing it takes an explicit escape comment. AI agents:
   *   ask the operator before reaching for either, and name what you intend to
   *   delete - `safeDelete` with `allowedDirs`, or `strictDelete`, is almost
   *   always the right answer.
   */
  const defaultRemoveOptions = require_objects_mutate.objectFreeze({
    __proto__: null,
    maxRetries: 3,
    recursive: true,
    retryDelay: 200,
  });
  let delModule;
  function getDel() {
    if (delModule === void 0) delModule = require_del();
    return delModule;
  }
  async function runDelete(filepath, options, runOptions) {
    const opts = {
      __proto__: null,
      ...options,
    };
    const patterns = require_arrays_predicates.isArray(filepath)
      ? filepath.map(require_paths_shared.pathLikeToString)
      : [require_paths_shared.pathLikeToString(filepath)];
    const shouldForce =
      runOptions?.forced === true ||
      require_fs_shared.areAllPathsInAllowedDirs(patterns, opts.allowedDirs);
    const maxRetries = opts.maxRetries ?? defaultRemoveOptions.maxRetries;
    const retryDelay = opts.retryDelay ?? defaultRemoveOptions.retryDelay;
    /* c8 ignore start - External del call */
    const del = getDel();
    await require_promises_retry.pRetry(
      async () => {
        await del.deleteAsync(patterns, {
          ...(opts.cwd === void 0 ? {} : { cwd: opts.cwd }),
          dryRun: false,
          force: shouldForce,
          onlyFiles: false,
        });
      },
      {
        retries: maxRetries,
        baseDelayMs: retryDelay,
        backoffFactor: 2,
        signal: opts.signal,
      },
    );
    /* c8 ignore stop */
  }
  function runDeleteSync(filepath, options, runOptions) {
    const opts = {
      __proto__: null,
      ...options,
    };
    const patterns = require_arrays_predicates.isArray(filepath)
      ? filepath.map(require_paths_shared.pathLikeToString)
      : [require_paths_shared.pathLikeToString(filepath)];
    const shouldForce =
      runOptions?.forced === true ||
      require_fs_shared.areAllPathsInAllowedDirs(patterns, opts.allowedDirs);
    const maxRetries = opts.maxRetries ?? defaultRemoveOptions.maxRetries;
    const retryDelay = opts.retryDelay ?? defaultRemoveOptions.retryDelay;
    /* c8 ignore start - External del call */
    const del = getDel();
    let lastError;
    let delay = retryDelay;
    for (let attempt = 0; attempt <= maxRetries; attempt++)
      try {
        del.deleteSync(patterns, {
          ...(opts.cwd === void 0 ? {} : { cwd: opts.cwd }),
          dryRun: false,
          force: shouldForce,
          onlyFiles: false,
        });
        return;
      } catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          const waitMs = delay;
          if (require_primordials_globals.SharedArrayBufferCtor !== void 0)
            require_primordials_array.AtomicsWait(
              new require_primordials_array.Int32ArrayCtor(
                new require_primordials_globals.SharedArrayBufferCtor(4),
              ),
              0,
              0,
              waitMs,
            );
          delay *= 2;
        }
      }
    if (lastError) throw lastError;
    /* c8 ignore stop */
  }
  /**
   * Safely delete a file or directory asynchronously with built-in protections.
   *
   * Uses [`del`](https://socket.dev/npm/package/del/overview/8.0.1) for safer
   * deletion with these safety features:
   *
   * - By default, prevents deleting the current working directory (cwd) and above
   * - Allows deleting descendant paths within cwd without the force option
   * - Automatically uses force: true for temp directory, cacache, and ~/.socket
   *   subdirectories
   * - Protects against accidental deletion of parent directories via `../` paths
   *
   * @example
   *   ;```ts
   *   // Delete files within cwd (safe by default)
   *   await safeDelete('./build')
   *   await safeDelete('./dist')
   *
   *   // Delete with glob patterns
   *   await safeDelete(['./temp/**', '!./temp/keep.txt'])
   *
   *   // Delete with custom retry settings
   *   await safeDelete('./flaky-dir', { maxRetries: 5, retryDelay: 500 })
   *
   *   // Delete cwd or above on purpose - a different function, by name
   *   await forceDelete('../parent-dir')
   *   ```
   *
   * @param filepath - Path or array of paths to delete (supports glob patterns)
   * @param options - Deletion options including retries and recursion.
   * @param options.allowedDirs - Extra roots the target may sit inside, for this
   *   call only. Names a sibling tree the caller owns without lifting the
   *   boundary; prefer it over reaching for `forceDelete`.
   *
   * @throws {Error} When attempting to delete protected paths
   * option.
   */
  async function safeDelete(filepath, options) {
    await runDelete(filepath, options);
  }
  /**
   * Safely delete a file or directory synchronously with built-in protections.
   *
   * Uses [`del`](https://socket.dev/npm/package/del/overview/8.0.1) for safer
   * deletion with these safety features:
   *
   * - By default, prevents deleting the current working directory (cwd) and above
   * - Allows deleting descendant paths within cwd without the force option
   * - Automatically uses force: true for temp directory, cacache, and ~/.socket
   *   subdirectories
   * - Protects against accidental deletion of parent directories via `../` paths
   *
   * @example
   *   ;```ts
   *   // Delete files within cwd (safe by default)
   *   safeDeleteSync('./build')
   *   safeDeleteSync('./dist')
   *
   *   // Delete with glob patterns
   *   safeDeleteSync(['./temp/**', '!./temp/keep.txt'])
   *
   *   // Delete multiple paths
   *   safeDeleteSync(['./coverage', './reports'])
   *
   *   // Delete cwd or above on purpose - a different function, by name
   *   forceDeleteSync('../parent-dir')
   *   ```
   *
   * @param filepath - Path or array of paths to delete (supports glob patterns)
   * @param options - Deletion options including retries and recursion.
   * @param options.allowedDirs - Extra roots the target may sit inside, for this
   *   call only. Names a sibling tree the caller owns without lifting the
   *   boundary; prefer it over reaching for `forceDeleteSync`.
   *
   * @throws {Error} When attempting to delete protected paths.
   */
  function safeDeleteSync(filepath, options) {
    runDeleteSync(filepath, options);
  }
  /**
   * Safely create a directory asynchronously, ignoring EEXIST errors. This
   * function wraps fs.promises.mkdir and handles the race condition where the
   * directory might already exist, which is common in concurrent code.
   *
   * Unlike fs.promises.mkdir with recursive:true, this function: - Silently
   * ignores EEXIST errors when the directory already exists - Re-throws all
   * other errors (permissions, invalid path, etc.) - Works reliably in
   * multi-process/concurrent scenarios - Defaults to recursive: true for
   * convenient nested directory creation.
   *
   * @example
   *   ;```ts
   *   // Create a directory recursively by default, no error if it exists
   *   await safeMkdir('./config')
   *
   *   // Create nested directories (recursive: true is the default)
   *   await safeMkdir('./data/cache/temp')
   *
   *   // Create with specific permissions
   *   await safeMkdir('./secure', { mode: 0o700 })
   *
   *   // Explicitly disable recursive behavior
   *   await safeMkdir('./single-level', { recursive: false })
   *   ```
   *
   * @param path - Directory path to create.
   * @param options - Options including recursive (default: true) and mode
   *   settings.
   *
   * @returns Promise that resolves when directory is created or already exists
   */
  async function safeMkdir(path, options) {
    const fs = require_node_fs.getNodeFs();
    const opts = {
      __proto__: null,
      recursive: true,
      ...options,
    };
    try {
      await fs.promises.mkdir(path, opts);
    } catch (e) {
      if (!require_errors_predicates.isErrnoException(e) || e.code !== "EEXIST")
        throw e;
    }
    /* c8 ignore stop */
  }
  /**
   * Safely create a directory synchronously, ignoring EEXIST errors. This
   * function wraps fs.mkdirSync and handles the race condition where the
   * directory might already exist, which is common in concurrent code.
   *
   * Unlike fs.mkdirSync with recursive:true, this function: - Silently ignores
   * EEXIST errors when the directory already exists - Re-throws all other
   * errors (permissions, invalid path, etc.) - Works reliably in
   * multi-process/concurrent scenarios - Defaults to recursive: true for
   * convenient nested directory creation.
   *
   * @example
   *   ;```ts
   *   // Create a directory recursively by default, no error if it exists
   *   safeMkdirSync('./config')
   *
   *   // Create nested directories (recursive: true is the default)
   *   safeMkdirSync('./data/cache/temp')
   *
   *   // Create with specific permissions
   *   safeMkdirSync('./secure', { mode: 0o700 })
   *
   *   // Explicitly disable recursive behavior
   *   safeMkdirSync('./single-level', { recursive: false })
   *   ```
   *
   * @param path - Directory path to create.
   * @param options - Options including recursive (default: true) and mode
   *   settings.
   */
  function safeMkdirSync(path, options) {
    const fs = require_node_fs.getNodeFs();
    const opts = {
      __proto__: null,
      recursive: true,
      ...options,
    };
    try {
      fs.mkdirSync(path, opts);
    } catch (e) {
      if (!require_errors_predicates.isErrnoException(e) || e.code !== "EEXIST")
        throw e;
    }
    /* c8 ignore stop */
  }
  exports.getDel = getDel;
  exports.runDelete = runDelete;
  exports.runDeleteSync = runDeleteSync;
  exports.safeDelete = safeDelete;
  exports.safeDeleteSync = safeDeleteSync;
  exports.safeMkdir = safeMkdir;
  exports.safeMkdirSync = safeMkdirSync;
});

var import_safe = require_safe();
const TLS_RUNTIME_DIRECTORY_KEY = "FLEET_TLS_TRUST_RUNTIME_DIRECTORY";
const TLS_RUNTIME_CA_KEY = "FLEET_TLS_TRUST_RUNTIME_CA_SOURCE";
async function buildRuntimeTlsBundles(caSource, bundlePaths, directory) {
  const ca = filterTlsCertificates(await readTlsTrustFile(caSource));
  if (ca.certificates.length !== 1 || ca.rejectedFingerprints.length)
    throw new Error(
      "Socket Firewall runtime source must contain one allowed CA certificate.",
    );
  return await buildTlsBundles({
    env: {
      ...bundlePaths,
      SFW_CA_CERT_PATH: caSource,
    },
    homeDir: os.homedir(),
    state: void 0,
    trustDirectory: directory,
  });
}
async function createRuntimeTlsTrust(env, bundlePaths, caSource, options = {}) {
  const directory = await mkdtemp(
    getTlsRuntimeDirectoryPrefix(options.directoryRoot ?? os.tmpdir()),
  );
  try {
    const built = await buildRuntimeTlsBundles(
      caSource,
      bundlePaths,
      directory,
    );
    for (const [name, file] of Object.entries(built.bundlePaths))
      await writeFile(file, built.bundles[name], {
        mode: 384,
        flag: "wx",
      });
    return {
      ...env,
      ...built.bundlePaths,
      [TLS_RUNTIME_DIRECTORY_KEY]: directory,
      [TLS_RUNTIME_CA_KEY]: caSource,
    };
  } catch (error) {
    if (options.directoryRoot) await (0, import_safe.safeDelete)(directory);
    else cleanupRuntimeTlsTrust(directory);
    throw error;
  }
}
async function runtimeTlsTrustReady(env, bundlePaths, options = {}) {
  if (!env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"])
    return (
      !env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"] &&
      Object.entries(bundlePaths).every(([key, file]) => env[key] === file)
    );
  return (await reuseRuntimeTlsTrust(env, bundlePaths, options)) !== void 0;
}
async function reuseRuntimeTlsTrust(env, bundlePaths, options = {}) {
  const directory = env[TLS_RUNTIME_DIRECTORY_KEY];
  if (!directory) return;
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 63) !== 0)
      return;
    if (options.allowedDirectoryRoot) {
      const root = path.resolve(options.allowedDirectoryRoot);
      const directoryPath = path.resolve(directory);
      const rootInfo = await lstat(root);
      if (
        !rootInfo.isDirectory() ||
        rootInfo.isSymbolicLink() ||
        (rootInfo.mode & 63) !== 0 ||
        path.dirname(directoryPath) !== root ||
        (await realpath(root)) !== root ||
        (await realpath(directoryPath)) !== directoryPath
      )
        return;
    }
    const caSource = env[TLS_RUNTIME_CA_KEY];
    if (!caSource) return;
    const built = await buildRuntimeTlsBundles(
      caSource,
      bundlePaths,
      directory,
    );
    const runtimeEnv = {
      ...env,
      ...built.bundlePaths,
    };
    const sfwBundlePath = env["SSL_CERT_FILE"];
    const sfwOverlayMatches = Boolean(
      options.allowSfwOverlay &&
      env["SOCKET_SHIM_ACTIVE_PNPM"] === "1" &&
      env["NODE_EXTRA_CA_CERTS"] === caSource &&
      sfwBundlePath &&
      sfwBundlePath !== caSource &&
      !Object.values(bundlePaths).includes(sfwBundlePath) &&
      TLS_SFW_BUNDLE_KEYS.every((key) => env[key] === sfwBundlePath) &&
      Object.keys(built.bundlePaths).every(
        (key) =>
          key === "NODE_EXTRA_CA_CERTS" ||
          TLS_SFW_BUNDLE_KEYS.includes(key) ||
          env[key] === bundlePaths[key] ||
          env[key] === built.bundlePaths[key],
      ),
    );
    for (const [name, file] of Object.entries(built.bundlePaths)) {
      const fileInfo = await lstat(file);
      if (
        !(
          env[name] === file ||
          (sfwOverlayMatches &&
            (name === "NODE_EXTRA_CA_CERTS"
              ? env[name] === caSource
              : TLS_SFW_BUNDLE_KEYS.includes(name) &&
                env[name] === sfwBundlePath))
        ) ||
        !fileInfo.isFile() ||
        fileInfo.isSymbolicLink() ||
        (fileInfo.mode & 63) !== 0 ||
        (await readTlsTrustFile(file)) !== built.bundles[name]
      )
        return;
    }
    return runtimeEnv;
  } catch {
    return;
  }
}

const SFW_BUNDLE_KEYS = TLS_SFW_BUNDLE_KEYS;
function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function sfwTlsBashEnvContents(helperPath) {
  return [
    `if ! FLEET_TLS_TRUST_EXPORTS="$(${`${shellQuote(process$1.execPath)} ${shellQuote(helperPath)} --shell`})"; then`,
    "  exit 1",
    "fi",
    'eval "$FLEET_TLS_TRUST_EXPORTS"',
    "unset FLEET_TLS_TRUST_EXPORTS",
    "",
  ].join("\n");
}
async function sfwTlsRuntimeDirectoryRoot(env) {
  const runnerTemp = env["RUNNER_TEMP"];
  if (!runnerTemp || !path.isAbsolute(runnerTemp))
    throw new Error("Socket Firewall requires an absolute RUNNER_TEMP path.");
  const runnerPath = path.resolve(runnerTemp);
  const runnerInfo = await lstat(runnerPath);
  if (
    !runnerInfo.isDirectory() ||
    runnerInfo.isSymbolicLink() ||
    (await realpath(runnerPath)) !== runnerPath
  )
    throw new Error("Socket Firewall RUNNER_TEMP is not a real directory.");
  const root = getTlsTrustRootPath(runnerPath);
  const rootInfo = await lstat(root);
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    (rootInfo.mode & 63) !== 0 ||
    (await realpath(root)) !== root
  )
    throw new Error("Socket Firewall TLS state directory is not private.");
  return root;
}
function validateSfwTlsRuntimeMarkerPair(env) {
  if (
    Boolean(env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"]) !==
    Boolean(env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"])
  )
    throw new Error("TLS runtime trust markers are incomplete; rerun setup.");
}
function sfwTlsEnvironmentLines(config) {
  const values = {
    ...Object.fromEntries(
      CA_SOURCE_KEYS.map((key) => [
        key,
        config.bash
          ? (config.env[key] ?? config.bundlePaths[key])
          : config.bundlePaths[key],
      ]),
    ),
    SSL_CERT_DIR: config.emptyDirectoryPath,
    GIT_SSL_CAPATH: config.emptyDirectoryPath,
    ...(config.nodeOptions ? { NODE_OPTIONS: config.nodeOptions } : {}),
    BASH_ENV: config.bashEnvPath,
    FLEET_TLS_TRUST_STATE: config.statePath,
    [TLS_RUNTIME_DIRECTORY_KEY]:
      config.env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"] ?? "",
    [TLS_RUNTIME_CA_KEY]: config.env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"] ?? "",
    ...(config.bash && config.env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"]
      ? {
          [TLS_RUNTIME_DIRECTORY_KEY]: config.env[TLS_RUNTIME_DIRECTORY_KEY],
          [TLS_RUNTIME_CA_KEY]: config.env[TLS_RUNTIME_CA_KEY],
        }
      : {}),
  };
  return Object.entries(values).map(([key, value]) =>
    config.bash ? `export ${key}=${shellQuote(value)}` : `${key}=${value}`,
  );
}
async function resolveSfwTlsOverlay(
  env,
  bundlePaths,
  emptyDirectoryPath,
  runtimeDirectoryRoot,
) {
  if (env["SOCKET_SHIM_ACTIVE_PNPM"] !== "1") return env;
  const source = env["NODE_EXTRA_CA_CERTS"];
  if (
    !env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"] &&
    env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"]
  )
    throw new Error(
      "Socket Firewall runtime trust markers are incomplete; restart the wrapped command.",
    );
  const runtimeEnv = env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"]
    ? await reuseRuntimeTlsTrust(env, bundlePaths, {
        allowSfwOverlay: true,
        allowedDirectoryRoot: runtimeDirectoryRoot,
      })
    : void 0;
  if (env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"] && !runtimeEnv)
    throw new Error(
      "Socket Firewall runtime trust changed; restart the wrapped command.",
    );
  if (
    !env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"] &&
    !env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"] &&
    CA_SOURCE_KEYS.every((key) => env[key] === bundlePaths[key]) &&
    env["SSL_CERT_DIR"] === emptyDirectoryPath &&
    env["GIT_SSL_CAPATH"] === emptyDirectoryPath
  )
    return env;
  if (!source)
    throw new Error(
      "Socket Firewall CA source is missing; restart the wrapped command.",
    );
  const runtimeCaSource = env[TLS_RUNTIME_CA_KEY];
  if (
    Boolean(
      runtimeEnv &&
      source === runtimeEnv["NODE_EXTRA_CA_CERTS"] &&
      CA_SOURCE_KEYS.every((key) => env[key] === runtimeEnv[key]),
    )
  )
    return runtimeEnv;
  if (
    Object.values(bundlePaths).includes(source) ||
    (runtimeCaSource && source !== runtimeCaSource)
  )
    throw new Error(
      "Socket Firewall CA source changed after runtime trust setup; restart the wrapped command.",
    );
  const sfwBundle = env["SSL_CERT_FILE"];
  if (
    !sfwBundle ||
    sfwBundle === source ||
    Object.values(bundlePaths).includes(sfwBundle) ||
    SFW_BUNDLE_KEYS.some((key) => env[key] !== sfwBundle)
  )
    throw new Error(
      "Socket Firewall CA bundle does not match its filtered source; restart the wrapped command.",
    );
  for (const key of CA_SOURCE_KEYS) {
    if (key !== "NODE_EXTRA_CA_CERTS" && !SFW_BUNDLE_KEYS.includes(key)) {
      if (env[key] !== bundlePaths[key] && env[key] !== runtimeEnv?.[key])
        throw new Error(
          `${key} changed during Socket Firewall wrapping; restart the wrapped command.`,
        );
    }
    if (!bundlePaths[key])
      throw new Error(`TLS state is missing ${key}; rerun the setup action.`);
  }
  await readTlsTrustFile(sfwBundle);
  if (
    env["SSL_CERT_DIR"] !== emptyDirectoryPath ||
    env["GIT_SSL_CAPATH"] !== emptyDirectoryPath
  )
    throw new Error(
      "TLS CA directories changed during Socket Firewall wrapping; restart the wrapped command.",
    );
  const inspectionEnv = {
    ...env,
    NODE_EXTRA_CA_CERTS: bundlePaths["NODE_EXTRA_CA_CERTS"],
    ...Object.fromEntries(
      SFW_BUNDLE_KEYS.map((key) => [key, bundlePaths[key]]),
    ),
  };
  const inspection = inspectTlsEnvironment(inspectionEnv, {
    platform: process$1.platform,
    execArgv: process$1.execArgv,
    controlledSslCertDir: emptyDirectoryPath,
  });
  if (!inspection.ok)
    throw new Error([...inspection.conflicts, ...inspection.errors].join(" "));
  if (runtimeEnv) return runtimeEnv;
  return await createRuntimeTlsTrust(env, bundlePaths, source, {
    directoryRoot: runtimeDirectoryRoot,
  });
}

/**
 * @file Create and validate the filtered CA inputs used by setup action steps.
 */
const CA_KEYS = TLS_CA_SOURCE_KEYS;
function rootDirectory() {
  return getTlsTrustRootPath(process$1.env["RUNNER_TEMP"] || os.tmpdir());
}
function bashEnvPath() {
  return getTlsTrustBashEnvPath(rootDirectory());
}
function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function writePrivate(file, contents) {
  const temporary = `${file}.${process$1.pid}.${crypto.randomBytes(6).toString("hex")}`;
  await writeFile(temporary, contents, {
    flag: "wx",
    mode: 384,
  });
  try {
    await chmod(temporary, 384);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
function appendNodeOption(value) {
  const options = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!options.includes("--use-openssl-ca")) options.push("--use-openssl-ca");
  return options.join(" ");
}
async function buildBundles() {
  const directory = rootDirectory();
  await mkdir(directory, {
    recursive: true,
    mode: 448,
  });
  await chmod(directory, 448);
  const emptyDirectoryPath = getTlsTrustEmptyDirectoryPath(directory);
  try {
    const info = await lstat(emptyDirectoryPath);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await readdir(emptyDirectoryPath)).length
    )
      throw new Error(
        "Managed TLS CA directory is not a private empty directory.",
      );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    await mkdir(emptyDirectoryPath, { mode: 448 });
  }
  await chmod(emptyDirectoryPath, 448);
  for (const key of ["SSL_CERT_DIR", "GIT_SSL_CAPATH"]) {
    const directoryOverride = process$1.env[key];
    if (directoryOverride && directoryOverride !== emptyDirectoryPath)
      throw new Error(
        `${key} points to an unmanaged CA directory; clear it or use the managed empty directory.`,
      );
  }
  const sources = [];
  const rejected = [];
  const sfwPath =
    process$1.env["SFW_CA_CERT_PATH"] ??
    getDefaultSfwCaCertificatePath(os.homedir());
  const sfwBody = await readTlsBootstrapCaFile(
    sfwPath,
    !process$1.env["SFW_CA_CERT_PATH"],
  );
  const sfwFiltered = filterTlsCertificates(sfwBody ?? "", {
    requireNonEmpty: false,
  });
  rejected.push(...sfwFiltered.rejectedFingerprints);
  sources.push({
    key: "SFW_CA_CERT_PATH",
    path: sfwPath,
    sha256: sfwBody === void 0 ? "missing" : digest(sfwBody),
  });
  const bundlePaths = Object.create(null);
  const bundles = Object.create(null);
  const combine = (name, sourcePem) => {
    const filtered = filterTlsCertificates(
      [sourcePem, sfwFiltered.pem].filter(Boolean).join("\n"),
    );
    bundles[name] = filtered.pem;
    rejected.push(...filtered.rejectedFingerprints);
  };
  const sslFile = process$1.env["SSL_CERT_FILE"];
  if (sslFile) {
    const body = await readTlsBootstrapCaFile(sslFile);
    const filtered = filterTlsCertificates(body);
    sources.push({
      key: "SSL_CERT_FILE",
      path: sslFile,
      sha256: digest(body),
    });
    rejected.push(...filtered.rejectedFingerprints);
    combine("SSL_CERT_FILE", filtered.pem);
  } else {
    const platformPem = [];
    for (const kind of ["bundled", "system"]) {
      const filtered = filterTlsCertificates(await readTlsPlatformRoots(kind), {
        requireNonEmpty: false,
        skipNonCa: true,
      });
      platformPem.push(filtered.pem);
      rejected.push(...filtered.rejectedFingerprints);
      sources.push({
        key: `node-${kind}`,
        path: "",
        sha256: digest(filtered.pem),
        ...(kind === "system"
          ? { environment: captureTlsPlatformEnvironment(process$1.env) }
          : {}),
      });
    }
    combine("SSL_CERT_FILE", platformPem.filter(Boolean).join("\n"));
  }
  bundlePaths["SSL_CERT_FILE"] = getTlsTrustBundlePath(
    directory,
    "SSL_CERT_FILE",
    "ssl-cert-file.pem",
  );
  for (const key of CA_KEYS.slice(1)) {
    const sourcePath = process$1.env[key];
    if (!sourcePath) continue;
    const body = await readTlsBootstrapCaFile(sourcePath);
    const filtered = filterTlsCertificates(body);
    sources.push({
      key,
      path: sourcePath,
      sha256: digest(body),
    });
    rejected.push(...filtered.rejectedFingerprints);
    bundlePaths[key] = getTlsTrustBundlePath(directory, key);
    combine(key, filtered.pem);
  }
  if (sfwFiltered.pem && !bundlePaths["NODE_EXTRA_CA_CERTS"]) {
    bundlePaths["NODE_EXTRA_CA_CERTS"] = getTlsTrustBundlePath(
      directory,
      "NODE_EXTRA_CA_CERTS",
    );
    combine("NODE_EXTRA_CA_CERTS", "");
  }
  for (const key of CA_KEYS)
    if (!bundlePaths[key]) {
      bundlePaths[key] = bundlePaths["SSL_CERT_FILE"];
      bundles[key] = bundles["SSL_CERT_FILE"];
    }
  for (const [key, file] of Object.entries(bundlePaths))
    await writePrivate(file, bundles[key]);
  const runtime = {
    ...process$1.env,
    ...bundlePaths,
    SSL_CERT_DIR: emptyDirectoryPath,
    GIT_SSL_CAPATH: emptyDirectoryPath,
    NODE_OPTIONS: appendNodeOption(process$1.env["NODE_OPTIONS"]),
  };
  const inspection = inspectTlsEnvironment(runtime, {
    platform: process$1.platform,
    execArgv: process$1.execArgv,
    controlledSslCertDir: emptyDirectoryPath,
  });
  if (!inspection.ok)
    throw new Error([...inspection.conflicts, ...inspection.errors].join(" "));
  if (rejected.length)
    process$1.stderr.write(
      `Filtered blocked CA keys: ${[...new Set(rejected)].join(", ")}\n`,
    );
  const state = {
    bundlePaths,
    emptyDirectoryPath,
    sources,
    version: 1,
  };
  await writePrivate(
    getTlsTrustStatePath(directory),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  return state;
}
async function readState() {
  const directory = rootDirectory();
  const statePath = getTlsTrustStatePath(directory);
  const info = await lstat(statePath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 63) !== 0)
    throw new Error(
      "TLS trust state is missing or unsafe; rerun the setup action.",
    );
  const value = JSON.parse(await readFile(statePath, "utf8"));
  if (
    value.version !== 1 ||
    value.emptyDirectoryPath !== getTlsTrustEmptyDirectoryPath(directory) ||
    !value.bundlePaths ||
    !Array.isArray(value.sources)
  )
    throw new Error("TLS trust state is invalid; rerun the setup action.");
  for (const key of CA_KEYS)
    if (!Object.hasOwn(value.bundlePaths, key))
      throw new Error("TLS trust state is incomplete; rerun the setup action.");
  for (const [key, file] of Object.entries(value.bundlePaths))
    if (
      !CA_KEYS.includes(key) ||
      path.dirname(path.resolve(file)) !== path.resolve(directory)
    )
      throw new Error(
        "TLS trust state contains an unexpected bundle path; rerun the setup action.",
      );
  return value;
}
async function validateState(state, env = process$1.env) {
  if (
    env["SSL_CERT_DIR"] !== state.emptyDirectoryPath ||
    env["GIT_SSL_CAPATH"] !== state.emptyDirectoryPath
  )
    throw new Error("TLS CA directories changed; rerun the setup action.");
  const liveInspection = inspectTlsEnvironment(
    {
      ...env,
      NODE_OPTIONS: appendNodeOption(env["NODE_OPTIONS"]),
    },
    {
      platform: process$1.platform,
      execArgv: process$1.execArgv,
      controlledSslCertDir: state.emptyDirectoryPath,
    },
  );
  if (!liveInspection.ok)
    throw new Error(
      [...liveInspection.conflicts, ...liveInspection.errors].join(" "),
    );
  const directory = rootDirectory();
  const directoryInfo = await lstat(directory);
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.isSymbolicLink() ||
    (directoryInfo.mode & 63) !== 0
  )
    throw new Error(
      "TLS trust directory is not private; rerun the setup action.",
    );
  validateSfwTlsRuntimeMarkerPair(env);
  const runtimeDirectory = env[TLS_RUNTIME_DIRECTORY_KEY];
  const runtimeRoot = runtimeDirectory
    ? await sfwTlsRuntimeDirectoryRoot(env)
    : void 0;
  const runtimeReady = await runtimeTlsTrustReady(env, state.bundlePaths, {
    ...(runtimeRoot ? { allowedDirectoryRoot: runtimeRoot } : {}),
  });
  if (runtimeDirectory && !runtimeReady)
    throw new Error("TLS runtime bundle changed; rerun the setup action.");
  for (const key of CA_KEYS)
    if (env[key] !== state.bundlePaths[key] && !runtimeReady)
      throw new Error(
        `${key} changed after TLS trust setup; rerun the setup action.`,
      );
  for (const file of Object.values(state.bundlePaths)) {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 63) !== 0)
      throw new Error(
        "A managed TLS bundle is missing or unsafe; rerun the setup action.",
      );
    const content = await readTlsBootstrapCaFile(file);
    if (filterTlsCertificates(content).rejectedFingerprints.length)
      throw new Error(
        "A managed TLS bundle contains a blocked CA; rerun the setup action.",
      );
  }
  const emptyInfo = await lstat(state.emptyDirectoryPath);
  if (
    !emptyInfo.isDirectory() ||
    emptyInfo.isSymbolicLink() ||
    (emptyInfo.mode & 63) !== 0 ||
    (await readdir(state.emptyDirectoryPath)).length
  )
    throw new Error(
      "Managed TLS CA directory is missing, unsafe, or not empty.",
    );
  await validateTlsBootstrapSources(state.sources);
  const runtime = {
    ...env,
    ...state.bundlePaths,
    SSL_CERT_DIR: state.emptyDirectoryPath,
    GIT_SSL_CAPATH: state.emptyDirectoryPath,
    NODE_OPTIONS: appendNodeOption(env["NODE_OPTIONS"]),
  };
  const inspection = inspectTlsEnvironment(runtime, {
    platform: process$1.platform,
    execArgv: process$1.execArgv,
    controlledSslCertDir: state.emptyDirectoryPath,
  });
  if (!inspection.ok)
    throw new Error([...inspection.conflicts, ...inspection.errors].join(" "));
  const expectedStatePath = getTlsTrustStatePath(directory);
  if (env["FLEET_TLS_TRUST_STATE"] !== expectedStatePath)
    throw new Error("TLS trust state path changed; rerun the setup action.");
  if (env["BASH_ENV"] !== bashEnvPath())
    throw new Error(
      "BASH_ENV changed after TLS trust setup; rerun the setup action.",
    );
  const rcInfo = await lstat(bashEnvPath());
  const helperPath = getTlsTrustHelperPath(directory);
  const rcContents = sfwTlsBashEnvContents(helperPath);
  if (
    !rcInfo.isFile() ||
    rcInfo.isSymbolicLink() ||
    (rcInfo.mode & 63) !== 0 ||
    (await readFile(bashEnvPath(), "utf8")) !== rcContents
  )
    throw new Error("BASH_ENV is missing or unsafe; rerun the setup action.");
  const helperInfo = await lstat(helperPath);
  if (
    !helperInfo.isFile() ||
    helperInfo.isSymbolicLink() ||
    (helperInfo.mode & 63) !== 0
  )
    throw new Error(
      "TLS bootstrap helper is missing or unsafe; rerun the setup action.",
    );
}
async function installBashEnv(sourceHelper) {
  const existingBashEnv = process$1.env["BASH_ENV"];
  if (existingBashEnv && existingBashEnv !== bashEnvPath())
    throw new Error(
      "BASH_ENV is already set; preserve it and configure filtered TLS trust manually.",
    );
  const directory = rootDirectory();
  const helper = getTlsTrustHelperPath(directory);
  await writePrivate(helper, (await readFile(sourceHelper)).toString("utf8"));
  await writePrivate(bashEnvPath(), sfwTlsBashEnvContents(helper));
}
async function main(args) {
  if (args.length !== 1 || !["--github-env", "--shell"].includes(args[0]))
    throw new Error(
      "Usage: tls-trust-bootstrap.generated.mjs --github-env|--shell",
    );
  if (args[0] === "--github-env") {
    if (
      process$1.env["FLEET_TLS_TRUST_RUNTIME_DIRECTORY"] ||
      process$1.env["FLEET_TLS_TRUST_RUNTIME_CA_SOURCE"]
    )
      throw new Error(
        "Cannot rebuild TLS trust while runtime trust markers are active; restart the job.",
      );
    if (process$1.env["BASH_ENV"]) {
      if (process$1.env["BASH_ENV"] !== bashEnvPath())
        throw new Error(
          "BASH_ENV is already set; preserve it and configure filtered TLS trust manually.",
        );
      await validateState(await readState());
    }
    const state = await buildBundles();
    await installBashEnv(process$1.argv[1]);
    for (const line of sfwTlsEnvironmentLines({
      bundlePaths: state.bundlePaths,
      emptyDirectoryPath: state.emptyDirectoryPath,
      bash: false,
      bashEnvPath: bashEnvPath(),
      statePath: getTlsTrustStatePath(rootDirectory()),
      env: process$1.env,
    }))
      process$1.stdout.write(`${line}\n`);
    return;
  }
  const state = await readState();
  const runtimeEnv = await resolveSfwTlsOverlay(
    process$1.env,
    state.bundlePaths,
    state.emptyDirectoryPath,
    process$1.env["SOCKET_SHIM_ACTIVE_PNPM"] === "1"
      ? await sfwTlsRuntimeDirectoryRoot(process$1.env)
      : "",
  );
  await validateState(state, runtimeEnv);
  for (const line of sfwTlsEnvironmentLines({
    bundlePaths: state.bundlePaths,
    emptyDirectoryPath: state.emptyDirectoryPath,
    bash: true,
    bashEnvPath: bashEnvPath(),
    statePath: getTlsTrustStatePath(rootDirectory()),
    env: runtimeEnv,
    nodeOptions: appendNodeOption(runtimeEnv["NODE_OPTIONS"]),
  }))
    process$1.stdout.write(`${line}\n`);
}
if (isMainModule(import.meta.url))
  main(process$1.argv.slice(2)).catch((error) => {
    process$1.stderr.write(`${(0, import_message.errorMessage)(error)}\n`);
    process$1.exitCode = 1;
  });

export {};
