/**
 * @file Classify an agent CLI's failure output into the three conditions that
 *   call for different recovery: the model is unavailable, so fall over to
 *   another agent; the service is overloaded, so retry the same agent after
 *   backoff; or the quota is spent, so fall over to another provider/account.
 *   These read raw stdout/stderr and are pure, so `spawn.mts` owns the recovery
 *   policy while the pattern-matching stays independently testable.
 */

// True when the agent reported the SELECTED MODEL can't serve the request —
// distinct from an overload (529, transient, retry the same model). Two real
// signatures, both meaning "this model won't work, try a different agent":
//   - a temporary outage of a specific model, e.g. Fable while it is down:
//     "Claude Fable 5 is currently unavailable. Learn more: …"
//   - the model is gated/absent for this account:
//     "There's an issue with the selected model (<id>). It may not exist or
//      you may not have access to it. Run --model to pick a different model."
// Unlike `isOverloaded`, the right response is to FALL OVER to the next agent
// in the tier chain, not to retry the same one — the model isn't coming back
// within a backoff window.
//
// Match the GIST, not a literal sentence: CLI wording drifts across versions
// and providers (claude-code alone emits "currently unavailable", "is
// unavailable", "isn't available", "is temporarily unavailable", "does not
// exist", "not found", "may not have access", "issue with the selected
// model"), so detect the recurring SIGNAL PHRASES, not the exact captured
// strings. Plain lowercased substring checks — simpler + faster than regex and
// no alternation-ordering to maintain.

// Signal phrases that on their own mean "this model can't serve" regardless of
// surrounding wording. Lowercase; matched as substrings.
const MODEL_UNAVAILABLE_PHRASES: readonly string[] = [
  'access denied',
  'currently unavailable',
  'forbidden',
  'have access', // "don't/doesn't/may not have access"
  'is unavailable',
  'isn’t available',
  "isn't available",
  'may not exist',
  'no access to',
  'no such model',
  'not authorized',
  'not authorised',
  'not available',
  'permission denied',
  'permission_denied',
  'temporarily unavailable',
  'unauthorized',
  'unauthorised',
]

// Existence phrases that must be ANCHORED to "model" — a bare "not found" /
// "does not exist" / "unknown" in genuine work output (a missing file, a failed
// `require`) must NOT trigger a fall-over, so require "model" nearby.
const MODEL_EXISTENCE_PHRASES: readonly string[] = [
  'does not exist',
  "doesn't exist",
  'no such',
  'not exist',
  'not found',
  'unavailable',
  'unknown',
  'unreachable',
]

// Quota / rate-limit exhaustion — the seat or budget is SPENT (an HTTP 429, a
// rate-limit error, or a usage/quota cap). Distinct from a transient 529
// overload (`isOverloaded`, which retries the same agent) and a missing model
// (`isModelUnavailable`): the cheaper ration is gone, so the right response is
// to FALL OVER to a different provider/account, not retry the same one. This is
// the reactive cap signal for subscription seats (Claude Max, ChatGPT Pro) and
// metered accounts that have hit their rate/spend limit.
const QUOTA_EXHAUSTED_PHRASES: readonly string[] = [
  'exceeded your current quota',
  'insufficient_quota',
  'quota exceeded',
  'rate limit',
  'rate-limited',
  'rate_limit_error',
  'usage limit',
]

export function isModelUnavailable(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  for (let i = 0, { length } = MODEL_UNAVAILABLE_PHRASES; i < length; i += 1) {
    if (text.includes(MODEL_UNAVAILABLE_PHRASES[i]!)) {
      return true
    }
  }
  // model_not_found with any separator, plus the API status codes (403
  // no-access, 404 model-not-found) the http/programmatic backends surface.
  if (
    /\bmodel[_-]?not[_-]?found\b/i.test(text) ||
    /\bapi error:\s*(?:403|404)\b/i.test(text)
  ) {
    return true
  }
  // Existence words count only when "model" appears too (avoids false fall-over
  // on an unrelated not-found). Cheap: only scan if a candidate word is present.
  if (text.includes('model')) {
    for (let i = 0, { length } = MODEL_EXISTENCE_PHRASES; i < length; i += 1) {
      if (text.includes(MODEL_EXISTENCE_PHRASES[i]!)) {
        return true
      }
    }
  }
  return false
}

export function isOverloaded(stdout: string, stderr: string): boolean {
  const re = /API Error: 529|Overloaded/i
  return re.test(stdout) || re.test(stderr)
}

export function isQuotaExhausted(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase()
  // HTTP 429 from any backend, anchored so a stray "429" in work output (a port,
  // a line number) does not trigger a spurious fall-over.
  if (
    /\bapi error:\s*429\b/.test(text) ||
    text.includes('429 too many requests')
  ) {
    return true
  }
  for (let i = 0, { length } = QUOTA_EXHAUSTED_PHRASES; i < length; i += 1) {
    if (text.includes(QUOTA_EXHAUSTED_PHRASES[i]!)) {
      return true
    }
  }
  return false
}
