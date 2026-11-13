import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

if (process.env.IMPORT_LIVE !== '1') throw new Error('Set IMPORT_LIVE=1 to authorize five paid text imports.');
process.loadEnvFile('.env.web');
const { createApp } = await import('../../src/server/app.js');
const { OpenRouterProvider, MODEL_ID, IMPORT_MODEL_ID } = await import('../../src/server/ai/provider.js');
const { loadOpenRouterCredential } = await import('../../src/server/ai/credentials.js');
const credential = await loadOpenRouterCredential();
assert.equal(credential.state, 'configured');
const calls: Array<{ model: string; status: number; elapsedMs: number }> = [];
const provider = new OpenRouterProvider(credential, async (url, init) => {
  const start = performance.now();
  const response = await fetch(url, init);
  if (String(url).endsWith('/chat/completions')) calls.push({ model: JSON.parse(String(init?.body)).model, status: response.status, elapsedMs: Math.round(performance.now() - start) });
  return response;
});
const preflight = await provider.preflight();
assert.equal(preflight.authenticated, true, 'OpenRouter authentication failed');
assert.equal(preflight.modelState, 'listed', 'Writing model unavailable');
const catalog = await (await fetch('https://openrouter.ai/api/v1/models')).json() as { data: Array<{ id: string }> };
assert.ok(catalog.data.some(model => model.id === IMPORT_MODEL_ID), 'Import model unavailable');

const cases = [
  { name: 'Indonesia terstruktur (CRLF)', mode: 'full_day', language: 'id', title: 'Tur Bandung Sehari', summary: 'Perjalanan santai menjelajahi museum dan kawasan bersejarah Bandung.', text: 'Tur Bandung Sehari\r\nDestinasi: Bandung\r\nNegara: Indonesia\r\nTanggal: 20 Desember 2026\r\nRingkasan\r\nPerjalanan santai menjelajahi museum dan kawasan bersejarah Bandung.\r\n08:00 Jemput di stasiun - 30 menit\r\n09:00 Museum Geologi (1 jam)\r\n12:00 Makan siang\r\nTermasuk\r\n- Transportasi\r\n- Air mineral\r\nTidak termasuk\r\n- Tiket masuk' },
  { name: 'English messy, emoji, 12-hour clock', mode: 'half_day', language: 'en', title: 'Kyoto morning walk 🌸', summary: 'A gentle morning walk through Kyoto gardens and historic streets.', text: 'Kyoto morning walk 🌸\nDestination: Kyoto\nCountry: Japan\n\nA gentle morning walk through Kyoto gardens and historic streets.\n8:00 am - 9:30 am Fushimi Inari shrine walk\n10:00 am Garden visit\n12:00 pm Lunch at a local cafe\nIncluded:\n* Local guide\n* Drinking water' },
  { name: 'WhatsApp multi-day, bullet, ambiguous time', mode: 'multi_day', language: 'id', title: 'Liburan Bali Dua Hari', summary: 'Liburan dua hari menikmati sawah Ubud dan panorama Kintamani bersama keluarga.', text: 'Liburan Bali Dua Hari\nDestinasi: Bali\nNegara: Indonesia\nLiburan dua hari menikmati sawah Ubud dan panorama Kintamani bersama keluarga.\nHari 1: Ubud\n08:00 Jemput hotel (30 menit)\n09:00 Sawah Tegallalang - 2 jam\nHari 2: Kintamani\n07:00 Berangkat ke Kintamani (2 jam)\n10:00 Menikmati panorama danau\njam 8 makan malam\nTermasuk:\n• Mobil dan sopir\n• Air mineral' },
  { name: 'Destination guide, prose and place bullets', mode: 'destination_guide', language: 'id', title: 'Panduan Yogyakarta', summary: 'Panduan singkat untuk menikmati kawasan budaya dan ruang publik Yogyakarta.', text: 'Panduan Yogyakarta\nDestinasi: Yogyakarta\nNegara: Indonesia\nPanduan singkat untuk menikmati kawasan budaya dan ruang publik Yogyakarta.\n- Candi Prambanan (Sleman)\n- Malioboro (Kota Yogyakarta)\nKontak darurat\nPolisi: 110\nAmbulans: 118\nTermasuk\n- Air mineral' },
  { name: 'Activity, facts, highlights and ordered steps', mode: 'activity', language: 'id', title: 'Rafting Sungai Ayung', summary: 'Arung jeram santai di Sungai Ayung dengan pemandu lokal dan pemandangan tebing hijau.', text: 'Rafting Sungai Ayung\nDestinasi: Ubud\nNegara: Indonesia\nKategori: Air\nDurasi: 3 jam\nJam sesi: 08:00, 13:00\nArung jeram santai di Sungai Ayung dengan pemandu lokal dan pemandangan tebing hijau.\nHighlights\n- Pemandangan tebing hijau\n- Makan siang bersama\nAlur kegiatan\n- Briefing keselamatan (15 menit)\n- Arung jeram (120 menit)\n- Mandi dan makan siang (45 menit)\nTermasuk\n- Helm dan pelampung\n- Makan siang' }
];

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-five-live-'));
const origin = 'http://127.0.0.1:3000';
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: provider });
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const rows: Array<Record<string, unknown>> = [];
try {
  for (const item of cases) {
    const start = performance.now(); const before = calls.length;
    const source = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: item.text } });
    assert.equal(source.statusCode, 201);
    const result = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${source.json().sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: item.mode, outputLanguage: item.language } });
    const body = result.json(); const draft = body.itinerary?.draftContent;
    const checks = {
      created: result.statusCode === 201,
      title: draft?.trip.title === item.title,
      aiSummary: draft?.summary === item.summary,
      actualImportModel: calls.length > before && calls.slice(before).every(call => call.model === IMPORT_MODEL_ID && call.status === 200),
      persisted: false,
      modeFacts: item.mode === 'activity' ? draft?.activity?.durationMinutes === 180 && draft?.activity?.highlights.length === 2 : item.mode === 'destination_guide' ? draft?.places?.some((place: { name: string }) => place.name === 'Candi Prambanan') === true : draft?.days.length === (item.mode === 'multi_day' ? 2 : 1) && draft?.days[0].activities.length === 3 - (item.mode === 'multi_day' ? 1 : 0)
    };
    if (draft) { const saved = await app.inject({ url: `/api/v1/itineraries/${body.itinerary.id}` }); checks.persisted = saved.statusCode === 200 && JSON.stringify(saved.json().draftContent) === JSON.stringify(draft); }
    const row = { name: item.name, mode: item.mode, passed: Object.values(checks).every(Boolean), checks, status: result.statusCode, elapsedMs: Math.round(performance.now() - start), calls: calls.slice(before), usage: body.usage, report: body.report, error: body.error, output: draft };
    rows.push(row);
    console.log(JSON.stringify({ ...row, output: undefined }));
    if (calls.slice(before).some(call => call.status === 401 || call.status === 403)) break;
  }
  const summary = { writingModel: MODEL_ID, importModel: IMPORT_MODEL_ID, tests: rows.length, passed: rows.filter(row => row.passed).length, totalUsd: rows.reduce((sum, row) => sum + Number((row.usage as any)?.actualUsd ?? 0), 0), rows };
  await mkdir('output', { recursive: true });
  await writeFile('output/hybrid-text-five-live.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, rows: undefined, evidence: 'output/hybrid-text-five-live.json' }));
  if (summary.passed !== 5) process.exitCode = 1;
} finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
