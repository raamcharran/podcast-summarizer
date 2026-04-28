import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAiConfig, getAiConfig } from '../lib/ai.js';

test('Codex environment auto-detects codex before API-key providers', () => {
  const config = getAiConfig({
    CODEX_SHELL: '1',
    OPENAI_API_KEY: 'sk-openai-test',
  });

  assert.equal(config.provider, 'codex');
  assert.equal(config.model, 'session-default');
});

test('explicit AI_PROVIDER overrides environment auto-detection', () => {
  const config = getAiConfig({
    AI_PROVIDER: 'openai',
    CODEX_SHELL: '1',
    OPENAI_API_KEY: 'sk-openai-test',
  });

  assert.equal(config.provider, 'openai');
});

test('provider aliases canonicalize to supported local session providers', () => {
  assert.equal(getAiConfig({ AI_PROVIDER: 'claude-code' }).provider, 'claude-cli');
  assert.equal(getAiConfig({ AI_PROVIDER: 'codex-cli' }).provider, 'codex');
});

test('default fallback remains Claude Code session outside Codex', () => {
  const config = getAiConfig({});
  assert.equal(config.provider, 'claude-cli');
  assert.equal(config.model, 'session-default');
});

test('describeAiConfig labels local session providers clearly', () => {
  assert.equal(
    describeAiConfig({ provider: 'claude-cli', model: 'session-default' }),
    'Claude Code session'
  );
  assert.equal(
    describeAiConfig({ provider: 'codex', model: 'session-default' }),
    'Codex session'
  );
  assert.equal(
    describeAiConfig({ provider: 'codex', model: 'gpt-5.4' }),
    'Codex session:gpt-5.4'
  );
});
