import { createApp } from '../../src/server/app.js';
import type { AiProvider } from '../../src/server/ai/provider.js';

if (process.env.CP027_E2E !== '1') throw new Error('This test server only runs from the CP027 E2E harness.');
const provider: AiProvider = {
  credentialState: 'configured',
  async preflight() {
    return { credentialState: 'configured', authenticated: true, modelState: 'listed', modelId: 'openai/gpt-6-luna', pricing: { prompt: 0, completion: 0, webSearch: 0 }, contextLength: 100_000, maxCompletionTokens: 2_000, supportedParameters: ['max_tokens'] };
  },
  async generate(request) {
    const text = request.task === 'overview'
      ? 'Un parcours culturel paisible, adapté au rythme choisi par le guide.'
      : 'Cette visite guidée présente le lieu avec des détails fournis par le guide.';
    return { text: JSON.stringify({ text }), usage: { promptTokens: 12, completionTokens: 18, costUsd: 0 } };
  }
};

const origin = process.env.PUBLIC_ORIGIN!;
if (!origin || !process.env.ENGINE_DATA_DIR || !process.env.ENGINE_RENDER_CSS) throw new Error('CP027 test runtime configuration is incomplete.');
const app = await createApp({
  dataDir: process.env.ENGINE_DATA_DIR,
  publicOrigin: origin,
  shareOrigin: origin,
  allowedOrigins: [origin],
  renderStylesheetPath: process.env.ENGINE_RENDER_CSS,
  aiProvider: provider,
  ...(process.env.CP027_CRASH_AFTER_PROMOTE === '1' ? { afterPublicationPromote: async () => { process.kill(process.pid, 'SIGKILL'); await new Promise(resolve => setTimeout(resolve, 10_000)); } } : {}),
  aiLimits: { dailyOperations: 10, operationsPerMinute: 30, maxInFlight: 1, contextBytes: 16 * 1024, timeoutMs: 45_000 }
});
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT) });
process.stdout.write('CP027_E2E_SERVER_READY\n');
const shutdown = async () => { await app.close(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
