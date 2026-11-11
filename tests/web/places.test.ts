import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { GooglePlacesProvider, googleLanguageCode, parseGoogleSuggestions, type PlaceSuggestion, type PlacesAutocompleteInput, type PlacesProvider } from '../../src/server/places/provider.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };
const SECRET = 'AIza-test-secret-key-value';
const suggestion: PlaceSuggestion = { placeId: 'ChIJ-test-place', mainText: 'Kiyomizu-dera', secondaryText: 'Kyoto, Japan' };

function double(overrides: { configured?: boolean; result?: PlaceSuggestion[]; fail?: boolean } = {}) {
  const calls: PlacesAutocompleteInput[] = [];
  const provider: PlacesProvider = {
    configured: overrides.configured ?? true,
    async autocomplete(input) {
      calls.push(input);
      if (overrides.fail) throw new Error(`upstream rejected key ${SECRET}`);
      return overrides.result ?? [suggestion];
    }
  };
  return { provider, calls };
}

async function fixture(t: TestContext, options: { placesProvider: PlacesProvider; placesDailyLimit?: number }) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp036-'));
  const app = await createApp({ dataDir, ...options });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return app;
}

const search = (app: Awaited<ReturnType<typeof createApp>>, payload: unknown, extraHeaders: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/places/autocomplete', headers: { ...headers, ...extraHeaders }, payload: payload as object });

const body = (overrides: Record<string, unknown> = {}) => ({ text: 'kiyomi', sessionToken: randomUUID(), ...overrides });

test('autocomplete returns suggestions and the remaining count, and counts one request', async (t) => {
  const { provider, calls } = double();
  const app = await fixture(t, { placesProvider: provider, placesDailyLimit: 3 });
  const response = await search(app, body({ languageCode: 'ja' }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { suggestions: [suggestion], remainingToday: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].languageCode, 'ja');
  assert.equal(calls[0].text, 'kiyomi');
});

test('invalid bodies are rejected before any provider call', async (t) => {
  const { provider, calls } = double();
  const app = await fixture(t, { placesProvider: provider });
  const bad = [
    body({ text: 'ab' }),
    body({ text: 'x'.repeat(101) }),
    body({ sessionToken: 'not-a-uuid' }),
    body({ languageCode: 'klingon' }),
    body({ extra: true }),
    { text: 'kiyomi' }
  ];
  for (const payload of bad) {
    const response = await search(app, payload);
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(calls.length, 0);
});

test('without a key the route answers 503 and never calls the provider', async (t) => {
  const { provider, calls } = double({ configured: false });
  const app = await fixture(t, { placesProvider: provider });
  const response = await search(app, body());
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'PLACES_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

test('the daily limit answers 429 with no provider call and no extra count', async (t) => {
  const { provider, calls } = double();
  const app = await fixture(t, { placesProvider: provider, placesDailyLimit: 2 });
  assert.equal((await search(app, body())).statusCode, 200);
  assert.equal((await search(app, body())).statusCode, 200);
  const limited = await search(app, body());
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'PLACES_DAILY_LIMIT');
  assert.equal(calls.length, 2);
  const store = (app as unknown as { store: { db: { prepare(sql: string): { all(): unknown[] } } } }).store;
  const counted = store.db.prepare('SELECT count FROM places_usage').all() as Array<{ count: number }>;
  assert.deepEqual(counted.map((row) => Number(row.count)), [2]);
});

test('a zero limit disables the provider entirely', async (t) => {
  const { provider, calls } = double();
  const app = await fixture(t, { placesProvider: provider, placesDailyLimit: 0 });
  assert.equal((await search(app, body())).statusCode, 429);
  assert.equal(calls.length, 0);
});

test('a provider error answers 502 and leaks neither the key nor upstream text', async (t) => {
  const { provider } = double({ fail: true });
  const app = await fixture(t, { placesProvider: provider });
  const response = await search(app, body());
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error.code, 'PLACES_FAILED');
  assert.equal(response.body.includes(SECRET), false);
});

test('responses never contain the configured key', async (t) => {
  const { provider } = double();
  const app = await fixture(t, { placesProvider: provider });
  const response = await search(app, body());
  assert.equal(response.body.includes(SECRET), false);
});

test('the Google provider sends the key in a header, uses the field mask, and maps only place predictions', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({
      suggestions: [
        { placePrediction: { placeId: 'P1', structuredFormat: { mainText: { text: 'Ubud Palace' }, secondaryText: { text: 'Ubud, Bali' } } } },
        { queryPrediction: { text: { text: 'ubud' } } },
        { placePrediction: { placeId: '', structuredFormat: { mainText: { text: 'skip' } } } }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const provider = new GooglePlacesProvider(SECRET, fakeFetch);
  assert.equal(provider.configured, true);
  const result = await provider.autocomplete({ text: 'ubud', sessionToken: 'session', languageCode: 'zh-Hans' });
  assert.deepEqual(result, [{ placeId: 'P1', mainText: 'Ubud Palace', secondaryText: 'Ubud, Bali' }]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://places.googleapis.com/v1/places:autocomplete');
  const headersSent = seen[0].init.headers as Record<string, string>;
  assert.equal(headersSent['X-Goog-Api-Key'], SECRET);
  assert.equal(headersSent['X-Goog-FieldMask'], 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat');
  assert.equal(String(seen[0].init.body).includes(SECRET), false);
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { input: 'ubud', sessionToken: 'session', languageCode: 'zh-CN' });
});

test('the Google provider fails closed without a key and on an HTTP error', async () => {
  assert.equal(new GooglePlacesProvider('   ').configured, false);
  const failing = new GooglePlacesProvider(SECRET, (async () => new Response('denied', { status: 403 })) as typeof fetch);
  await assert.rejects(failing.autocomplete({ text: 'bali', sessionToken: 'session', languageCode: null }), /HTTP 403/);
  await assert.rejects(new GooglePlacesProvider(undefined).autocomplete({ text: 'bali', sessionToken: 's', languageCode: null }), /not configured/);
});

test('language mapping and suggestion parsing are defensive', () => {
  assert.equal(googleLanguageCode(null), undefined);
  assert.equal(googleLanguageCode('la'), undefined);
  assert.equal(googleLanguageCode('fr'), 'fr');
  assert.equal(googleLanguageCode('zh-Hans'), 'zh-CN');
  assert.deepEqual(parseGoogleSuggestions(null), []);
  assert.deepEqual(parseGoogleSuggestions({ suggestions: 'nope' }), []);
  const many = Array.from({ length: 8 }, (_, index) => ({ placePrediction: { placeId: `P${index}`, structuredFormat: { mainText: { text: `Place ${index}` } } } }));
  const parsed = parseGoogleSuggestions({ suggestions: many });
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0].secondaryText, '');
});
