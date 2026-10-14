import { expect, test } from 'claude-code/testing'

test('GIVEN the scaffold stub WHEN a prompt reaches classic.UserPromptSubmit THEN the engine answer passes untouched', async ($, on) => {
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['engine-block'] }))

  const result = await $.classic.UserPromptSubmit({ prompt: '++m ++r', permission_mode: 'plan' })

  expect(result).toEqual({ additionalContext: ['engine-block'] })
})

test('GIVEN invalid userConfig values WHEN the plugin loads THEN the stub still passes the prompt through', { options: { knownColor: 'not-a-color', prefix: '++' } }, async ($, on) => {
  on('classic.UserPromptSubmit', () => ({}))

  const result = await $.classic.UserPromptSubmit({ prompt: '++a', permission_mode: 'default' })

  expect(result).toEqual({})
})
