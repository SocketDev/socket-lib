// node --test specs for the claude-md-rule-add-guard hook.
//
// PreToolUse(Edit|Write|MultiEdit) guard. Blocks an Edit/Write to a CLAUDE.md
// that adds a rule surface — a NEW `### ` section OR a marked `- ` bullet
// (🚨 / enforcer citation) — whose text does NOT link a
// docs/agents.md/{fleet,repo}/<topic>.md detail doc. A doc-pointing rule is the
// canonical terse-index shape (allowed); PLAIN bullets and rewording are always
// allowed; section bloat is capped by claude-md-section-size-guard. Does NOT
// fire on non-CLAUDE.md files, the FLEET_SYNC / codify sanctioned writers, or
// when the bypass phrase is present. Fails open on a malformed payload.

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — the test spawns the hook as a
// subprocess and pipes stdin/stdout/stderr; Node spawn returns the streaming
// ChildProcess surface the lib promise wrapper does not.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function makeTranscript(userText: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claude-md-rule-add-guard-'))
  const file = path.join(dir, 'session.jsonl')
  writeFileSync(file, JSON.stringify({ role: 'user', content: userText }))
  return file
}

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

type Result = { code: number; stderr: string }

async function runHook(
  payload: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<Result> {
  const child = spawn(process.execPath, [HOOK], {
    stdio: 'pipe',
    env: { ...process.env, ...env },
  })
  void child.catch(() => undefined)
  child.stdin!.end(JSON.stringify(payload))
  let stderr = ''
  child.process.stderr!.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  return new Promise(resolve => {
    child.process.on('exit', code => {
      resolve({ code: code ?? 0, stderr })
    })
  })
}

const CLAUDE_MD = '/Users/x/projects/socket-foo/template/CLAUDE.md'
const OTHER = '/Users/x/projects/socket-foo/src/widget.mts'

// FIRES — a new `### ` section that does NOT link a detail doc.
test('blocks a new ### section with no detail-doc link', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string: '### New shiny rule\n\nAlways do the thing, in detail, inline.',
    },
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /claude-md-rule-add-guard/)
  assert.match(result.stderr, /docs\/agents\.md/)
})

// DOES-NOT-FIRE — a new section that links a fleet detail doc (canonical shape).
test('allows a new ### section linking a fleet doc', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string:
        '### Workflow-run retention\n\n🚨 Pruned weekly. Detail: [`workflow-run-retention`](docs/agents.md/fleet/workflow-run-retention.md).',
    },
  })
  assert.strictEqual(result.code, 0)
  assert.strictEqual(result.stderr, '')
})

// DOES-NOT-FIRE — a per-repo section linking a repo detail doc.
test('allows a new ### section linking a repo doc', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string:
        '### Local build quirk\n\nSee [`build-quirk`](docs/agents.md/repo/build-quirk.md).',
    },
  })
  assert.strictEqual(result.code, 0)
})

// FIRES — a marked 🚨 bullet with no detail-doc link.
test('blocks a 🚨 bullet with no doc link', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string: '- 🚨 Never commit a secret to the worktree.',
    },
  })
  assert.strictEqual(result.code, 2)
})

// DOES-NOT-FIRE — a marked bullet that links its detail doc (canonical shape).
test('allows a 🚨 bullet that links a doc', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string:
        '- 🚨 Never commit a secret — [`token-hygiene`](docs/agents.md/fleet/token-hygiene.md).',
    },
  })
  assert.strictEqual(result.code, 0)
})

// FIRES — a bullet citing a hook enforcer but no detail-doc link.
test('blocks a hook-citing bullet with no doc link', async () => {
  const result = await runHook({
    tool_name: 'Write',
    tool_input: {
      file_path: CLAUDE_MD,
      content: '- Some rule (`.claude/hooks/fleet/some-guard/`).',
    },
  })
  assert.strictEqual(result.code, 2)
})

// FIRES — a bullet citing a socket/<rule> but no detail-doc link.
test('blocks a socket-citing bullet with no doc link', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string: '- Prefer X over Y (`socket/prefer-x`).',
    },
  })
  assert.strictEqual(result.code, 2)
})

// DOES-NOT-FIRE — rewording an existing line (no new heading).
test('allows rewording prose with no new section', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string: 'Two parts: the fleet block and the project section.',
    },
  })
  assert.strictEqual(result.code, 0)
  assert.strictEqual(result.stderr, '')
})

// DOES-NOT-FIRE — a plain bullet with no marker is prose.
test('allows a plain unmarked bullet', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: CLAUDE_MD,
      new_string: '- a plain list item with no marker or enforcer',
    },
  })
  assert.strictEqual(result.code, 0)
})

// DOES-NOT-FIRE — edit to a non-CLAUDE.md file.
test('allows a section-shaped edit to a non-CLAUDE.md file', async () => {
  const result = await runHook({
    tool_name: 'Edit',
    tool_input: {
      file_path: OTHER,
      new_string: '### heading inside a source doc, no link',
    },
  })
  assert.strictEqual(result.code, 0)
})

// DOES-NOT-FIRE — the cascade (FLEET_SYNC=1) copies CLAUDE.md verbatim, even an
// un-deferred section.
test('allows the cascade writer (FLEET_SYNC=1)', async () => {
  const result = await runHook(
    {
      tool_name: 'Write',
      tool_input: { file_path: CLAUDE_MD, content: '### Cascaded rule\n' },
    },
    { FLEET_SYNC: '1' },
  )
  assert.strictEqual(result.code, 0)
})

// DOES-NOT-FIRE — the codify-rule agent's own write (SOCKET_CODIFY_RULE=1).
test('allows the codify-rule writer (SOCKET_CODIFY_RULE=1)', async () => {
  const result = await runHook(
    {
      tool_name: 'Edit',
      tool_input: { file_path: CLAUDE_MD, new_string: '### Codified rule\n' },
    },
    { SOCKET_CODIFY_RULE: '1' },
  )
  assert.strictEqual(result.code, 0)
})

// BYPASS — the phrase lets a genuine doc-less section through.
test('bypass phrase allows the undeferred section', async () => {
  const transcript = makeTranscript('Allow claude-md-rule-add bypass')
  const result = await runHook({
    tool_name: 'Edit',
    transcript_path: transcript,
    tool_input: { file_path: CLAUDE_MD, new_string: '### Manual rule\n' },
  })
  assert.strictEqual(result.code, 0)
})

// PASS-THROUGH — a non-Edit/Write tool is out of scope.
test('non-Edit/Write tool passes through', async () => {
  const result = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo "### not an edit"' },
  })
  assert.strictEqual(result.code, 0)
})

// MALFORMED — garbage stdin fails open (exit 0, no crash).
test('malformed payload fails open', async () => {
  const child = spawn(process.execPath, [HOOK], { stdio: 'pipe' })
  void child.catch(() => undefined)
  child.stdin!.end('not json at all {{{')
  const code: number = await new Promise(resolve => {
    child.process.on('exit', c => resolve(c ?? 0))
  })
  assert.strictEqual(code, 0)
})
