import type { LanguageContext, WebItineraryContent } from '../contracts/types.js';

export interface RecordDto {
  id: string; revision: number; schemaVersion: string; draftContent: WebItineraryContent;
  languageContext: LanguageContext;
  writingContext: { brief: string; notes: Array<{ targetId: string; text: string }> };
  createdAt: string; updatedAt: string; warnings?: Array<{ code: string; path: string; message: string }>;
}
export interface ItineraryListDto { items: Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>; nextCursor: string | null; }
export interface AssetDto { id: string; mime: string; bytes: number; width: number; height: number; filename: string; createdAt: string; }
export interface AiSuggestionDto { operationId: string; itineraryId: string; revision: number; target: { kind: 'overview' } | { kind: 'activity' | 'place'; id: string }; locale: string; text: string; usage?: { promptTokens: number | null; completionTokens: number | null; costUsd: number }; replayed?: boolean; }
export interface AiPendingDto { operationId: string; status: 'running'; retryAfterMs: number; }
export type AiGenerationResponseDto = AiSuggestionDto | AiPendingDto;
export interface LanguageResolutionDto { itineraryId: string; revision: number; status: 'resolved' | 'unresolved'; locale: string | null; source: 'detected' | 'explicit' | 'unresolved'; reason: string; code?: string; requestId?: string; }
export interface AiPreflightDto { credentialState: string; authenticated: boolean; modelState: string; modelId: string; pricing: { prompt: number; completion: number; webSearch: number } | null; contextLength: number | null; maxCompletionTokens: number | null; supportedParameters: string[]; daily: { dailyLimit: number; usedToday: number; remainingToday: number; activeOperations: number }; liveTestBudget?: { limitUsd: number; committedUsd: number; remainingUsd: number }; }
export interface PreviewDto { itineraryId: string; revision: number; html: string; publishReady: boolean; errors: Array<{ code: string; path: string; message: string; targetId?: string }>; warnings: Array<{ code: string; path: string; message: string; targetId?: string }>; scheduleVerification: 'complete' | 'partial' | 'not_applicable'; }
export interface PublicationDto { itineraryId: string; active: boolean; epoch: number; currentVersion: { id: string; sourceRevision: number; createdAt: string } | null; shareUrl: string | null; draftRevision: number; draftDiffers: boolean; }
export interface PlacesAutocompleteDto { suggestions: Array<{ placeId: string; mainText: string; secondaryText: string }>; source: 'osm' | 'google'; remainingToday: number; }
export interface ImportSourceDto { sourceId: string; kind: 'text' | 'pdf'; pageCount: number; charCount: number; languageProposal: { status: string; locale: string | null; source: string; reason: string }; excerpt: string; }
export interface ImportSourceDetailDto extends ImportSourceDto { text: string; }
export interface ImportParseDto { sourceId: string; mode: string; fields: { trip: { title?: string; destination?: string; country?: string; startDate?: string }; guide: { name?: string; phone?: string }; meeting: { place?: string; mapsUrl?: string; time?: string }; lists: Record<string, string[]>; emergencyContacts: Array<{ label: string; value: string }>; days: Array<{ dayNumber: number; title: string | null; activities: Array<{ title: string; time: string | null }> }> }; unconsumed: Array<{ index: number; text: string; section: string | null }>; notes: string[]; totalLines: number; consumedLines: number; }
export interface ImportReportDto { filled: string[]; missingRequired: string[]; skipped: Array<{ path: string; label?: string; message: string }>; notes: string[]; sourceCount: { days: number; activities: number; unconsumed: number }; }
export interface ImportUsageDto { aiUsed: number; promptTokens: number | null; completionTokens: number | null; actualUsd: number | null; }
export interface ImportApplyDto { itinerary: RecordDto; report: ImportReportDto; usage: ImportUsageDto; operationId: string; sourceId: string; replayed?: boolean; }
export interface ImportOperationDto { operationId: string; sourceId: string; status: string; target: 'new' | 'overwrite'; report: ImportReportDto | null; usage: ImportUsageDto; undoAvailable: boolean; }
export interface PublishedVersionDto { id: string; sourceRevision: number; createdAt: string; }

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(init.method && init.method !== 'GET' ? { 'x-engine-request': '1' } : {}), ...init.headers }
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || 'Request failed'), { status: response.status, body: body?.error });
  return body as T;
}

export const api = {
  context: () => request<any>('/api/v1/itinerary-engine/context'),
  profile: () => request<any>('/api/v1/itinerary-engine/profile'),
  saveProfile: (expectedRevision: number, profile: unknown) => request<any>('/api/v1/itinerary-engine/profile', { method: 'PATCH', body: JSON.stringify({ expectedRevision, profile }) }),
  list: (cursor?: string) => request<ItineraryListDto>(`/api/v1/itineraries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  create: (mode: string) => request<RecordDto>('/api/v1/itineraries', { method: 'POST', body: JSON.stringify({ mode }) }),
  get: (id: string) => request<RecordDto>(`/api/v1/itineraries/${encodeURIComponent(id)}`),
  assets: () => request<{ items: AssetDto[]; nextCursor: string | null }>('/api/v1/assets'),
  createImportSource: (input: string | File) => {
    if (typeof input === 'string') return request<ImportSourceDto>('/api/v1/imports/sources', { method: 'POST', body: JSON.stringify({ text: input }) });
    const data = new FormData(); data.append('file', input); return request<ImportSourceDto>('/api/v1/imports/sources', { method: 'POST', body: data });
  },
  getImportSource: (id: string) => request<ImportSourceDetailDto>(`/api/v1/imports/sources/${encodeURIComponent(id)}`),
  parseImport: (id: string, mode: string) => request<ImportParseDto>(`/api/v1/imports/sources/${encodeURIComponent(id)}/parse`, { method: 'POST', body: JSON.stringify({ mode }) }),
  applyImport: (sourceId: string, body: Record<string, unknown>) => request<ImportApplyDto>(`/api/v1/imports/sources/${encodeURIComponent(sourceId)}/apply`, { method: 'POST', body: JSON.stringify(body) }),
  undoImport: (operationId: string, expectedRevision: number) => request<{ itinerary: RecordDto; undone: boolean }>(`/api/v1/imports/operations/${encodeURIComponent(operationId)}/undo`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  latestImport: (itineraryId: string) => request<{ operation: ImportOperationDto | null }>(`/api/v1/imports/operations?itineraryId=${encodeURIComponent(itineraryId)}`),
  upload: (file: File) => { const data = new FormData(); data.append('image', file); return request<AssetDto>('/api/v1/assets', { method: 'POST', body: data }); },
  save: (record: RecordDto, content: WebItineraryContent, languageContext: LanguageContext, writingContext: RecordDto['writingContext']) => request<RecordDto>(`/api/v1/itineraries/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: record.revision, draftContent: content, languageContext, writingContext }) }),
  preview: (id: string, expectedRevision: number) => request<PreviewDto>(`/api/v1/itineraries/${encodeURIComponent(id)}/preview`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  publication: (id: string) => request<PublicationDto>(`/api/v1/itineraries/${encodeURIComponent(id)}/publication`),
  publish: (id: string, operationId: string, expectedRevision: number) => request<{ status: 'published' | 'pending'; operationId: string; itineraryId?: string; versionId?: string; sourceRevision?: number; createdAt?: string; shareUrl?: string | null; replayed?: boolean }>(`/api/v1/itineraries/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ operationId, expectedRevision }) }),
  unpublish: (id: string, expectedPublicationEpoch: number) => request<{ itineraryId: string; active: false; epoch: number }>(`/api/v1/itineraries/${encodeURIComponent(id)}/unpublish`, { method: 'POST', body: JSON.stringify({ expectedPublicationEpoch }) }),
  versions: (id: string) => request<{ items: PublishedVersionDto[]; nextCursor: string | null }>(`/api/v1/itineraries/${encodeURIComponent(id)}/versions`),
  placesAutocomplete: (text: string, sessionToken: string, languageCode: string | null) => request<PlacesAutocompleteDto>('/api/v1/places/autocomplete', { method: 'POST', body: JSON.stringify({ text, sessionToken, languageCode }) }),
  resolveLanguage: (id: string, expectedRevision: number) => request<LanguageResolutionDto>(`/api/v1/itineraries/${encodeURIComponent(id)}/language/resolve`, { method: 'POST', body: JSON.stringify({ expectedRevision }) }),
  aiPreflight: () => request<AiPreflightDto>('/api/v1/itinerary-engine/ai/preflight'),
  generateOverview: (id: string, operationId: string, expectedRevision: number) => request<AiGenerationResponseDto>(`/api/v1/itineraries/${encodeURIComponent(id)}/ai/overview`, { method: 'POST', body: JSON.stringify({ operationId, expectedRevision }) }),
  generateDescription: (id: string, operationId: string, expectedRevision: number, target: { kind: 'activity' | 'place'; id: string }) => request<AiGenerationResponseDto>(`/api/v1/itineraries/${encodeURIComponent(id)}/ai/description`, { method: 'POST', body: JSON.stringify({ operationId, expectedRevision, target }) })
};
