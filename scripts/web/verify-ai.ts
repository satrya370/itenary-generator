import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBlankDraft } from '../../src/server/draft.js';
import { createApp } from '../../src/server/app.js';
import type { RecordDto } from '../../src/api/client.js';
import type { ItineraryMode, LanguageContext, WebItineraryContent } from '../../src/contracts/types.js';
import { aiRateWindowWaitMs } from './ai-live-rate.js';

const locales = [
  { locale: 'la', brief: 'Itinerarium quietum per hortos antiquos et vias historicas, ubi dux regionis culturam localem et consuetudines prudenter explicat.' },
  { locale: 'fr', brief: 'Une promenade tranquille dans les jardins et les ruelles historiques, avec un guide local qui explique la culture de la région.' },
  { locale: 'en', brief: 'A relaxed visit through quiet gardens and historic lanes with a local guide sharing the culture, traditions and practical context of the region.' },
  { locale: 'id', brief: 'Perjalanan santai melewati taman yang tenang dan kawasan bersejarah bersama pemandu lokal yang berbagi cerita budaya serta konteks praktis.' },
  { locale: 'ja', brief: '静かな庭園や歴史ある路地をゆっくり散策し、地元ガイドから地域の文化や伝統、実用的な情報について学びます。' },
  { locale: 'zh-Hans', brief: '悠闲漫步于安静的庭园和历史街巷，由当地向导分享当地文化、传统以及实用的旅行信息。' }
];
const descriptionKinds = ['activity', 'spot', 'activity', 'spot', 'activity', 'spot'] as const;
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
function stableUuid(name: string) {
  const chars = createHash('sha256').update(`cp023-live:${name}`).digest('hex').slice(0, 32).split('');
  chars[12] = '4'; chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function outputLanguage(locale: string): LanguageContext { return { requestedLanguage: locale, outputLanguage: locale, source: 'explicit' }; }
function draftFor(locale: string, brief: string, target: 'activity' | 'spot'): WebItineraryContent {
  const mode: ItineraryMode = target === 'spot' ? 'destination_guide' : 'full_day';
  const draft = createBlankDraft(mode, {}) as WebItineraryContent;
  draft.brochure.tripTitle = `CP023 live ${locale} ${target}`; draft.brochure.destination = 'Kyoto'; draft.brochure.country = 'Japan'; draft.brochure.outputLanguage = locale;
  draft.overview.quickFacts.bestSeason = '';
  if (target === 'activity') {
    draft.schedule[0].location = 'Kyoto'; draft.schedule[0].activities[0].title = 'Garden visit'; draft.schedule[0].activities[0].type = 'sightseeing';
  } else {
    (draft as any).spots.push({ id: randomUUID(), groupLabel: 'Kyoto', name: 'Garden visit', area: 'East Kyoto', category: 'garden', description: '', suggestedDuration: '90 minutes', bestTimeToVisit: 'Morning', gettingThere: 'Local bus', tips: ['Comfortable shoes'], nearbyPairing: null, assetId: null, photoAttribution: null });
  }
  return draft;
}

async function main() {
  if (!process.argv.includes('--live')) throw new Error('Live provider calls require --live; no request was sent.');
  const budgetArg = process.argv.find(arg => arg.startsWith('--budget-usd='));
  if (Number(budgetArg?.split('=')[1]) !== 2) throw new Error('Use the approved fixed ceiling --budget-usd=2.');
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_CREDENTIAL_FILE) process.env.OPENROUTER_CREDENTIAL_FILE = path.resolve('..', 'Credential_information.md');
  process.env.OPENROUTER_LIVE_TEST = '1';
  const dataDir = path.resolve(process.env.OPENROUTER_LIVE_DATA_DIR || '.runtime/ai-live-test');
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], liveAiTest: true });
  const results: Array<Record<string, unknown>> = [];
  let activeCase: string | null = null;
  let writeSummary: ((runStatus: 'running' | 'completed' | 'interrupted', diagnostic?: string) => Promise<{ successes: number }>) | null = null;
  try {
    const preflight = await app.inject({ url: '/api/v1/itinerary-engine/ai/preflight' });
    if (preflight.statusCode !== 200) throw new Error(`Live preflight blocked: ${preflight.json().error?.code || preflight.statusCode}. No generation request was sent.`);
    const model = preflight.json();
    if (model.modelId !== 'openai/gpt-6-luna' || !model.authenticated || model.modelState !== 'listed' || !model.pricing || !model.supportedParameters.includes('max_tokens')) throw new Error('Exact model/auth/pricing/parameter preflight failed. No generation request was sent.');
    if (model.liveTestBudget.limitUsd !== 2) throw new Error('The persistent live-test budget ledger is not initialized at the approved $2 ceiling.');
    if (process.argv.includes('--preflight-only')) {
      console.log(JSON.stringify({ preflight: 'ready', modelId: model.modelId, authenticated: model.authenticated, modelState: model.modelState, pricing: model.pricing, liveTestBudget: model.liveTestBudget }));
      return;
    }

    const uniqueCases = locales.flatMap((item, index) => [
      { ...item, task: 'overview' as const, targetKind: null },
      { ...item, task: 'description' as const, targetKind: descriptionKinds[index] }
    ]);
    const store = (app as any).store;
    const existingIds = new Set((store.db.prepare('SELECT operation_id FROM ai_operations').all() as Array<{ operation_id: string }>).map(row => row.operation_id));
    const newCases = uniqueCases.filter(item => !existingIds.has(stableUuid(`${item.locale}:${item.task}`)));
    const worstPerCall = Math.ceil((65_536 * model.pricing.prompt + 1_536 * model.pricing.completion) * 2 * 1.1 * 1_000_000) / 1_000_000;
    const worstRun = worstPerCall * newCases.length;
    const evidencePath = path.resolve(process.env.OPENROUTER_LIVE_EVIDENCE_FILE || 'output/web-ai/verification-summary.json');
    writeSummary = async (runStatus, diagnostic) => {
      const successes = results.filter(result => result.status === 'success').length;
      const replayed = results.filter(result => result.status === 'success' && result.replayed === true).length;
      const summary = { runStatus, modelId: model.modelId, authenticated: model.authenticated, modelState: model.modelState, pricing: model.pricing, ceilingUsd: model.liveTestBudget.limitUsd, committedUsd: (store.db.prepare('SELECT committed_usd FROM ai_live_budget WHERE id=1').get() as { committed_usd: number }).committed_usd, resultCount: results.length, successes, freshSuccesses: successes - replayed, replayedSuccesses: replayed, failures: results.length - successes, ...(activeCase ? { activeCase } : {}), ...(diagnostic ? { diagnostic } : {}), results };
      await mkdir(path.dirname(evidencePath), { recursive: true }); await writeFile(evidencePath, JSON.stringify(summary, null, 2));
      return summary;
    };
    if (worstRun > model.liveTestBudget.remainingUsd) {
      await writeSummary('interrupted', 'BUDGET_INSUFFICIENT_NO_REQUEST_SENT');
      console.error(JSON.stringify({ runStatus: 'interrupted', diagnostic: 'BUDGET_INSUFFICIENT_NO_REQUEST_SENT', requiredUsd: Number(worstRun.toFixed(6)), remainingUsd: model.liveTestBudget.remainingUsd }));
      process.exitCode = 1; return;
    }

    for (const item of uniqueCases) {
      activeCase = `${item.locale}:${item.task}`;
      const operationId = stableUuid(`${item.locale}:${item.task}`);
      const priorOperation = store.db.prepare('SELECT itinerary_id,operation_kind,target_kind,target_id FROM ai_operations WHERE operation_id=?').get(operationId) as { itinerary_id: string; operation_kind: string; target_kind: string | null; target_id: string | null } | undefined;
      let record: RecordDto | null = priorOperation ? store.getItinerary(priorOperation.itinerary_id) : null;
      if (!record) {
        const targetName = item.task === 'description' && item.targetKind === 'spot' ? 'spot' : 'activity';
        const mode = targetName === 'spot' ? 'destination_guide' : 'full_day';
        const title = `CP023 live ${item.locale} ${targetName}`;
        const listed = await app.inject({ url: '/api/v1/itineraries?limit=100' });
        const existing = (listed.json().items as Array<{ id: string; title: string }>).find(row => row.title === title);
        if (existing) {
          const loaded = await app.inject({ url: `/api/v1/itineraries/${existing.id}` });
          if (loaded.statusCode !== 200) throw new Error(`Could not reopen the CP023 fixture for ${item.locale}.`);
          record = loaded.json() as RecordDto;
        } else {
          const body = { mode, draftContent: draftFor(item.locale, item.brief, targetName), languageContext: outputLanguage(item.locale), writingContext: { brief: item.brief, notes: [{ targetId: 'itinerary', text: 'The guide confirms a quiet entrance and a comfortable pace.' }] } };
          const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: body });
          if (created.statusCode !== 201) throw new Error(`Could not create the CP023 ${item.locale} fixture (${created.json().error?.code || created.statusCode}).`);
          record = created.json() as RecordDto;
        }
      }
      if (!record) throw new Error(`No persistent CP023 fixture exists for ${item.locale}.`);
      if (item.task === 'description') {
        const expectedKind = item.targetKind!;
        const modeMatches = expectedKind === 'spot' ? record.draftContent.brochure.itineraryMode === 'destination_guide' : record.draftContent.brochure.itineraryMode !== 'destination_guide';
        const targetId = expectedKind === 'spot' ? record.draftContent.spots[0]?.id : record.draftContent.schedule[0]?.activities[0]?.id;
        if (!modeMatches || typeof targetId !== 'string') throw new Error(`CP023 fixture has no matching ${expectedKind} target for ${activeCase}.`);
        if (priorOperation && (priorOperation.operation_kind !== 'description' || priorOperation.target_kind !== expectedKind || priorOperation.target_id !== targetId)) throw new Error(`Persisted operation target does not match fixture for ${activeCase}.`);
      } else if (priorOperation && (priorOperation.operation_kind !== 'overview' || priorOperation.target_kind !== null)) throw new Error(`Persisted overview operation metadata is invalid for ${activeCase}.`);
      if (!existingIds.has(operationId)) {
        while (true) {
          const now = Date.now(); const windowStart = new Date(now - 60_000).toISOString();
          const recent = store.db.prepare('SELECT created_at FROM ai_operations WHERE workspace_id=? AND created_at>=? ORDER BY created_at ASC').all(store.workspaceId, windowStart) as Array<{ created_at: string }>;
          const waitMs = aiRateWindowWaitMs(recent.map(row => row.created_at), now);
          if (waitMs <= 0) break;
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      const before = record.draftContent;
      const request = item.task === 'overview'
        ? { operationId, expectedRevision: record.revision }
        : { operationId, expectedRevision: record.revision, target: { kind: item.targetKind, id: item.targetKind === 'spot' ? record.draftContent.spots[0].id : record.draftContent.schedule[0].activities[0].id } };
      const pathName = item.task === 'overview' ? 'overview' : 'description';
      const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/${pathName}`, headers, payload: request });
      if (response.statusCode !== 200) {
        results.push({ locale: item.locale, task: item.task, targetKind: item.targetKind, operationId, status: response.statusCode, errorCode: response.json().error?.code || 'UNKNOWN' });
        await writeSummary!('running');
        continue;
      }
      const suggestion = response.json();
      const reloaded = await app.inject({ url: `/api/v1/itineraries/${record.id}` });
      assert.deepEqual(reloaded.json().draftContent, before, `${item.locale} ${item.task} changed the saved canonical draft before Apply`);
      results.push({ locale: item.locale, task: item.task, targetKind: item.targetKind, operationId, status: 'success', replayed: suggestion.replayed === true, revision: suggestion.revision, textCharacters: [...suggestion.text].length, promptTokens: suggestion.usage.promptTokens, completionTokens: suggestion.usage.completionTokens, costUsd: suggestion.usage.costUsd });
      await writeSummary!('running');
    }
    activeCase = null;
    const summary = await writeSummary!('completed');
    console.log(JSON.stringify(summary));
    if (summary.successes !== 12) process.exitCode = 1;
  } catch (cause) {
    const diagnostic = cause instanceof TypeError ? 'HARNESS_SHAPE_OR_TARGET_ERROR' : 'HARNESS_EXECUTION_ERROR';
    if (writeSummary) await writeSummary('interrupted', diagnostic);
    console.error(JSON.stringify({ runStatus: 'interrupted', diagnostic, activeCase, completedCases: results.length }));
    process.exitCode = 1;
  } finally { await app.close(); }
}

await main();
