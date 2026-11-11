/** Server-only place search. Photon (OpenStreetMap data, no key, no card) is the default; Google Places (New) is optional. A key never leaves the server and is never logged. */
export type PlacesSource = 'osm' | 'google';
export interface PlaceSuggestion { placeId: string; mainText: string; secondaryText: string }
export interface PlacesAutocompleteInput { text: string; sessionToken: string; languageCode: string | null }
export interface PlacesProvider {
  readonly source: PlacesSource;
  readonly configured: boolean;
  autocomplete(input: PlacesAutocompleteInput): Promise<PlaceSuggestion[]>;
}

const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';
const FIELD_MASK = 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';
const MAX_SUGGESTIONS = 5;
const TIMEOUT_MS = 5000;

/** Google does not take the app's internal tags for every locale; map the few that differ and drop the rest. */
export function googleLanguageCode(tag: string | null): string | undefined {
  if (!tag) return undefined;
  if (tag === 'zh-Hans') return 'zh-CN';
  if (tag === 'la') return undefined;
  return tag;
}

function text(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const inner = (value as { text?: unknown }).text;
  return typeof inner === 'string' ? inner : null;
}

export function parseGoogleSuggestions(body: unknown): PlaceSuggestion[] {
  const suggestions = body && typeof body === 'object' ? (body as { suggestions?: unknown }).suggestions : undefined;
  if (!Array.isArray(suggestions)) return [];
  const result: PlaceSuggestion[] = [];
  for (const item of suggestions) {
    const prediction = item && typeof item === 'object' ? (item as { placePrediction?: unknown }).placePrediction : undefined;
    if (!prediction || typeof prediction !== 'object') continue;
    const placeId = (prediction as { placeId?: unknown }).placeId;
    const format = (prediction as { structuredFormat?: unknown }).structuredFormat;
    const mainText = text((format as { mainText?: unknown } | undefined)?.mainText);
    const secondaryText = text((format as { secondaryText?: unknown } | undefined)?.secondaryText) ?? '';
    if (typeof placeId !== 'string' || !placeId || mainText === null) continue;
    result.push({ placeId, mainText, secondaryText });
    if (result.length === MAX_SUGGESTIONS) break;
  }
  return result;
}

export class GooglePlacesProvider implements PlacesProvider {
  readonly source = 'google' as const;
  readonly configured: boolean;
  constructor(private readonly apiKey: string | undefined, private readonly fetchImpl: typeof fetch = fetch) {
    this.configured = Boolean(apiKey && apiKey.trim());
  }
  async autocomplete(input: PlacesAutocompleteInput): Promise<PlaceSuggestion[]> {
    if (!this.apiKey) throw new Error('Places provider is not configured.');
    const languageCode = googleLanguageCode(input.languageCode);
    const response = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({ input: input.text, sessionToken: input.sessionToken, ...(languageCode ? { languageCode } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Places request failed with HTTP ${response.status}.`);
    return parseGoogleSuggestions(await response.json());
  }
}

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
/** Photon only answers these languages (id, ja and the rest give HTTP 400), so the others are not sent. */
export function photonLanguage(tag: string | null): string | undefined {
  return tag === 'en' || tag === 'fr' ? tag : undefined;
}

function photonText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Parses Photon GeoJSON: no places without a name, no repeated OSM objects, no repeated "Kuta, Kuta" parts. */
export function parsePhotonSuggestions(body: unknown): PlaceSuggestion[] {
  const features = body && typeof body === 'object' ? (body as { features?: unknown }).features : undefined;
  if (!Array.isArray(features)) return [];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const result: PlaceSuggestion[] = [];
  for (const feature of features) {
    const properties = feature && typeof feature === 'object' ? (feature as { properties?: unknown }).properties : undefined;
    if (!properties || typeof properties !== 'object') continue;
    const props = properties as Record<string, unknown>;
    const type = photonText(props.osm_type);
    const id = typeof props.osm_id === 'number' || typeof props.osm_id === 'string' ? String(props.osm_id) : null;
    const name = photonText(props.name);
    if (!type || !/^[NWR]$/.test(type) || !id || !/^\d+$/.test(id) || !name) continue;
    const placeId = `${type}${id}`;
    const parts: string[] = [];
    for (const key of ['district', 'city', 'state', 'country']) {
      const part = photonText(props[key]);
      if (part && part !== name && !parts.includes(part)) parts.push(part);
    }
    const secondaryText = parts.join(', ');
    const label = `${name}|${secondaryText}`;
    if (seenIds.has(placeId) || seenLabels.has(label)) continue;
    seenIds.add(placeId); seenLabels.add(label);
    result.push({ placeId, mainText: name, secondaryText });
    if (result.length === MAX_SUGGESTIONS) break;
  }
  return result;
}

export class PhotonPlacesProvider implements PlacesProvider {
  readonly source = 'osm' as const;
  readonly configured = true;
  constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly endpoint: string = PHOTON_ENDPOINT) {}
  async autocomplete(input: PlacesAutocompleteInput): Promise<PlaceSuggestion[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set('q', input.text);
    url.searchParams.set('limit', '8'); // asked for more than shown so duplicates can be dropped
    url.searchParams.append('osm_tag', '!highway'); // no bus stops or roads in a tour itinerary
    const lang = photonLanguage(input.languageCode);
    if (lang) url.searchParams.set('lang', lang);
    const response = await this.fetchImpl(url, { headers: { 'user-agent': 'itinerary-engine' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Photon request failed with HTTP ${response.status}.`);
    return parsePhotonSuggestions(await response.json());
  }
}

/** Turned off on purpose with PLACES_PROVIDER=off: the route answers 503 and the fields stay plain text. */
export const disabledPlacesProvider: PlacesProvider = {
  source: 'osm', configured: false,
  async autocomplete() { throw new Error('Place search is turned off.'); }
};

/** PLACES_PROVIDER: photon (default), google (needs GOOGLE_PLACES_API_KEY), or off. */
export function createPlacesProvider(env: NodeJS.ProcessEnv): PlacesProvider {
  const choice = (env.PLACES_PROVIDER || 'photon').trim().toLowerCase();
  if (choice === 'off') return disabledPlacesProvider;
  if (choice === 'google') return new GooglePlacesProvider(env.GOOGLE_PLACES_API_KEY);
  if (choice === 'photon') return new PhotonPlacesProvider();
  throw new Error('PLACES_PROVIDER must be photon, google or off.');
}

/** Google is metered (free monthly allowance), so it stays at 300; Photon only needs a polite ceiling. */
export function defaultDailyLimit(source: PlacesSource): number {
  return source === 'google' ? 300 : 1000;
}
