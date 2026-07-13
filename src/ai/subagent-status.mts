/**
 * @file The terminal-status contract a delegated subagent returns to its
 *   orchestrator. Subagent-driven development depends on a SMALL, fixed status
 *   vocabulary so the orchestrator can route deterministically instead of
 *   parsing free-form prose: a subagent that "sort of finished but has a worry"
 *   must be distinguishable from one that is genuinely blocked, because they
 *   escalate differently. The four states and their escalation paths are the
 *   contract; `escalationFor` is the single place that maps a state to what the
 *   orchestrator does next. Encoding it as a typed union + map (rather than a
 *   doc convention) is the code-is-law surface: a stray status string fails the
 *   guard, and `agent-delegation.md` is checked against this union so the prose
 *   can't drift from the code.
 */

import { ErrorCtor } from '../primordials/error'

/**
 * A subagent's terminal status.
 *
 * - `done` — work complete, no reservations; the orchestrator advances.
 * - `done-with-concerns` — work complete but the subagent flagged a risk or
 *   follow-up the orchestrator should surface before advancing.
 * - `needs-context` — the subagent lacks information it cannot obtain itself; the
 *   orchestrator supplies it and re-dispatches (a fresh attempt, not the same
 *   model retrying blind).
 * - `blocked` — the work cannot proceed without a decision or action only the
 *   user can provide; the orchestrator escalates to the user and stops.
 */
export type SubagentStatus =
  | 'blocked'
  | 'done'
  | 'done-with-concerns'
  | 'needs-context'

/**
 * What the orchestrator does for each terminal status. `advance` continues to
 * the next unit of work; `surface` advances but raises the concern first;
 * `redispatch` re-runs the unit with the missing context added; `escalate`
 * stops and hands the decision to the user.
 */
export type SubagentEscalation =
  | 'advance'
  | 'escalate'
  | 'redispatch'
  | 'surface'

const ESCALATION: Readonly<Record<SubagentStatus, SubagentEscalation>> = {
  __proto__: null,
  blocked: 'escalate',
  done: 'advance',
  'done-with-concerns': 'surface',
  'needs-context': 'redispatch',
} as unknown as Readonly<Record<SubagentStatus, SubagentEscalation>>

/**
 * The canonical status set, sorted, for callers that need to enumerate or
 * validate against the full vocabulary (the doc-parity check reads this).
 */
export const SUBAGENT_STATUSES: readonly SubagentStatus[] = [
  'blocked',
  'done',
  'done-with-concerns',
  'needs-context',
]

/**
 * Map a terminal status to the orchestrator action it requires. A status
 * outside the vocabulary is itself a contract violation, so this throws rather
 * than guessing — never force a retry on an unrecognized state.
 */
export function escalationFor(status: SubagentStatus): SubagentEscalation {
  const action = ESCALATION[status]
  if (!action) {
    throw new ErrorCtor(
      `escalationFor: unknown subagent status "${status}". Expected one of: ${SUBAGENT_STATUSES.join(', ')}. Return a status from the SubagentStatus contract.`,
    )
  }
  return action
}

/**
 * True when `value` names a status in the contract.
 *
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function isSubagentStatus(value: string): value is SubagentStatus {
  return SUBAGENT_STATUSES.includes(value as SubagentStatus)
}
