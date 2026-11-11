/** Server-only Google Places (New) Autocomplete client. The key never leaves the server and is never logged. */
export interface PlaceSuggestion { placeId: string; mainText: string; secondaryText: string }
export interface PlacesAutocompleteInput { text: string; sessionToken: string; languageCode: string | null }
export interface PlacesProvider {
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
