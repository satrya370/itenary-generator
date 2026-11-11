import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { GooglePlacesProvider, PhotonPlacesProvider, createPlacesProvider, defaultDailyLimit, disabledPlacesProvider, parsePhotonSuggestions, photonLanguage, type PlacesProvider } from '../../src/server/places/provider.js';

const SECRET = 'AIza-test-secret-key-value';
const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };

const photonBody = {
  features: [
    { properties: { osm_type: 'N', osm_id: 1, name: 'Ubud Palace', district: 'Ubud', city: 'Ubud', county: 'Gianyar', state: 'Bali', country: 'Indonesia' } },
    { properties: { osm_type: 'W', osm_id: 2, name: 'Kuta Beach', district: 'Kuta', city: 'Kuta', state: 'Bali', country: 'Indonesia' } },
    { properties: { osm_type: 'W', osm_id: 2, name: 'Kuta Beach', city: 'Kuta', state: 'Bali', country: 'Indonesia' } },
    { properties: { osm_type: 'W', osm_id: 3, name: 'Kuta Beach', district: 'Kuta', city: 'Kuta', state: 'Bali', country: 'Indonesia' } },
    { properties: { osm_type: 'X', osm_id: 4, name: 'Bad type' } },
    { properties: { osm_type: 'N', osm_id: 'abc', name: 'Bad id' } },
    { properties: { osm_type: 'N', osm_id: 5, name: '  ' } },
    { properties: { osm_type: 'R', osm_id: 6, name: 'Tanah Lot' } },
    'not an object',
    { geometry: {} }
  ]
};

test('Photon parsing keeps named places, drops repeated objects and labels, and tidies the area line', () => {
  assert.deepEqual(parsePhotonSuggestions(photonBody), [
    { placeId: 'N1', mainText: 'Ubud Palace', secondaryText: 'Ubud, Bali, Indonesia' },
    { placeId: 'W2', mainText: 'Kuta Beach', secondaryText: 'Kuta, Bali, Indonesia' },
    { placeId: 'R6', mainText: 'Tanah Lot', secondaryText: '' }
  ]);
  assert.deepEqual(parsePhotonSuggestions(null), []);
  assert.deepEqual(parsePhotonSuggestions({ features: 'nope' }), []);
});

test('the Photon provider sends no key, excludes roads, and only sends languages Photon accepts', async () => {
  const seen: URL[] = [];
  let userAgent = '';
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(new URL(String(url)));
    userAgent = String((init?.headers as Record<string, string>)['user-agent']);
    return new Response(JSON.stringify(photonBody), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const provider = new PhotonPlacesProvider(fakeFetch);
  assert.equal(provider.configured, true);
  assert.equal(provider.source, 'osm');
  await provider.autocomplete({ text: 'ubud palace', sessionToken: 's', languageCode: 'id' });
  await provider.autocomplete({ text: 'ubud palace', sessionToken: 's', languageCode: 'en' });
  assert.equal(seen[0].origin + seen[0].pathname, 'https://photon.komoot.io/api/');
  assert.equal(seen[0].searchParams.get('q'), 'ubud palace');
  assert.equal(seen[0].searchParams.get('osm_tag'), '!highway');
  assert.equal(seen[0].searchParams.get('lang'), null, 'id is rejected by Photon, so it is not sent');
  assert.equal(seen[1].searchParams.get('lang'), 'en');
  assert.equal(userAgent, 'itinerary-engine');
  assert.equal([...seen[0].searchParams.keys()].some((key) => /key|token/i.test(key)), false);
  assert.equal(photonLanguage('fr'), 'fr');
  for (const tag of ['ja', 'zh-Hans', 'la', 'id', null]) assert.equal(photonLanguage(tag), undefined);
  const busy = new PhotonPlacesProvider((async () => new Response('busy', { status: 429 })) as typeof fetch);
  await assert.rejects(busy.autocomplete({ text: 'bali', sessionToken: 's', languageCode: null }), /HTTP 429/);
});

test('provider choice: Photon by default, Google only when asked, off disables, anything else fails fast', () => {
  assert.equal(createPlacesProvider({}).source, 'osm');
  assert.equal(createPlacesProvider({ PLACES_PROVIDER: ' Photon ' }).source, 'osm');
  const google = createPlacesProvider({ PLACES_PROVIDER: 'google', GOOGLE_PLACES_API_KEY: SECRET });
  assert.equal(google.source, 'google');
  assert.equal(google.configured, true);
  assert.equal(createPlacesProvider({ PLACES_PROVIDER: 'google' }).configured, false);
  assert.equal(createPlacesProvider({ GOOGLE_PLACES_API_KEY: SECRET }).source, 'osm', 'a key alone does not switch the provider');
  assert.equal(createPlacesProvider({ PLACES_PROVIDER: 'off' }), disabledPlacesProvider);
  assert.equal(disabledPlacesProvider.configured, false);
  assert.throws(() => createPlacesProvider({ PLACES_PROVIDER: 'bing' }), /PLACES_PROVIDER/);
  assert.equal(defaultDailyLimit('osm'), 1000);
  assert.equal(defaultDailyLimit('google'), 300);
});

test('the route names its source and refuses a turned-off provider with 503', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp036-src-'));
  const google = new GooglePlacesProvider(SECRET, (async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 })) as typeof fetch);
  const run = async (provider: PlacesProvider) => {
    const app = await createApp({ dataDir, placesProvider: provider });
    try { return await app.inject({ method: 'POST', url: '/api/v1/places/autocomplete', headers, payload: { text: 'ubud', sessionToken: randomUUID() } }); }
    finally { await app.close(); }
  };
  t.after(async () => { await rm(dataDir, { recursive: true, force: true }); });
  const fromGoogle = await run(google);
  assert.equal(fromGoogle.statusCode, 200);
  assert.equal(fromGoogle.json().source, 'google');
  const fromPhoton = await run(new PhotonPlacesProvider((async () => new Response(JSON.stringify(photonBody), { status: 200 })) as typeof fetch));
  assert.equal(fromPhoton.json().source, 'osm');
  assert.equal(fromPhoton.json().suggestions.length, 3);
  const off = await run(disabledPlacesProvider);
  assert.equal(off.statusCode, 503);
  assert.equal(off.json().error.code, 'PLACES_UNAVAILABLE');
});
