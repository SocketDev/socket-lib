#!/usr/bin/env node
// Claude Code Stop hook — follow-direct-imperative-nudge.
//
// Fires when the last USER turn is a bare imperative ("do it", "kill
// it", "land it") AND the most-recent ASSISTANT turn hedged before
// executing — the failure mode CLAUDE.md "Judgment & self-evaluation →
// Direct imperatives" targets: a paragraph weighing trade-offs where
// the response should have been the tool call.
//
// Turn-pair structure (read last user + last assistant, fire on
// trigger+deflection): the trigger is a predicate, not a regex —
// `looksLikeImperative` bounds length + requires an action-verb first
// word + rejects questions, which a regex can't express cleanly.
//
// Informational; never blocks.

import { defineHook, notify, runHook } from '../_shared/guard.mts'
import type { GuardResult } from '../_shared/guard.mts'
import type { ToolCallPayload } from '../_shared/payload.mts'
import {
  readLastAssistantText,
  readUserText,
  stripCodeFences,
} from '../_shared/transcript.mts'

// Imperative-command opening verbs/forms. Kept conservative —
// over-matching would trigger the reminder on normal conversation.
const IMPERATIVE_OPENERS = [
  'abort',
  'add',
  'apply',
  'build',
  'cancel',
  'check',
  'close',
  'commit',
  'continue',
  'delete',
  'deploy',
  'do',
  'execute',
  'finish',
  'fix',
  'follow',
  'go',
  'install',
  'just',
  'kill',
  'land',
  "let's",
  'list',
  'merge',
  'now',
  'open',
  'please',
  'push',
  'rebase',
  'redo',
  'remove',
  'rerun',
  'reset',
  'restart',
  'revert',
  'run',
  'show',
  'stop',
  'switch',
  'test',
  'try',
  'undo',
  'use',
]

// True when the text looks like a bare imperative directive (short,
// action-verb-led, no question mark, no long context).
export function looksLikeImperative(text: string): boolean {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) {
    return false
  }
  const body = trimmed.replace(/^[!,.\s]+/, '')
  // Questions invite analysis — never an imperative.
  if (body.includes('?')) {
    return false
  }
  // Long contextual messages are not bare imperatives.
  const wordCount = body.split(/\s+/).filter(Boolean).length
  if (wordCount > 8) {
    return false
  }
  const firstWord = body.split(/\s+/)[0] ?? ''
  return IMPERATIVE_OPENERS.includes(firstWord)
}

// Hedge / re-litigation markers — paragraphs that explain WHY the
// command might not help before (or instead of) the tool call landing.
const HEDGE_MARKERS: readonly RegExp[] = [
  /\bdoesn't help\b/i,
  /\bwon't help\b/i,
  /\bbefore (?:i|we) (?:do that|run|kick|switch|cancel)\b/i,
  /\blet me (?:explain|first|note)\b/i,
  /\b(?:to be clear|just so we'?re clear)\b/i,
  /\bworth (?:checking|confirming|noting)\b/i,
  /\bone thing to (?:note|flag)\b/i,
  /\bthat said\b/i,
  /\bactually,?\s+/i,
  /\b(?:however|but),?\s+(?:that|the|this)\b/i,
  /\bthe in-?flight\b/i,
  /\b(?:caveat|note|important):/i,
]

export function hasHedge(text: string): boolean {
  return HEDGE_MARKERS.some(re => re.test(text))
}

const IMPERATIVE_TRIGGER_LABEL =
  'bare imperative (short, action-verb-led, no question)'
const HEDGE_DEFLECTION_LABEL = 'hedge / re-litigation before executing'
const HEDGE_DEFLECTION_WHY =
  'The response to a bare command should be the tool call, not a paragraph weighing trade-offs. State the intent in one short sentence at most, then run it. If you think the directive is wrong, run it AFTER raising the concern — do not refuse to act. CLAUDE.md → "Judgment & self-evaluation" → Direct imperatives.'

export const check = (payload: ToolCallPayload): GuardResult => {
  const userText = stripCodeFences(readUserText(payload.transcript_path, 1))
  const assistantText = stripCodeFences(
    readLastAssistantText(payload.transcript_path),
  )
  if (!userText || !assistantText) {
    return undefined
  }
  if (!looksLikeImperative(userText)) {
    return undefined
  }
  if (!hasHedge(assistantText)) {
    return undefined
  }
  const userPreview = userText.trim().slice(0, 60).replace(/\s+/g, ' ')
  const lines = [
    '[follow-direct-imperative-nudge] User asked, assistant deflected:',
    '',
    `  User trigger: "${IMPERATIVE_TRIGGER_LABEL}" — "${userPreview}"`,
    `  Assistant deflection: "${HEDGE_DEFLECTION_LABEL}"`,
    `      ${HEDGE_DEFLECTION_WHY}`,
  ]
  return notify(lines.join('\n'))
}

export const hook = defineHook({
  check,
  event: 'Stop',
  type: 'nudge',
})
await runHook(hook, import.meta.url)
