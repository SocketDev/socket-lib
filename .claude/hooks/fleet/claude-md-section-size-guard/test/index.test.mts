// node --test specs for the claude-md-section-size-guard hook.

import test from 'node:test'
import assert from 'node:assert/strict'
// prefer-async-spawn: streaming-stdio-required — test spawns child
// subprocess and pipes stdin/stdout/stderr; Node spawn returns the
// ChildProcess streaming surface the lib promise wrapper does not.
import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'index.mts')

type Result = { code: number; stderr: string }

async function runHook(
  payload: Record<string, unknown>,
  env?: NodeJS.ProcessEnv,
): Promise<Result> {
  const child = spawn(process.execPath, [HOOK], {
    stdio: 'pipe',
    env: { ...process.env, ...env },
  })
  // v6 lib-stable spawn returns an enriched Promise that rejects on
  // non-zero exit; this test reads stderr + exit via manual listeners
  // instead. Swallow the Promise rejection so it doesn't race the
  // listener-based resolve and trigger "async activity after test ended".
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

const PROLOG = `# Header\n\n<!-- BEGIN <fleet-canonical> -->\n\n`
const EPILOG = `\n<!-- END </fleet-canonical> -->\n\nAfter the block.\n`

// The thin CLAUDE.md is a flat bullet index — one `- ` line per rule.
function buildClaudeMd(bullets: string[]): string {
  return PROLOG + bullets.map(b => `- ${b}`).join('\n') + '\n' + EPILOG
}

test('non-Edit/Write tool calls pass through', async () => {
  const result = await runHook({
    tool_input: { command: 'ls' },
    tool_name: 'Bash',
  })
  assert.strictEqual(result.code, 0)
})

test('non-CLAUDE.md targets pass through', async () => {
  const result = await runHook({
    tool_input: {
      file_path: '/tmp/foo/README.md',
      content: buildClaudeMd(['x'.repeat(4000)]),
    },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 0)
})

test('allows short rule bullets under the default caps', async () => {
  const content = buildClaudeMd([
    'Use pnpm; never use npx. [`tooling`](docs/agents.md/fleet/tooling.md)',
    'Redact tokens always. [`token-hygiene`](docs/agents.md/fleet/token-hygiene.md)',
  ])
  const result = await runHook({
    tool_input: { file_path: '/x/CLAUDE.md', content },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 0)
})

test('blocks a rule bullet that exceeds the default 1500-byte cap', async () => {
  const content = buildClaudeMd([`Overgrown rule ${'x'.repeat(1600)}`])
  const result = await runHook({
    tool_input: { file_path: '/x/CLAUDE.md', content },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /Overgrown rule/)
  assert.match(result.stderr, /bytes/)
})

test('respects CLAUDE_MD_FLEET_SECTION_MAX_BYTES env override', async () => {
  const content = buildClaudeMd([`Dense rule ${'y'.repeat(1600)}`])
  const result = await runHook(
    {
      tool_input: { file_path: '/x/CLAUDE.md', content },
      tool_name: 'Write',
    },
    { CLAUDE_MD_FLEET_SECTION_MAX_BYTES: '5000' },
  )
  assert.strictEqual(result.code, 0)
})

test('reports MULTIPLE too-long bullets in one error message', async () => {
  const content = buildClaudeMd([
    `Rule A ${'a'.repeat(1600)}`,
    'Rule B is short.',
    `Rule C ${'c'.repeat(1600)}`,
  ])
  const result = await runHook({
    tool_input: { file_path: '/x/CLAUDE.md', content },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /Rule A/)
  assert.match(result.stderr, /Rule C/)
  assert.doesNotMatch(result.stderr, /Rule B/)
})

test('blocks when the fleet block exceeds 75% of the 40 KB budget', async () => {
  // Many ordinary bullets, each under the per-bullet cap, but together over
  // a low fleet-block cap. The block-budget check fires first.
  const content = buildClaudeMd(
    Array(50).fill('A reasonably sized rule bullet.'),
  )
  const result = await runHook(
    {
      tool_input: { file_path: '/x/CLAUDE.md', content },
      tool_name: 'Write',
    },
    { CLAUDE_MD_FLEET_BLOCK_MAX_BYTES: '500' },
  )
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /fleet block too large/)
  assert.match(result.stderr, /75% of the 40 KB/)
})

test('per-repo bullets (after the END marker) ARE capped', async () => {
  const content =
    PROLOG +
    `- Fleet rule. [\`x\`](docs/agents.md/fleet/x.md)\n` +
    EPILOG +
    `\n## 🏗️ Project-Specific\n\n- Repo rule ${'r'.repeat(1600)}`
  const result = await runHook({
    tool_input: { file_path: '/x/CLAUDE.md', content },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /Repo rule/)
})

test('a markerless CLAUDE.md is checked as all-per-repo', async () => {
  const content = '# No fleet block\n\n- Rule ' + 'z'.repeat(1600)
  const result = await runHook({
    tool_input: { file_path: '/x/CLAUDE.md', content },
    tool_name: 'Write',
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /Rule/)
})

test('Edit: when on-disk file is unreadable, falls back to new_string', async () => {
  const newString =
    `<!-- BEGIN <fleet-canonical> -->\n- overgrown ${'x'.repeat(1600)}\n` +
    `<!-- END </fleet-canonical> -->`
  const result = await runHook({
    tool_input: {
      file_path: '/nonexistent/CLAUDE.md',
      old_string: 'a',
      new_string: newString,
    },
    tool_name: 'Edit',
  })
  assert.strictEqual(result.code, 2)
  assert.match(result.stderr, /overgrown/)
})

test('fails open on malformed stdin', async () => {
  const child = spawn(process.execPath, [HOOK], { stdio: 'pipe' })
  child.stdin!.end('not valid json')
  let stderr = ''
  child.process.stderr!.on('data', chunk => {
    stderr += chunk.toString('utf8')
  })
  const code: number = await new Promise(resolve => {
    child.process.on('exit', c => resolve(c ?? 0))
  })
  assert.strictEqual(code, 0)
})

test('fails open on empty stdin', async () => {
  const child = spawn(process.execPath, [HOOK], { stdio: 'pipe' })
  child.stdin!.end('')
  const code: number = await new Promise(resolve => {
    child.process.on('exit', c => resolve(c ?? 0))
  })
  assert.strictEqual(code, 0)
})
