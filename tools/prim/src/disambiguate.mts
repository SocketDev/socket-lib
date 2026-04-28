/**
 * @fileoverview Claude-deferred receiver type disambiguation.
 *
 * For ambiguous method names (`.test`, `.then`, `.exec`, `.catch`,
 * `.finally`) the static analyzer cannot decide whether the receiver
 * is a RegExp / Promise / a duck-typed user object without following
 * the receiver back to its declaration. This module hands the call
 * site to Claude Sonnet with a locked-down tool surface (Read, Grep,
 * Glob — no Bash, no Edit, no Write, no WebFetch) so the model can
 * grep imports / read type declarations and answer.
 *
 * Security model — three independent layers, all required.
 *
 * The official permission evaluation flow (per
 * https://code.claude.com/docs/en/agent-sdk/permissions) is:
 *   1. Hooks (none here)
 *   2. Deny rules from `disallowedTools` — match → blocked, even in
 *      bypassPermissions mode
 *   3. Permission mode — `dontAsk` denies anything not pre-approved
 *      without calling `canUseTool`
 *   4. Allow rules from `allowedTools` — match → approved
 *   5. `canUseTool` — skipped in `dontAsk` mode (deny by default)
 *
 * The doc explicitly notes (verbatim): "`allowedTools` and
 * `disallowedTools` ... control whether a tool call is approved, not
 * whether the tool is available to Claude." Restricting *availability*
 * is the SDK's separate `tools` option, which sets the base set of
 * tools the model is told about.
 *
 *   • `tools: BASE_TOOLS` — the SDK's `tools` option. Restricts what
 *     the model SEES. With this, the model is never given Bash / Edit /
 *     Write tool definitions, so it can't even attempt to call them.
 *     Saves tokens and clarifies the model's intent.
 *
 *   • `allowedTools: AUTO_APPROVE_TOOLS` — step 4 of the eval flow.
 *     Tools in this list are approved without invoking `canUseTool`.
 *     We list the same names as BASE_TOOLS so the three permitted
 *     tools run end-to-end.
 *
 *   • `disallowedTools: DENIED_TOOLS` — step 2 of the eval flow. Deny
 *     rules win even against bypassPermissions. Defense-in-depth: even
 *     if a future edit removes `tools` and accidentally exposes the
 *     full claude_code preset, this list still blocks Bash/Edit/Write/
 *     WebFetch/WebSearch.
 *
 *   • `permissionMode: 'dontAsk'` — the docs' canonical lockdown recipe
 *     for headless agents. The doc states: "For a locked-down agent,
 *     pair `allowedTools` with `permissionMode: 'dontAsk'`. Listed
 *     tools are approved; anything else is denied outright instead of
 *     prompting." With `default`, unmatched tools fall through to
 *     `canUseTool`, which is undefined → undefined behavior in a
 *     non-interactive script.
 *
 * Caching: every (file, line, column, methodName, snippetHash) →
 * verdict is written to `<targetRoot>/.prim-cache/disambiguate.json`.
 * Subsequent audit runs are free; the cache only grows when a new
 * ambiguous site appears or the surrounding source changes.
 *
 * Opt-in: callers must pass `aiDisambiguate: true` AND have
 * `ANTHROPIC_API_KEY` in env. Without both, this module's
 * `disambiguateReceiver()` short-circuits to `{ type: undefined,
 * source: 'static', reason: 'ai-defer-not-enabled' }`. No silent API
 * calls.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { getAmbiguousCase } from './ambiguous-methods.mts'

// ─── Locked-down tool surface ────────────────────────────────────────
//
// READ-ONLY: file inspection only. The model can grep for an import
// statement and read the type declaration it points to. It cannot
// execute code, modify files, or reach the network.
//
// `BASE_TOOLS` is the SDK's `tools` option: the literal set the model
// is told about. Anything not in here is invisible to the model — it
// cannot generate a tool_use block referring to a name it has never
// seen. THIS is the allowlist. Adding to it requires a security
// review; never expand as a "while we're here" change.
const BASE_TOOLS = ['Read', 'Grep', 'Glob']

// `AUTO_APPROVE_TOOLS` is the SDK's `allowedTools` option: step 4 of
// the permission evaluation flow ("Allow rules"). Tools matched here
// are approved without invoking `canUseTool`. In `dontAsk` mode, an
// unmatched tool is DENIED (step 5 is skipped) — without listing
// Read/Grep/Glob here, the model would be told they exist (via
// BASE_TOOLS) but every invocation would be denied at runtime.
// Identical to BASE_TOOLS by design.
const AUTO_APPROVE_TOOLS = BASE_TOOLS

// `DENIED_TOOLS` is the SDK's `disallowedTools` option: tool names
// removed from the model's context entirely. Deny-first — overrides
// everything else. Defense-in-depth: even if a future edit forgets
// to restrict `tools`, every name on this list is still blocked.
const DENIED_TOOLS = [
  'Agent',
  'Bash',
  'Edit',
  'NotebookEdit',
  'Task',
  'WebFetch',
  'WebSearch',
  'Write',
]

// Sonnet 4.6 — fast enough for a 1-token classification, smart
// enough to follow imports through type declarations. If you change
// this, make sure the prompt's "respond with one word" constraint
// still works; Haiku is similarly capable for this task and cheaper.
const MODEL = 'claude-sonnet-4-6'

// Reasonable default. Verdict is one word; the model occasionally
// emits a sentence of rationale before the verdict, which we tolerate
// and parse out — 256 tokens is plenty.
const MAX_TOKENS = 256

// ─── Cache ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} CachedVerdict
 * @property {string|undefined} type  Receiver type, or undefined if
 *   "no primordial candidate" / "unsure".
 * @property {string} reason  One-line rationale from the model.
 * @property {number} timestamp  Unix-millis. Not used for invalidation
 *   (entries are keyed on snippetHash; a code change re-keys), just
 *   surfaced to operators for "when did we last call Claude on this".
 */

const CACHE_FILENAME = 'disambiguate.json'
// Cache schema version. Bump when the verdict shape, prompt
// structure, or model semantics change in a way that invalidates
// previous answers (a re-prompt with different framing may produce
// a different verdict on the same snippet).
const CACHE_SCHEMA_VERSION = 1

function cachePath(targetRoot) {
  return path.join(targetRoot, '.prim-cache', CACHE_FILENAME)
}

function loadCache(targetRoot) {
  const filePath = cachePath(targetRoot)
  if (!existsSync(filePath)) {
    return { schema: CACHE_SCHEMA_VERSION, entries: {} }
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'))
    if (data?.schema !== CACHE_SCHEMA_VERSION) {
      // Schema mismatch: treat as empty. Don't delete — the operator
      // may want to inspect the previous shape before we overwrite.
      return { schema: CACHE_SCHEMA_VERSION, entries: {} }
    }
    return data
  } catch {
    return { schema: CACHE_SCHEMA_VERSION, entries: {} }
  }
}

function saveCache(targetRoot, cache) {
  const filePath = cachePath(targetRoot)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(cache, null, 2) + '\n')
}

/**
 * Hash the inputs that determine the verdict. Two snippets with the
 * same hash will get the same verdict (and re-using the cached one
 * is correct). Includes the method name + the surrounding source
 * + the receiver identifier so an unrelated edit elsewhere in the
 * file doesn't invalidate the cache.
 */
function computeKey(methodName, receiverName, snippet) {
  const hash = createHash('sha256')
  hash.update('v1\n')
  hash.update(methodName)
  hash.update('\n')
  hash.update(receiverName)
  hash.update('\n')
  hash.update(snippet)
  return hash.digest('hex')
}

// ─── Prompt ──────────────────────────────────────────────────────────

/**
 * Build the disambiguation prompt. The model is allowed to read
 * files in the target repo (via Read/Grep/Glob), but the prompt is
 * structured so the answer is one word — minimizes token cost and
 * makes parsing trivial.
 *
 * Following the "examples > description" pattern from
 * platform.claude.com/docs/.../prompt-engineering: showing one
 * canonical false-positive (semver Range.test) and one canonical
 * true-positive (re.test) gets ~99% accuracy on the cacache→semver
 * shape that motivated this whole subsystem.
 */
function buildPrompt({
  methodName,
  receiverName,
  filePath,
  line,
  column,
  snippet,
  hint,
  candidates,
}) {
  const candidateList = candidates.join(' / ')
  return `You are auditing a JavaScript codebase for primordials migration.

Question: in this code, what is the type of \`${receiverName}\` at the call \`${receiverName}.${methodName}(...)\`?

<location>
file: ${filePath}
line: ${line}
column: ${column}
</location>

<snippet>
${snippet}
</snippet>

<context>
The method \`.${methodName}\` is spec-defined on: ${candidateList}.
But it is also widely duck-typed by user libraries.

Common duck-typed shapes for \`.${methodName}\`:
${hint}
</context>

<task>
Determine the type of \`${receiverName}\` at this call site. You MAY use the Read, Grep, and Glob tools to inspect the source — for example to find where \`${receiverName}\` is declared or imported from, and what type it has.

Respond with ONE LINE in this exact format:
  VERDICT: <type>
  REASON: <one short sentence>

Where <type> is exactly one of:
  - ${candidates.map(c => `"${c}"`).join(' (the spec built-in)\n  - ')} (the spec built-in)
  - "Other" (a user/library type that happens to share the method name — DO NOT migrate)
  - "Unsure" (you cannot determine without more context — DO NOT migrate)

Examples:
  VERDICT: RegExp
  REASON: \`re\` is declared as \`const re = /foo/g\` two lines above the call.

  VERDICT: Other
  REASON: \`range\` is imported from semver and is a \`Range\` instance, not a RegExp.

  VERDICT: Unsure
  REASON: \`p\` is a function parameter with no type annotation; could be anything.
</task>`
}

/**
 * Parse the model's response to extract the verdict and reason.
 * Tolerates surrounding chatter — looks for the literal `VERDICT:`
 * and `REASON:` keys.
 */
function parseResponse(text, candidates) {
  const verdictMatch = /^\s*VERDICT:\s*([A-Za-z]+)/m.exec(text)
  const reasonMatch = /^\s*REASON:\s*(.+?)$/m.exec(text)
  if (!verdictMatch) {
    return { type: undefined, reason: 'no-verdict-line' }
  }
  const raw = verdictMatch[1]
  const reason = reasonMatch ? reasonMatch[1].trim() : '(no reason supplied)'
  if (raw === 'Other' || raw === 'Unsure') {
    return { type: undefined, reason }
  }
  if (candidates.includes(raw)) {
    return { type: raw, reason }
  }
  return {
    type: undefined,
    reason: `unexpected verdict "${raw}" (expected one of ${candidates.join(', ')}, "Other", "Unsure")`,
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Lazily load the SDK only when a real call is needed. Keeps the
 * audit lightweight when AI defer is off (no install, no import).
 */
async function loadSdk() {
  // The SDK is an optional peer; require it dynamically so the
  // audit/codemod don't pay the import cost when AI defer is off.
  // eslint-disable-next-line no-unsanitized/method
  const mod = await import('@anthropic-ai/claude-agent-sdk')
  if (typeof mod.query !== 'function') {
    throw new Error(
      '@anthropic-ai/claude-agent-sdk is installed but does not export `query`. Expected SDK ≥ 0.2.0.',
    )
  }
  return mod.query
}

/**
 * @param {Object} opts
 * @param {string} opts.targetRoot          Repo root (cache lives here).
 * @param {string} opts.methodName          e.g. "test".
 * @param {string} opts.receiverName        e.g. "range".
 * @param {string} opts.filePath            Relative path for prompt.
 * @param {number} opts.line                1-based.
 * @param {number} opts.column              1-based.
 * @param {string} opts.snippet             ~10 lines of surrounding source.
 * @param {boolean} [opts.aiEnabled=false]  Master switch. False = static-only.
 * @returns {Promise<{type:string|undefined, source:string, reason:string}>}
 */
export async function disambiguateReceiver({
  aiEnabled = false,
  column,
  filePath,
  line,
  methodName,
  receiverName,
  snippet,
  targetRoot,
}) {
  const ambiguousCase = getAmbiguousCase(methodName)
  if (!ambiguousCase) {
    // Caller shouldn't have reached here; method isn't ambiguous.
    return {
      type: undefined,
      source: 'static',
      reason: 'method-not-in-ambiguous-table',
    }
  }

  if (!aiEnabled) {
    return {
      type: undefined,
      source: 'static',
      reason: 'ai-defer-not-enabled',
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      type: undefined,
      source: 'static',
      reason: 'ANTHROPIC_API_KEY not set',
    }
  }

  // Cache lookup.
  const key = computeKey(methodName, receiverName, snippet)
  const cache = loadCache(targetRoot)
  const cached = cache.entries[key]
  if (cached) {
    return {
      type: cached.type,
      source: 'cache',
      reason: cached.reason,
    }
  }

  // Cache miss: call Claude.
  let query
  try {
    query = await loadSdk()
  } catch (err) {
    return {
      type: undefined,
      source: 'static',
      reason: `sdk-load-failed: ${err.message}`,
    }
  }

  const prompt = buildPrompt({
    candidates: ambiguousCase.candidates,
    column,
    filePath,
    hint: ambiguousCase.hint,
    line,
    methodName,
    receiverName,
    snippet,
  })

  let answer = ''
  try {
    const result = query({
      prompt,
      options: {
        // Locked-down tool surface. THREE independent layers — see
        // file header for the canonical permission evaluation flow.
        //
        //   - `tools` restricts the BASE SET the model is told about
        //     (the model never sees Bash/Edit/Write definitions).
        //   - `allowedTools` is the AUTO-APPROVE list (step 4 of the
        //     eval flow); listed tools run without canUseTool.
        //   - `disallowedTools` is DENY-FIRST (step 2); blocks even
        //     in bypassPermissions.
        //   - `permissionMode: 'dontAsk'` is the official lockdown
        //     recipe for headless agents. Anything not pre-approved
        //     is DENIED (not prompted, not falling through to a
        //     missing canUseTool callback that would otherwise hang).
        allowedTools: AUTO_APPROVE_TOOLS,
        cwd: targetRoot,
        disallowedTools: DENIED_TOOLS,
        maxTokens: MAX_TOKENS,
        model: MODEL,
        permissionMode: 'dontAsk',
        tools: BASE_TOOLS,
      },
    })
    for await (const message of result) {
      if (message.type === 'assistant') {
        const blocks = message.message?.content ?? []
        for (const block of blocks) {
          if (block.type === 'text') {
            answer += block.text
          }
        }
      } else if (message.type === 'result') {
        // Final result; the assistant blocks have already been read.
        break
      }
    }
  } catch (err) {
    return {
      type: undefined,
      source: 'static',
      reason: `sdk-call-failed: ${err.message}`,
    }
  }

  const parsed = parseResponse(answer, ambiguousCase.candidates)

  // Persist to cache, even for "undefined" verdicts — re-asking the
  // model on every audit run for sites it already classified as
  // "Other" or "Unsure" is wasteful.
  cache.entries[key] = {
    reason: parsed.reason,
    timestamp: Date.now(),
    type: parsed.type,
  }
  saveCache(targetRoot, cache)

  return {
    type: parsed.type,
    source: 'ai',
    reason: parsed.reason,
  }
}

/**
 * Build a source snippet around (line, column). Used by audit/codemod
 * to gather the context Claude needs.
 *
 * @param {string} src             Full source text.
 * @param {number[]} lineStarts    Start-of-line offsets (1-indexed view).
 * @param {number} line            1-based.
 * @param {number} contextLines    Lines before+after to include.
 * @returns {string}
 */
export function buildSnippet(src, lineStarts, line, contextLines = 8) {
  const startLine = Math.max(1, line - contextLines)
  const endLine = Math.min(lineStarts.length, line + contextLines)
  const startOffset = lineStarts[startLine - 1] ?? 0
  const endOffset =
    endLine < lineStarts.length
      ? (lineStarts[endLine] ?? src.length) - 1
      : src.length
  return src.slice(startOffset, endOffset)
}
