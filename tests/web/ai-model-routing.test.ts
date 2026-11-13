import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function checkModels(writing: string, extraction: string, expectedWriting: string, expectedExtraction: string) {
  const script = `
    import assert from 'node:assert/strict';
    import { OpenRouterProvider, MODEL_ID, IMPORT_MODEL_ID } from './src/server/ai/provider.ts';
    const models = [];
    const provider = new OpenRouterProvider({ state: 'configured', source: 'environment', key: 'test-only' }, async (_url, init) => {
      models.push(JSON.parse(init.body).model);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: {} }), { status: 200 });
    });
    await provider.extract({ mode: 'full_day', locale: 'id', segments: ['Ringkasan perjalanan.'], maxTokens: 100 });
    await provider.generate({ task: 'overview', locale: 'id', context: {}, maxTokens: 100 });
    assert.equal(MODEL_ID, ${JSON.stringify(expectedWriting)});
    assert.equal(IMPORT_MODEL_ID, ${JSON.stringify(expectedExtraction)});
    assert.deepEqual(models, [${JSON.stringify(expectedExtraction)}, ${JSON.stringify(expectedWriting)}]);
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, OPENROUTER_MODEL: writing, OPENROUTER_IMPORT_MODEL: extraction }
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test('import and writing route to separate configured OpenRouter models', () => {
  checkModels('openai/gpt-oss-120b', 'anthropic/claude-haiku-5.5', 'openai/gpt-oss-120b', 'anthropic/claude-haiku-5.5');
});

test('import defaults to writing and empty overrides retain the previous model', () => {
  checkModels('openai/gpt-oss-120b', '', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b');
  checkModels('', '', 'openai/gpt-6-luna', 'openai/gpt-6-luna');
});
