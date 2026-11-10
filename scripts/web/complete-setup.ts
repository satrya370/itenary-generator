import type { FastifyInstance } from 'fastify';

export async function completeSetup(app: FastifyInstance, origin: string) {
  const current = (await app.inject({ url: '/api/v1/itinerary-engine/profile' })).json();
  const response = await app.inject({
    method: 'PATCH', url: '/api/v1/itinerary-engine/profile',
    headers: { origin, 'x-engine-request': '1', 'content-type': 'application/json' },
    payload: { expectedRevision: current.revision, profile: { agencyName: 'Verification Guide', agencyContact: 'guide@example.test', agencyLogoAssetId: null, defaultCountry: '', defaultLanguage: null, guides: [], setupCompleted: true } }
  });
  if (response.statusCode !== 200) throw new Error(`Setup could not be completed for verification (${response.statusCode}).`);
}
