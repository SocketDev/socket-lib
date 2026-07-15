/**
 * @file Pure parsers for per-agent token/cost usage embedded in a spawn's
 *   output. `spawnAiAgent` (`spawn.mts`) returns raw `stdout`/`stderr` today —
 *   no usage figures — so a caller that wants to track spend has nothing to
 *   read. Claude, Codex, and OpenCode each surface usage differently (an
 *   inline JSON usage object, a text footer, or nothing at all when the
 *   account/mode does not report it), so `parseAgentCost` matches the GIST of
 *   each shape with tolerant regexes rather than an exact sentence —
 *   mirroring how `spawn.mts` detects its overload/unavailable/quota signal
 *   phrases instead of pattern-matching one literal string. Every field is
 *   `undefined` when unparseable: a caller must never see a guessed number,
 *   only a real one or an honest gap.
 */

import type { AiAgentName } from './types.mts'

/**
 * Parsed usage for one spawn. Every field is independently `undefined` when
 * that figure could not be found — a partial parse (tokens but no cost, or
 * vice versa) is expected and not an error.
 */
export interface AgentCost {
  readonly costUsd: number | undefined
  readonly inputTokens: number | undefined
  readonly outputTokens: number | undefined
  readonly totalTokens: number | undefined
}

// Inline JSON usage object, forward key order — Claude's `--print` mode and
// some Codex/OpenCode builds emit one inline (Anthropic-style
// `"input_tokens"`/`"output_tokens"`, or the OpenAI-style
// `"prompt_tokens"`/`"completion_tokens"`). Matched loosely (any surrounding
// keys, either naming) since the exact shape drifts across CLI versions:
// capture group 1 is the input-side count, group 2 the output-side count.
const JSON_USAGE_FORWARD_RE =
  /"(?:input_tokens|prompt_tokens)"\s*:\s*(\d+)[^{}]*?"(?:completion_tokens|output_tokens)"\s*:\s*(\d+)/i
// Same object, reversed key order: group 1 is output-side, group 2 input-side.
const JSON_USAGE_REVERSED_RE =
  /"(?:completion_tokens|output_tokens)"\s*:\s*(\d+)[^{}]*?"(?:input_tokens|prompt_tokens)"\s*:\s*(\d+)/i
const JSON_TOTAL_TOKENS_RE = /"total_tokens"\s*:\s*(\d+)/i
// A `costUsd` / `cost_usd` / `total_cost_usd` key (either naming), capturing
// the dollar amount that follows.
const JSON_COST_RE = /"(?:costUsd|cost_usd|total_cost_usd)"\s*:\s*([\d.]+)/i

// Text-footer fallbacks — a line like "Total cost: $0.0123" or "input tokens:
// 1,234". Tolerant of a "total "/"in"/"out" prefix and comma-separated
// thousands, since CLI wording drifts across versions (mirrors the
// signal-phrase matching in `spawn.mts`, not an exact sentence).
const TEXT_COST_RE = /\b(?:total\s+)?cost\b[^$\d]{0,10}\$?\s*([\d,]+\.?\d*)/i
// "input"/"prompt" label, then up to 20 non-digit chars, then the count, then
// "token(s)".
const TEXT_INPUT_TOKENS_RE =
  /\b(?:input|prompt)\b[^\d]{0,20}?([\d,]+)\s*tokens?\b/i
// Same shape for the output side: "output"/"completion" label ⇒ count ⇒
// "token(s)".
const TEXT_OUTPUT_TOKENS_RE =
  /\b(?:completion|output)\b[^\d]{0,20}?([\d,]+)\s*tokens?\b/i
const TEXT_TOTAL_TOKENS_RE = /\btotal\b[^\d]{0,20}?([\d,]+)\s*tokens?\b/i

/**
 * Extract token/cost usage from a spawn's `stdout` + `stderr`. `agent` is
 * accepted for a future per-CLI specialization (Codex and OpenCode may grow a
 * distinct machine-readable usage format), but today every agent runs through
 * the same tolerant JSON-then-text fallback chain: the GIST (a labeled number
 * near "tokens" / "cost", or an inline usage object) repeats across Claude,
 * Codex, and OpenCode alike. `totalTokens` is derived from `inputTokens` +
 * `outputTokens` when both are known and no explicit total was found. Never
 * throws; output with no usage signal at all returns every field
 * `undefined`.
 */
export function parseAgentCost(
  agent: AiAgentName,
  stdout: string,
  stderr: string,
): AgentCost {
  // Reserved for a future per-CLI specialization; every agent currently
  // shares the tolerant chain below.
  void agent
  const text = `${stdout}\n${stderr}`

  let inputTokens: number | undefined
  let outputTokens: number | undefined
  const forward = JSON_USAGE_FORWARD_RE.exec(text)
  if (forward) {
    inputTokens = parseNumber(forward[1])
    outputTokens = parseNumber(forward[2])
  } else {
    const reversed = JSON_USAGE_REVERSED_RE.exec(text)
    if (reversed) {
      outputTokens = parseNumber(reversed[1])
      inputTokens = parseNumber(reversed[2])
    }
  }
  if (inputTokens === undefined) {
    inputTokens = parseNumber(TEXT_INPUT_TOKENS_RE.exec(text)?.[1])
  }
  if (outputTokens === undefined) {
    outputTokens = parseNumber(TEXT_OUTPUT_TOKENS_RE.exec(text)?.[1])
  }

  let totalTokens =
    parseNumber(JSON_TOTAL_TOKENS_RE.exec(text)?.[1]) ??
    parseNumber(TEXT_TOTAL_TOKENS_RE.exec(text)?.[1])
  if (
    totalTokens === undefined &&
    inputTokens !== undefined &&
    outputTokens !== undefined
  ) {
    totalTokens = inputTokens + outputTokens
  }

  const costUsd =
    parseNumber(JSON_COST_RE.exec(text)?.[1]) ??
    parseNumber(TEXT_COST_RE.exec(text)?.[1])

  return { costUsd, inputTokens, outputTokens, totalTokens }
}

/**
 * Parse a captured numeric group, stripping thousands separators. Returns
 * `undefined` for a missing capture or a non-finite result rather than
 * guessing — the contract every `AgentCost` field relies on.
 */
export function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined
  }
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : undefined
}
