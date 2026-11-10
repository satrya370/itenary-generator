import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { validateDraft, validateForPublish } from '../contracts/validator.js';
import type { ContractDiagnostic, WebItineraryContent } from '../contracts/types.js';
import { getLocaleCatalog } from '../contracts/locale-catalogs.js';
import { renderItineraryHtml } from '../render/render.js';
import { defaultStylesheetPath, loadInlineRenderResources } from '../render/resources.js';
import type { ItineraryRecord } from './store.js';

const err = (code: string, field: string, message: string): ContractDiagnostic => ({ code, path: field, message });
type PreviewDiagnostic = ContractDiagnostic & { targetId?: string };
const editorMessages: Record<string, string> = {
  PUBLISH_FIELD_REQUIRED: 'Lengkapi field ini sebelum publish.',
  SCHEMA_VALIDATION_FAILED: 'Perbaiki nilai field agar sesuai format yang diminta.',
  DUPLICATE_STABLE_ID: 'Item memiliki ID yang sama; simpan ulang setelah memperbaiki data.',
  FIELD_NOT_APPLICABLE: 'Field ini tidak berlaku untuk tipe itinerary ini; kosongkan dulu.',
  SINGLE_DAY_REQUIRED: 'Tipe ini hanya memakai satu hari jadwal.',
  MULTI_DAY_COUNT_INVALID: 'Itinerary multi-hari membutuhkan 2 sampai 14 hari.',
  PLACES_REQUIRED: 'Tambahkan minimal satu tempat ke panduan destinasi.',
  EMPTY_DAY: 'Tambahkan minimal satu aktivitas di hari ini.',
  DURATION_CAP_EXCEEDED: 'Total waktu melebihi batas durasi tipe itinerary ini.',
  ACTIVITY_ORDER: 'Urutkan aktivitas dari jam paling awal.',
  TIME_RANGE_INVALID: 'Jam selesai harus setelah jam mulai.',
  SCHEDULE_OVERLAP: 'Aktivitas ini dimulai sebelum aktivitas sebelumnya selesai.',
  SCHEDULE_TIME_UNKNOWN: 'Sebagian jam atau durasi belum diisi; jadwal belum bisa dicek penuh.',
  MEETING_POINT_MISSING: 'Belum ada titik kumpul atau penjemputan.',
  HOTEL_NAME_EMPTY: 'Nama hotel belum diisi.',
  PHOTO_ATTRIBUTION_REQUIRED: 'Lengkapi kredit untuk foto yang digunakan.',
  RENDER_ASSET_MISSING: 'Aset foto tidak tersedia; preview menggunakan tampilan fallback.',
  LOCALE_UNSUPPORTED: 'Katalog bahasa atau script ini belum didukung.',
  LOCALE_LABELS_INCOMPLETE: 'Katalog label bahasa belum lengkap.',
  LOCALE_CATALOG_UNAVAILABLE: 'Label untuk bahasa ini belum tersedia.',
  RENDER_STYLES_INVALID: 'Stylesheet render tidak tersedia atau tidak aman.',
  RENDER_FONTS_EXTERNAL: 'Font render tidak tersedia sebagai resource lokal.'
};
function localize(items: PreviewDiagnostic[]) { return items.map((item) => ({ ...item, message: editorMessages[item.code] || item.message })); }

function dedupe(items: PreviewDiagnostic[]): PreviewDiagnostic[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}|${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withTargetIds(content: WebItineraryContent, diagnostics: ContractDiagnostic[]): PreviewDiagnostic[] {
  return diagnostics.map((item) => {
    const activity = /^days\[(\d+)\]\.activities\[(\d+)\]/.exec(item.path);
    if (activity) {
      const id = content.days[Number(activity[1])]?.activities[Number(activity[2])]?.id;
      return id ? { ...item, targetId: id } : item;
    }
    const day = /^days\[(\d+)\]/.exec(item.path);
    if (day) {
      const id = content.days[Number(day[1])]?.id;
      return id ? { ...item, targetId: id } : item;
    }
    const place = /^places\[(\d+)\]/.exec(item.path);
    if (place) {
      const id = content.places[Number(place[1])]?.id;
      return id ? { ...item, targetId: id } : item;
    }
    return item;
  });
}

function assetReferences(content: WebItineraryContent, profile: Record<string, unknown>) {
  const refs: Array<[string | null | undefined, string]> = [
    [typeof profile.agencyLogoAssetId === 'string' ? profile.agencyLogoAssetId : null, 'profile.agencyLogoAssetId'],
    [content.cover?.assetId, 'cover.assetId'],
    ...content.days.map((day, index) => [day.photo?.assetId, `days[${index}].photo.assetId`] as [string | null | undefined, string]),
    ...content.places.map((place, index) => [place.photo?.assetId, `places[${index}].photo.assetId`] as [string | null | undefined, string])
  ];
  const grouped = new Map<string, string[]>();
  for (const [assetId, field] of refs) if (assetId) grouped.set(assetId, [...(grouped.get(assetId) || []), field]);
  return grouped;
}

function minutesOf(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function overlapDiagnostics(content: WebItineraryContent): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  content.days.forEach((day, dayIndex) => {
    let latestEnd: number | null = null;
    day.activities.forEach((activity, activityIndex) => {
      if (!activity.time || !activity.durationMinutes) return;
      const start = minutesOf(activity.time);
      if (latestEnd !== null && start < latestEnd) {
        errors.push(err('SCHEDULE_OVERLAP', `days[${dayIndex}].activities[${activityIndex}].time`, 'Aktivitas ini dimulai sebelum aktivitas sebelumnya selesai.'));
      }
      latestEnd = Math.max(latestEnd ?? 0, start + activity.durationMinutes);
    });
  });
  return errors;
}

function hotelDiagnostics(content: WebItineraryContent): ContractDiagnostic[] {
  if (content.trip.mode !== 'multi_day') return [];
  return content.days.flatMap((day, index) => day.hotel !== null && !day.hotel.name.trim()
    ? [err('HOTEL_NAME_EMPTY', `days[${index}].hotel.name`, 'Nama hotel belum diisi.')]
    : []);
}

function contentDiagnostics(content: WebItineraryContent): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const moneyClaim = /\b(?:(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|Rp\.?)\s*\d[\d.,]*|\d[\d.,]*\s*(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|rupiah|yen|yuan))|[$€£¥]\s*\d[\d.,]*/i;
  const openingClaim = /(?:\b(?:opening hours?|hours of operation|jam buka|buka pukul|closes? at|horaires? d['’]ouverture|heures? d['’]ouverture|ouverture à|horario de apertura|horae? aperti(?:onis)?)\b|営業時間|開店時間|营业时间|开放时间)/i;
  const promotionalClaim = /(?:\b(?:book now|reserve now|limited spots?|only \d+ left|rated? \d(?:\.\d)?\s*(?:\/\s*5|stars?)|pesan sekarang|booking sekarang|kuota terbatas|tinggal \d+|réservez maintenant|réservez|places limitées|noté \d.*\/\s*5|reservare nunc|loca limitata)\b|今すぐ予約|予約する|残り\d+席|立即预订|马上预订|仅剩\d+|评分.{0,8}\d.*(?:星|分))/i;
  const fields: Array<[string, unknown]> = [
    ['trip.title', content.trip.title], ['trip.destination', content.trip.destination], ['trip.region', content.trip.region], ['summary', content.summary],
    ['meeting.place', content.meeting.place], ['meeting.note', content.meeting.note], ['pickup.area', content.pickup.area], ['pickup.dropoffNote', content.pickup.dropoffNote], ['guide.name', content.guide.name],
    ...content.days.flatMap((day, di) => [
      [`days[${di}].title`, day.title], [`days[${di}].location`, day.location], [`days[${di}].transferNote`, day.transferNote],
      ...(day.hotel ? [[`days[${di}].hotel`, [day.hotel.name, day.hotel.area, day.hotel.note]] as [string, unknown]] : []),
      ...day.activities.flatMap((item, ai) => [[`days[${di}].activities[${ai}].title`, item.title], [`days[${di}].activities[${ai}].description`, item.description], [`days[${di}].activities[${ai}].tip`, item.tip], [`days[${di}].activities[${ai}].place`, item.place]] as Array<[string, unknown]>)
    ] as Array<[string, unknown]>),
    ...content.places.flatMap((item, i) => [[`places[${i}].name`, item.name], [`places[${i}].description`, item.description], [`places[${i}].logistics`, [item.area, item.group, item.gettingThere, ...item.tips, item.nearby, item.suggestedDuration, item.bestTime]]] as Array<[string, unknown]>),
    ...content.included.map((value, i) => [`included[${i}]`, value] as [string, unknown]),
    ...content.notIncluded.map((value, i) => [`notIncluded[${i}]`, value] as [string, unknown]),
    ...content.whatToBring.map((value, i) => [`whatToBring[${i}]`, value] as [string, unknown]),
    ...content.notSuitableFor.map((value, i) => [`notSuitableFor[${i}]`, value] as [string, unknown]),
    ...content.notAllowed.map((value, i) => [`notAllowed[${i}]`, value] as [string, unknown]),
    ...content.localTips.map((value, i) => [`localTips[${i}]`, value] as [string, unknown]),
    ...content.emergencyContacts.map((item, i) => [`emergencyContacts[${i}]`, [item.label, item.value]] as [string, unknown]),
    ['policies', content.policies], ['closingNote', content.closingNote], ['disclaimer', content.disclaimer]
  ];
  for (const [field, value] of fields) {
    const text = (Array.isArray(value) ? value.filter((part) => typeof part === 'string').join(' ') : typeof value === 'string' ? value : '').trim();
    if (moneyClaim.test(text)) errors.push(err('PUBLISH_CURRENCY_CLAIM', field, 'Brochure tidak boleh mencantumkan nominal harga.'));
    if (openingClaim.test(text)) errors.push(err('PUBLISH_OPENING_HOURS_CLAIM', field, 'Jangan menyatakan jam operasional venue yang belum diverifikasi.'));
    if (promotionalClaim.test(text)) errors.push(err('PUBLISH_PROMOTIONAL_CLAIM', field, 'Hapus klaim booking, rating, atau scarcity dari brochure.'));
    if (/\{\{\s*[^}]+\}\}|\[(?:TODO|TBD|PLACEHOLDER)\]/i.test(text)) errors.push(err('PUBLISH_UNRESOLVED_PLACEHOLDER', field, 'Lengkapi placeholder sebelum publish.'));
  }
  return errors;
}

export interface PreviewStore {
  getAsset(id: string): any | undefined;
  workspace(): { profile: unknown };
}

export async function renderSavedDraftPreview(record: ItineraryRecord, store: PreviewStore, dataDir: string, stylesheetPath = defaultStylesheetPath()) {
  const draft = validateDraft(record.draftContent);
  if (!draft.ok) return { ok: false as const, status: 422, errors: localize(draft.errors), warnings: localize(draft.warnings) };
  const content = draft.value;
  const language = content.trip.language;
  const languageContext = record.languageContext as { outputLanguage?: unknown; source?: unknown } | null;
  if (!languageContext || typeof languageContext !== 'object' || languageContext.outputLanguage !== language || languageContext.source === 'unresolved' || !language) {
    return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNRESOLVED', 'trip.language', 'Pilih atau deteksi bahasa dan simpan sebelum preview.')]), warnings: localize(draft.warnings) };
  }
  if (!getLocaleCatalog(language)) return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNSUPPORTED', 'trip.language', 'Katalog bahasa atau script ini belum tersedia.')]), warnings: localize(draft.warnings) };

  const profile = (store.workspace().profile && typeof store.workspace().profile === 'object' ? store.workspace().profile : {}) as Record<string, unknown>;
  const readiness = validateForPublish(content);
  const errors: ContractDiagnostic[] = [...readiness.errors, ...overlapDiagnostics(content), ...contentDiagnostics(content)];
  const warnings: ContractDiagnostic[] = [...readiness.warnings, ...hotelDiagnostics(content)];
  const finish = (items: ContractDiagnostic[]) => localize(dedupe(withTargetIds(content, items)));

  const assets: Record<string, { dataUri: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }> = {};
  let totalBytes = 0;
  for (const [id, paths] of assetReferences(content, profile)) {
    const row = store.getAsset(id);
    if (!row || path.basename(row.storage_key) !== row.storage_key || !/^[0-9a-f-]+\.(?:jpeg|png|webp)$/i.test(row.storage_key)) {
      errors.push(...paths.map((field) => err('ASSET_INVALID', field, 'Aset itinerary tidak ditemukan atau metadata storage tidak aman.')));
      continue;
    }
    try {
      const bytes = await readFile(path.join(dataDir, 'assets', row.storage_key));
      await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' }).stats();
      const metadata = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' }).metadata();
      const expectedMime = metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format ? `image/${metadata.format}` : '';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(expectedMime) || expectedMime !== row.mime || bytes.length !== row.bytes || bytes.length > 5 * 1024 * 1024) {
        errors.push(...paths.map((field) => err('ASSET_INVALID', field, 'Isi aset tidak cocok dengan metadata tersimpan atau melampaui batas ukuran.')));
        continue;
      }
      totalBytes += bytes.length;
      if (totalBytes > 20 * 1024 * 1024) {
        errors.push(err('ASSET_BUNDLE_TOO_LARGE', 'assets', 'Aset terpakai melebihi batas total 20 MiB.'));
        break;
      }
      assets[id] = { dataUri: `data:${expectedMime};base64,${bytes.toString('base64')}`, mimeType: expectedMime as 'image/png' | 'image/jpeg' | 'image/webp' };
    } catch {
      errors.push(...paths.map((field) => err('ASSET_INVALID', field, 'Piksel aset itinerary tidak dapat didecode dengan aman.')));
    }
  }
  if (errors.some((item) => ['ASSET_INVALID', 'ASSET_BUNDLE_TOO_LARGE', 'LOCALE_UNRESOLVED'].includes(item.code))) return { ok: false as const, status: 422, errors: finish(errors), warnings: finish(warnings) };

  let resources: Awaited<ReturnType<typeof loadInlineRenderResources>>;
  try {
    resources = await loadInlineRenderResources(language, content.trip.colorTheme, stylesheetPath);
  } catch {
    return { ok: false as const, status: 503, errors: finish([...errors, err('RENDER_RESOURCES_UNAVAILABLE', 'render', 'Resource renderer (CSS, font, atau catalog) belum tersedia.')]), warnings: finish(warnings) };
  }
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  const agency = { name: text(profile.agencyName), contact: text(profile.agencyContact), logoAssetId: typeof profile.agencyLogoAssetId === 'string' && profile.agencyLogoAssetId ? profile.agencyLogoAssetId : null };
  const { fontBytes: _fontBytes, ...renderResources } = resources;
  const rendered = renderItineraryHtml(content, { ...renderResources, assets, agency, generatedDate: new Date().toISOString().slice(0, 10) });
  if (rendered.errors.length) return { ok: false as const, status: 422, errors: finish([...errors, ...rendered.errors]), warnings: finish([...warnings, ...rendered.warnings]) };
  const allWarnings = finish([...warnings, ...rendered.warnings]);
  return {
    ok: true as const, html: rendered.html, errors: finish(errors), warnings: allWarnings, publishReady: errors.length === 0,
    scheduleVerification: content.trip.mode === 'destination_guide' ? 'not_applicable' as const : allWarnings.some((item) => item.code === 'SCHEDULE_TIME_UNKNOWN') ? 'partial' as const : 'complete' as const
  };
}
