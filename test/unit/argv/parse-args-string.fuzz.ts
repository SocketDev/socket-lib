/**
 * @file Vitiate coverage-guided fuzz target (Tier 2) for src/argv/parse-args-string
 *   — the untrusted-input shell-string tokenizer (config files, a package's
 *   `bin` string, CI env). Complements the fast-check property test in
 *   parse-args-string.fuzz.test.mts: fast-check checks the tokenizer's contract
 *   on generated command strings; vitiate feeds SWC-coverage-guided mutated
 *   BYTES to drive the quoting/escaping state machine (and its shellParse
 *   fallback) into deep paths a spec-based generator rarely reaches. The
 *   documented contract is total: `parseArgsString` NEVER throws on any input
 *   (the malformed-`${...}` fix in commit bb892f5d made it so), so any thrown
 *   error here is a crash. Run via `pnpm run test:fuzz`.
 */

import { fuzz } from '@vitiate/core'

import { parseArgsString } from '../../../src/argv/parse-args-string'

fuzz('parseArgsString never throws on arbitrary bytes', data => {
  parseArgsString(data.toString('utf8'))
})
