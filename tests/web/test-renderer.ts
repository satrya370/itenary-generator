import { validateDraft, validateForPublish } from '../../src/contracts/validator.js';
import type { ItineraryRecord } from '../../src/server/store.js';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/**
 * Renderer double for state-machine tests (publication, API). It applies the real v2 draft and
 * publish validation, then emits minimal HTML, so publish gating behaves like production
 * without depending on the layout renderer that is rewritten in a later revision stage.
 */
export async function stubRenderPreview(record: ItineraryRecord) {
  const draft = validateDraft(record.draftContent);
  if (!draft.ok) return { ok: false as const, status: 422, errors: draft.errors, warnings: draft.warnings };
  const content = draft.value;
  const readiness = validateForPublish(content);
  const html = `<!doctype html><html lang="${escape(content.trip.language)}"><head><meta charset="utf-8"><title>${escape(content.trip.title)}</title></head><body><h1>${escape(content.trip.title)}</h1><p>${escape(content.summary)}</p></body></html>`;
  return { ok: true as const, html, errors: readiness.errors, warnings: readiness.warnings, publishReady: readiness.ok, scheduleVerification: 'verified' };
}
