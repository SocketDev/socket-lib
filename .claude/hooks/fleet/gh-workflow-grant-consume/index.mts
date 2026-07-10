/**
 * @file PostToolUse companion to `gh-token-hygiene-guard`: consumes the
 *   single-use workflow-dispatch grant AFTER the dispatch command actually
 *   ran. Consumption cannot live in the PreToolUse guard — a sibling guard
 *   denying the same command there would burn the grant without any
 *   dispatch happening. Firing on PostToolUse means the whole PreToolUse
 *   chain allowed the command and the tool executed it, so "single-use"
 *   counts real uses.
 */

import { defineHook, runHook } from '../_shared/guard.mts'
import type { GuardResult } from '../_shared/guard.mts'
import type { ToolCallPayload } from '../_shared/payload.mts'
import {
  consumeWorkflowGrant,
  isWorkflowApiDispatch,
  isWorkflowDispatchCommand,
} from '../gh-token-hygiene-guard/index.mts'

interface BashPayload {
  tool_input?: { command?: string | undefined } | undefined
}

export const check = (payload: ToolCallPayload): GuardResult => {
  const command = (payload as BashPayload).tool_input?.command
  if (!command) {
    return undefined
  }
  if (isWorkflowDispatchCommand(command) || isWorkflowApiDispatch(command)) {
    consumeWorkflowGrant()
  }
  return undefined
}

export const hook = defineHook({
  check,
  event: 'PostToolUse',
  matcher: ['Bash'],
  type: 'guard',
})
void runHook(hook, import.meta.url)
