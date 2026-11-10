import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadOpenRouterCredential } from '../../src/server/ai/credentials.js';
import { detectLanguage, explicitLanguage } from '../../src/server/ai/language.js';
import { validateSuggestion } from '../../src/server/ai/validation.js';

test('credential loader selects the injected key without inspecting a file', async () => {
  const result = await loadOpenRouterCredential({ OPENROUTER_API_KEY: `sk-or-v1-${'a'.repeat(32)}`, OPENROUTER_CREDENTIAL_FILE: 'D:\\never-read-secret' } as NodeJS.ProcessEnv);
  assert.equal(result.state, 'configured'); assert.equal(result.source, 'environment');
  assert.equal(result.key, `sk-or-v1-${'a'.repeat(32)}`);
});

test('credential file resolver accepts one provider-labeled key and fails closed on ambiguity', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'itinerary-ai-key-'));
  const file = path.join(directory, 'credentials.md');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = `sk-or-v1-${'b'.repeat(32)}`;
  await writeFile(file, `OpenRouter API key: ${first}`, 'utf8');
  assert.equal((await loadOpenRouterCredential({ OPENROUTER_CREDENTIAL_FILE: file } as NodeJS.ProcessEnv)).state, 'configured');
  await writeFile(file, `OpenRouter key: ${first}\nOpenRouter backup: sk-or-v1-${'c'.repeat(32)}`, 'utf8');
  assert.equal((await loadOpenRouterCredential({ OPENROUTER_CREDENTIAL_FILE: file } as NodeJS.ProcessEnv)).state, 'ambiguous');
  assert.equal((await loadOpenRouterCredential({} as NodeJS.ProcessEnv)).state, 'missing');
});

test('language resolution accepts clear text and keeps short, mixed and unproved Chinese scripts unresolved', () => {
  const french = 'Une promenade tranquille dans les jardins et les ruelles historiques, avec un guide local qui explique la culture de la région.';
  const resolved = detectLanguage(french, []);
  assert.equal(resolved.status, 'resolved'); assert.equal(resolved.locale, 'fr');
  assert.equal(detectLanguage('Kyoto gardens', []).status, 'unresolved');
  assert.equal(detectLanguage('Short notes only.', []).status, 'unresolved');
  const mixed = detectLanguage(french, [{ targetId: 'itinerary', text: 'A quiet walk through gardens and historic lanes with a local guide sharing regional stories and traditions for the whole group.' }]);
  assert.equal(mixed.status, 'unresolved');
  assert.equal(detectLanguage('在宁静的花园和历史街巷中悠闲漫步，并由当地向导介绍该地区的文化。'.repeat(4), []).status, 'unresolved');
  assert.equal(explicitLanguage('zh-Hans-CN').locale, 'zh-Hans-CN');
});

test('AI output contract rejects malformed, wrong-locale, money and opening-hour claims', () => {
  assert.equal(validateSuggestion('not json', 'en', 'overview').ok, false);
  assert.equal(validateSuggestion(JSON.stringify({ text: 'The garden is peaceful and the local guide shares stories about regional traditions for visitors.' }), 'fr', 'overview').ok, false);
  assert.equal(validateSuggestion(JSON.stringify({ text: 'The ticket costs $25 per visitor.' }), 'en', 'overview').ok, false);
  assert.equal(validateSuggestion(JSON.stringify({ text: 'The venue opens at 09:00 every day.' }), 'en', 'overview').ok, false);
  const legitimate = JSON.stringify({ text: 'Ticket prices are not listed here; morning visits may feel comfortable in the garden.' });
  assert.equal(validateSuggestion(legitimate, 'en', 'overview').ok, true);
  assert.equal(validateSuggestion(JSON.stringify({ text: '庭園をゆっくり歩き、地元の文化や季節の景色を楽しめます。' }), 'ja', 'place').ok, true);
  assert.equal(validateSuggestion(JSON.stringify({ text: 'Short.' }), 'en', 'overview').ok, true);
});
