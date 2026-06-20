// Unit tests for defer-to-script-nudge — the pure detectors + the hook verdict.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  hook,
  isSkillOrCommandDoc,
  maxCodeBlockLines,
  referencesScript,
} from '../index.mts'

const BIG_BLOCK = [
  '```bash',
  ...Array.from({ length: 20 }, () => 'echo hi'),
  '```',
].join('\n')

describe('defer-to-script-nudge', () => {
  test('isSkillOrCommandDoc', () => {
    assert.equal(isSkillOrCommandDoc('.claude/skills/fleet/x/SKILL.md'), true)
    assert.equal(isSkillOrCommandDoc('.claude/commands/fleet/y.md'), true)
    assert.equal(isSkillOrCommandDoc('src/z.mts'), false)
    assert.equal(isSkillOrCommandDoc('.claude/skills/x/README.md'), false)
  })

  test('maxCodeBlockLines', () => {
    assert.ok(maxCodeBlockLines(BIG_BLOCK) > 12)
    assert.equal(maxCodeBlockLines('no code here'), 0)
    assert.equal(maxCodeBlockLines('```json\n{}\n```'), 0)
  })

  test('referencesScript', () => {
    assert.equal(referencesScript('see scripts/fleet/foo.mts'), true)
    assert.equal(referencesScript('just prose'), false)
  })

  test('nudges a heavy skill with no backing script', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: {
        file_path: '.claude/skills/fleet/x/SKILL.md',
        content: `# X\n\n${BIG_BLOCK}\n`,
      },
    })
    assert.equal(verdict?.kind, 'notify')
  })

  test('quiet when the skill references a backing script', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: {
        file_path: '.claude/skills/fleet/x/SKILL.md',
        content: `# X\n\nRun \`scripts/fleet/x.mts\`.\n\n${BIG_BLOCK}\n`,
      },
    })
    assert.equal(verdict, undefined)
  })

  test('quiet on a non-skill file', async () => {
    const verdict = await hook.invoke({
      tool_name: 'Write',
      tool_input: { file_path: 'README.md', content: BIG_BLOCK },
    })
    assert.equal(verdict, undefined)
  })
})
