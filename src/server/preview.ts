import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { validateDraft, validateForPublish } from '../contracts/validator.js';
import type { ContractDiagnostic, ItineraryV2 } from '../contracts/types.js';
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
  MODE_SHAPE_INVALID: 'Struktur hari dan kegiatan tidak cocok dengan mode itinerary.',
  EMPTY_ACTIVITY_BLOCK: 'Tambahkan setidaknya satu kegiatan pada setiap hari jadwal.',
  PHOTO_ATTRIBUTION_REQUIRED: 'Lengkapi atribusi untuk foto yang digunakan.',
  HERO_FALLBACK_INVALID: 'Pilih foto hero atau gunakan gradien.',
  RENDER_ASSET_MISSING: 'Aset foto tidak tersedia; preview menggunakan tampilan fallback.',
  LOCALE_UNSUPPORTED: 'Katalog bahasa atau script ini belum didukung.',
  LOCALE_LABELS_INCOMPLETE: 'Katalog label bahasa belum lengkap.',
  RENDER_STYLES_INVALID: 'Stylesheet render tidak tersedia atau tidak aman.',
  RENDER_FONTS_EXTERNAL: 'Font render tidak tersedia sebagai resource lokal.',
  SCHEDULE_OVERLAP: 'Jadwal kegiatan tumpang tindih dengan kegiatan lain.',
  HOTEL_NAME_EMPTY: 'Nama hotel tidak boleh kosong untuk multi-day.',
};
function localize(items: PreviewDiagnostic[]) { return items.map((item) => ({ ...item, message: editorMessages[item.code] || item.message })); }

function expandRequiredDiagnostic(content: ItineraryV2, diagnostic: ContractDiagnostic): PreviewDiagnostic[] {
  const segments = diagnostic.path.split('.');
  const visit = (value: any, index: number, fieldPath: string, targetId?: string): PreviewDiagnostic[] => {
    if (index >= segments.length) {
      const missing = value === null || value === undefined || (typeof value === 'string' && !value.trim());
      return missing ? [{ ...diagnostic, path: fieldPath, ...(targetId ? { targetId } : {}) }] : [];
    }
    const raw = segments[index];
    const isArray = raw.endsWith('[]');
    const key = isArray ? raw.slice(0, -2) : raw;
    const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
    if (!isArray) return visit(value?.[key], index + 1, nextPath, targetId);
    const items = value?.[key];
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: any, itemIndex: number) => visit(item, index + 1, `${nextPath}[${itemIndex}]`, typeof item?.id === 'string' ? item.id : targetId));
  };
  return visit(content, 0, '');
}

function assetReferences(content: ItineraryV2) {
  const refs: Array<[string | null | undefined, string]> = [];
  if (content.cover?.assetId) refs.push([content.cover.assetId, 'cover.assetId']);
  if (content.days) {
    for (const [dayIdx, day] of content.days.entries()) {
      if (day.photo?.assetId) refs.push([day.photo.assetId, `days[${dayIdx}].photo.assetId`]);
      if (day.activities) {
        for (const [actIdx, activity] of day.activities.entries()) {
          if (activity.photo?.assetId) refs.push([activity.photo.assetId, `days[${dayIdx}].activities[${actIdx}].photo.assetId`]);
        }
      }
    }
  }
  if (content.spots) {
    for (const [spotIdx, spot] of content.spots.entries()) {
      if (spot.photo?.assetId) refs.push([spot.photo.assetId, `spots[${spotIdx}].photo.assetId`]);
    }
  }
  const grouped = new Map<string, string[]>();
  for (const [assetId, fieldPath] of refs) if (assetId) grouped.set(assetId, [...(grouped.get(assetId) || []), fieldPath]);
  return grouped;
}

function parseTime(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d))$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(min(?:ute)?s?|minutes?|m|h(?:ours?)?|hours?|jam)\s*$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const minutes = /^(?:h|hours?|jam)/.test(unit) ? amount * 60 : amount;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function scheduleDiagnostics(content: ItineraryV2): { errors: ContractDiagnostic[]; warnings: ContractDiagnostic[] } {
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  const mode = content.trip.mode;

  if (mode === 'destination_guide') return { errors, warnings };

  const maxMinutes = mode === 'half_day' ? 360 : 660;

  for (const [dayIdx, day] of content.days.entries()) {
    if (day.activities.length === 0) {
      errors.push(err('EMPTY_ACTIVITY_BLOCK', `days[${dayIdx}].activities`, 'Tambahkan setidaknya satu kegiatan pada hari ini.'));
      continue;
    }

    let knownTotal = 0;
    let allMeasured = true;
    const intervals: Array<{ start: number; end: number; path: string }> = [];

    for (const [actIdx, activity] of day.activities.entries()) {
      const field = `days[${dayIdx}].activities[${actIdx}]`;
      const timeStr = activity.timeLabel?.trim() || '';
      const durationStr = activity.durationLabel?.trim() || '';

      // Parse time range or start time
      const range = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(timeStr);
      const start = range ? parseTime(range[1]) : parseTime(timeStr);
      const end = range ? parseTime(range[2]) : null;

      // Validate duration format
      if (durationStr && /^\s*-?\s*0*(?:[.,]0+)?\s*(?:min(?:ute)?s?|minutes?|m|h(?:ours?)?|hours?|jam)\s*$/i.test(durationStr)) {
        errors.push(err('SCHEDULE_DURATION_INVALID', `${field}.durationLabel`, 'Durasi harus lebih besar dari nol.'));
        continue;
      }
      if (durationStr && /^\s*-\s*\d+(?:[.,]\d+)?\s*(?:min(?:ute)?s?|minutes?|m|h(?:ours?)?|hours?|jam)\s*$/i.test(durationStr)) {
        errors.push(err('SCHEDULE_DURATION_INVALID', `${field}.durationLabel`, 'Durasi tidak boleh bernilai negatif.'));
        continue;
      }

      const duration = parseDuration(durationStr);
      const measuredDuration = end !== null && start !== null ? end - start : duration;

      if (measuredDuration !== null && (measuredDuration <= 0 || (end !== null && duration !== null && Math.abs(measuredDuration - duration) > 1))) {
        errors.push(err('SCHEDULE_TIME_CONTRADICTION', `${field}.durationLabel`, 'Rentang waktu dan durasi aktivitas saling bertentangan atau tidak valid.'));
        continue;
      }

      if (measuredDuration === null) {
        allMeasured = false;
        warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `${field}.durationLabel`, 'Durasi belum dapat dihitung pasti.'));
        continue;
      }

      if (start === null) {
        allMeasured = false;
        knownTotal += measuredDuration;
        warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `${field}.timeLabel`, 'Waktu mulai belum dapat dihitung pasti.'));
        continue;
      }

      knownTotal += measuredDuration;
      intervals.push({ start, end: start + measuredDuration, path: field });
    }

    // Check for overlaps
    intervals.sort((a, b) => a.start - b.start);
    let previous = intervals[0];
    for (const interval of intervals.slice(1)) {
      if (interval.start < previous.end) {
        errors.push(err('SCHEDULE_OVERLAP', interval.path + '.timeLabel', `Waktu bertumpang tindih dengan ${previous.path}.`));
      }
      if (interval.end > previous.end) previous = interval;
    }

    const elapsed = intervals.length ? intervals.at(-1)!.end - intervals[0].start : 0;
    if (knownTotal > maxMinutes || elapsed > maxMinutes) {
      errors.push(err('SCHEDULE_DURATION_CAP', `days[${dayIdx}].activities`, `Durasi melebihi batas ${maxMinutes / 60} jam untuk mode ini.`));
    }

    if (knownTotal === 0 || !allMeasured) {
      if (!warnings.some((item) => item.path === `days[${dayIdx}]`)) {
        warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `days[${dayIdx}]`, 'Sebagian jadwal belum dapat dihitung.'));
      }
    }
  }

  return { errors, warnings };
}

function hotelDiagnostics(content: ItineraryV2): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.trip.mode;

  if (mode !== 'multi_day') return errors;

  for (const [dayIdx, day] of content.days.entries()) {
    if (day.hotel && !day.hotel.name?.trim()) {
      errors.push(err('HOTEL_NAME_EMPTY', `days[${dayIdx}].hotel.name`, 'Nama hotel tidak boleh kosong untuk multi-day.'));
    }
  }

  return errors;
}

function overlapDiagnostics(content: ItineraryV2): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.trip.mode;

  if (mode === 'destination_guide' || mode === 'half_day') return errors;

  const intervals: Array<{ start: number; end: number; dayIdx: number }> = [];
  const today = new Date(content.trip.startDate || new Date().toISOString().split('T')[0]);

  for (const [dayIdx, day] of content.days.entries()) {
    const dayTime = new Date(today);
    dayTime.setDate(dayTime.getDate() + dayIdx);

    for (const activity of day.activities) {
      const timeStr = activity.timeLabel?.trim() || '';
      const durationStr = activity.durationLabel?.trim() || '';

      const range = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(timeStr);
      const start = range ? parseTime(range[1]) : parseTime(timeStr);
      const end = range ? parseTime(range[2]) : null;
      const duration = parseDuration(durationStr);
      const measuredEnd = end !== null && start !== null ? end : (start !== null && duration !== null ? start + duration : null);

      if (start !== null && measuredEnd !== null) {
        intervals.push({ start, end: measuredEnd, dayIdx });
      }
    }
  }

  // Check for day-to-day transitions (last activity before midnight, next day starts before reasonable time)
  intervals.sort((a, b) => a.dayIdx === b.dayIdx ? a.start - b.start : a.dayIdx - b.dayIdx);

  for (let i = 0; i < intervals.length - 1; i++) {
    const curr = intervals[i];
    const next = intervals[i + 1];

    if (curr.dayIdx + 1 === next.dayIdx && curr.end > 1380 && next.start < 360) {
      errors.push(err('SCHEDULE_OVERLAP', `days[${next.dayIdx}].activities[0]`, 'Jadwal hari berikutnya terlalu dekat dengan akhir hari sebelumnya.'));
    }
  }

  return errors;
}

function contentDiagnostics(content: ItineraryV2): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const moneyClaim = /\b(?:(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|Rp\.?)\s*\d[\d.,]*|\d[\d.,]*\s*(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|rupiah|yen|yuan))|[$€£¥]\s*\d[\d.,]*/i;
  const openingClaim = /(?:\b(?:opening hours?|hours of operation|jam buka|buka pukul|closes? at|horaires? d['']ouverture|heures? d['']ouverture|ouverture à|horario de apertura|horae? aperti(?:onis)?)\b|営業時間|開店時間|营业时间|开放时间)/i;
  const promotionalClaim = /(?:\b(?:book now|reserve now|limited spots?|only \d+ left|rated? \d(?:\.\d)?\s*(?:\/\s*5|stars?)|pesan sekarang|booking sekarang|kuota terbatas|tinggal \d+|réservez maintenant|réservez|places limitées|noté \d.*\/\s*5|reservare nunc|loca limitata)\b|今すぐ予約|予約する|残り\d+席|立即预订|马上预订|仅剩\d+|评分.{0,8}\d.*(?:星|分))/i;

  const fields: Array<[string, unknown]> = [
    ['trip.title', content.trip.title],
    ['trip.destination', content.trip.destination],
    ['trip.region', content.trip.region],
    ['trip.country', content.trip.country],
    ['trip.summary', content.trip.summary],
    ...content.days.flatMap((day, di) => [
      [`days[${di}].title`, day.title],
      [`days[${di}].location`, day.location],
      [`days[${di}].mealNote`, day.mealNote],
      [`days[${di}].transferNote`, day.transferNote],
      ...(day.hotel ? [[`days[${di}].hotel.name`, day.hotel.name], [`days[${di}].hotel.area`, day.hotel.area]] as Array<[string, unknown]> : []),
      ...day.activities.flatMap((act, ai) => [
        [`days[${di}].activities[${ai}].title`, act.title],
        [`days[${di}].activities[${ai}].description`, act.description],
        [`days[${di}].activities[${ai}].area`, act.area],
      ] as Array<[string, unknown]>),
    ] as Array<[string, unknown]>),
    ...(content.spots || []).flatMap((spot, si) => [
      [`spots[${si}].title`, spot.title],
      [`spots[${si}].description`, spot.description],
      [`spots[${si}].area`, spot.area],
    ] as Array<[string, unknown]>),
    ...(content.practicalInfo || []).flatMap((info, pi) => [
      [`practicalInfo[${pi}].title`, info.title],
      [`practicalInfo[${pi}].content`, info.content],
    ] as Array<[string, unknown]>),
    ['policies', (content.policies || []).map((p: any) => p?.content || '').join(' ')],
  ];

  for (const [field, value] of fields) {
    const text = (Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '').trim();
    if (!text) continue;

    if (moneyClaim.test(text)) errors.push(err('PUBLISH_CURRENCY_CLAIM', field, 'Brochure tidak boleh mencantumkan nominal harga.'));
    if (openingClaim.test(text)) errors.push(err('PUBLISH_OPENING_HOURS_CLAIM', field, 'Jangan menyatakan jam operasional venue yang belum diverifikasi.'));
    if (promotionalClaim.test(text)) errors.push(err('PUBLISH_PROMOTIONAL_CLAIM', field, 'Hapus klaim booking, rating, atau scarcity dari brochure.'));
    if (/\{\{\s*[^}]+\}\}|\[(?:TODO|TBD|PLACEHOLDER)\]/i.test(text)) errors.push(err('PUBLISH_UNRESOLVED_PLACEHOLDER', field, 'Lengkapi placeholder sebelum publish.'));
  }

  return errors;
}

export interface PreviewStore {
  getAsset(id: string): any | undefined;
}

export async function renderSavedDraftPreview(record: ItineraryRecord, store: PreviewStore, dataDir: string, stylesheetPath = defaultStylesheetPath()) {
  const draft = validateDraft(record.draftContent);
  if (!draft.ok) return { ok: false as const, status: 422, errors: localize(draft.errors), warnings: localize(draft.warnings) };
  const content = draft.value;

  if (!record.languageContext || typeof record.languageContext !== 'object' || (record.languageContext as any).language !== content.trip.language || (record.languageContext as any).source === 'unresolved' || !content.trip.language) {
    return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNRESOLVED', 'trip.language', 'Pilih atau deteksi bahasa dan simpan sebelum preview.')]), warnings: localize(draft.warnings) };
  }

  if (!getLocaleCatalog(content.trip.language)) {
    return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNSUPPORTED', 'trip.language', 'Katalog bahasa atau script ini belum tersedia.')]), warnings: localize(draft.warnings) };
  }

  const readiness = validateForPublish(content);
  const schedule = scheduleDiagnostics(content);
  const hotel = hotelDiagnostics(content);
  const overlaps = overlapDiagnostics(content);
  const contentErrors = contentDiagnostics(content);

  const expandedReadinessErrors = readiness.errors.flatMap((item) => item.code === 'PUBLISH_FIELD_REQUIRED' ? expandRequiredDiagnostic(content, item) : [item]);
  const errors = [...expandedReadinessErrors, ...schedule.errors, ...hotel, ...overlaps, ...contentErrors];
  const warnings = [...draft.warnings, ...readiness.warnings, ...schedule.warnings];

  const assets: Record<string, { dataUri: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }> = {};
  let totalBytes = 0;

  for (const [id, paths] of assetReferences(content)) {
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

  if (errors.some((item) => ['ASSET_INVALID', 'ASSET_BUNDLE_TOO_LARGE', 'LOCALE_UNRESOLVED'].includes(item.code))) {
    return { ok: false as const, status: 422, errors: localize(errors), warnings: localize(warnings) };
  }

  try {
    const resources = await loadInlineRenderResources(content.trip.language, content.trip.colorTheme, stylesheetPath);
    const profile = (record.profile || {}) as any;
    const agency = {
      name: profile.agencyName || 'Travel Guide',
      contact: profile.agencyContact || 'guide@example.com',
      logoAssetId: profile.agencyLogoAssetId || null,
    };
    const rendered = renderItineraryHtml(content, { ...resources, agency, generatedDate: new Date().toISOString().split('T')[0], assets });

    if (rendered.errors.length) {
      return { ok: false as const, status: 422, errors: localize([...errors, ...rendered.errors]), warnings: localize([...warnings, ...rendered.warnings]) };
    }

    return {
      ok: true as const,
      html: rendered.html,
      errors: localize(errors),
      warnings: localize([...warnings, ...rendered.warnings]),
      publishReady: errors.length === 0,
      scheduleVerification: content.trip.mode === 'destination_guide' ? ('not_applicable' as const) : (schedule.warnings.length ? 'partial' as const : 'complete' as const),
    };
  } catch {
    return {
      ok: false as const,
      status: 503,
      errors: localize([...errors, err('RENDER_RESOURCES_UNAVAILABLE', 'render', 'Resource renderer (CSS, font, atau catalog) belum tersedia.')]),
      warnings: localize(warnings),
    };
  }
}
