/**
 * @file Zero-dependency JSON hardening for noisy model text. Structured output
 *   from a small on-device model, and JSON embedded in an agent CLI's chatty
 *   reply, are both unreliable: fullwidth punctuation, curly quotes, markdown
 *   code fences, synonymous keys, an object that ends one `}` short, or prose
 *   wrapped around the payload. The router already parses JSON out of model
 *   output (`cost.mts` reads usage objects), so these tolerant, pure repair
 *   primitives live here as the shared boundary: strip a fence, normalize
 *   typographic punctuation, canonicalize keys, extract the first balanced
 *   object, or close an under-terminated one. Every function is pure and
 *   allocation-light, and each runs only on a REPAIR path after a strict parse
 *   already failed, so a legitimate value can at worst stay as unparseable as
 *   it started: the repairs never corrupt a payload that was already valid.
 */

/**
 * Close an under-terminated JSON object by appending the closers its open stack
 * still needs. Observed live from Qwen2.5-Coder-7B: the object arrives one `}`
 * short, which both strict parsing and balanced-prefix extraction reject. Walks
 * from the first `{` with string and escape tracking, then appends the missing
 * closers in reverse open order. Returns `undefined` when the text has no
 * object start, ends inside a string, closes with a mismatched bracket, or is
 * already balanced: the caller uses this only as a last-resort reparse, so
 * "nothing to do" and "cannot repair" both yield `undefined`.
 */
export function closeUnbalancedJson(raw: string): string | undefined {
  const start = raw.indexOf('{')
  if (start === -1) {
    return undefined
  }
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let i = start, { length } = raw; i < length; i += 1) {
    const char = raw[i]!
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      stack.push('}')
    } else if (char === '[') {
      stack.push(']')
    } else if (char === ']' || char === '}') {
      if (stack.pop() !== char) {
        return undefined
      }
      if (stack.length === 0) {
        return undefined
      }
    }
  }
  if (inString || stack.length === 0) {
    return undefined
  }
  return raw.slice(start) + stack.toReversed().join('')
}

/**
 * Resolve a key to its canonical form via a synonym map, case-insensitively. A
 * canonical name matching the key or any of its synonyms wins; otherwise the
 * original key is returned unchanged. Models paraphrase field names ("summary"
 * vs "description"), so a caller supplies the accepted synonyms per canonical
 * key.
 */
export function findCanonicalKey(
  key: string,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
  synonymMap: Record<string, string[]>,
): string {
  const lower = key.toLowerCase()
  for (const { 0: canonical, 1: synonyms } of Object.entries(synonymMap)) {
    if (canonical.toLowerCase() === lower) {
      return canonical
    }
    for (let i = 0, { length } = synonyms; i < length; i += 1) {
      if (synonyms[i]!.toLowerCase() === lower) {
        return canonical
      }
    }
  }
  return key
}

/**
 * Replace fullwidth and typographic JSON punctuation with the ASCII forms.
 * Small on-device models emit fullwidth comma, colon, and semicolon plus curly
 * quotes mid-structure, observed live from Gemini Nano at temperature 0, and a
 * strict `JSON.parse` rejects them. Only runs on the repair path, after a
 * strict parse already failed, so a legitimate curly quote inside a string
 * value can at worst leave the reply as unparseable as it started.
 */
export function normalizeJsonPunctuation(raw: string): string {
  return raw
    .replaceAll('\u{FF0C}', ',')
    .replaceAll('\u{FF1A}', ':')
    .replaceAll('\u{FF1B}', ';')
    .replaceAll(/[\u{201C}\u{201D}]/gu, '"')
    .replaceAll(/[\u{2018}\u{2019}]/gu, "'")
}

/**
 * Recursively rewrite every object key to its canonical form (see
 * `findCanonicalKey`), walking arrays and nested objects. Primitives pass
 * through untouched. The generic return is the API contract: callers pick the
 * normalized shape; returning `unknown` would push an unsafe cast to every call
 * site.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the generic return is the API contract, not incidental.
export function normalizeKeys<T>(
  value: unknown,
  // oxlint-disable-next-line socket/prefer-refined-record -- open string keys
  synonymMap: Record<string, string[]>,
): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value as T
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeKeys(item, synonymMap)) as T
  }
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const { 0: key, 1: sourceValue } of Object.entries(source)) {
    const canonical = findCanonicalKey(key, synonymMap)
    result[canonical] = normalizeKeys(sourceValue, synonymMap)
  }
  return result as T
}

/**
 * Extract the first BALANCED top-level JSON object as a substring, from its
 * first `{` to the matching `}`. Ignores braces inside strings so a `}` in a
 * string value does not close the object early. Returns `'{}'` when there is no
 * object start or no balanced close, a total contract the caller can always
 * feed to `JSON.parse`. Use when a model wraps the object in prose.
 */
export function repairJson(raw: string): string {
  const start = raw.indexOf('{')
  if (start === -1) {
    return '{}'
  }
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start, { length } = raw; i < length; i += 1) {
    const char = raw[i]!
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return raw.slice(start, i + 1)
      }
    }
  }
  return '{}'
}

/**
 * Extract the content of the first markdown code fence, or return the trimmed
 * input when there is none. Models routinely wrap a JSON reply in a fence
 * despite being told not to; stripping it is the first repair step before any
 * parse attempt.
 */
export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  // Opening ``` optionally followed by `json` (?:json)?, then optional
  // whitespace \s*, then a lazy capture of the fenced body ([\s\S]*?) up to the
  // closing ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim()
  }
  return trimmed
}
