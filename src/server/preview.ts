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
  PUBLISH_FIELD_REQUIRED: 'Lengkapi field ini sebelum publish.', SCHEMA_VALIDATION_FAILED: 'Perbaiki nilai field agar sesuai format yang diminta.',
  DUPLICATE_STABLE_ID: 'Item memiliki ID yang sama; simpan ulang setelah memperbaiki data.', MODE_SHAPE_INVALID: 'Struktur schedule dan tempat tidak cocok dengan mode itinerary.',
  SINGLE_BLOCK_REQUIRED: 'Mode ini membutuhkan tepat satu blok jadwal.', SINGLE_DAY_RANGE_INVALID: 'Periksa rentang hari dan akomodasi untuk mode ini.',
  MULTI_DAY_RANGE_INVALID: 'Rentang hari harus berurutan dan tidak tumpang tindih.', CONDENSED_RANGE_MISMATCH: 'Periksa penanda rentang hari yang diringkas.',
  ACCOMMODATION_REQUIRED: 'Tambahkan panduan akomodasi untuk setiap blok multi-day.', MULTI_DAY_COVERAGE_MISMATCH: 'Lengkapi rentang hari dari hari pertama sampai hari terakhir.',
  EMPTY_ACTIVITY_BLOCK: 'Tambahkan setidaknya satu aktivitas pada setiap blok jadwal.', PHOTO_ATTRIBUTION_REQUIRED: 'Lengkapi atribusi untuk foto yang digunakan.',
  HERO_FALLBACK_INVALID: 'Pilih foto hero atau gunakan gradien.', RENDER_ASSET_MISSING: 'Aset foto tidak tersedia; preview menggunakan tampilan fallback.',
  LOCALE_UNSUPPORTED: 'Katalog bahasa atau script ini belum didukung.', LOCALE_LABELS_INCOMPLETE: 'Katalog label bahasa belum lengkap.',
  RENDER_STYLES_INVALID: 'Stylesheet render tidak tersedia atau tidak aman.', RENDER_FONTS_EXTERNAL: 'Font render tidak tersedia sebagai resource lokal.'
};
function localize(items: PreviewDiagnostic[]) { return items.map((item) => ({ ...item, message: editorMessages[item.code] || item.message })); }

function expandRequiredDiagnostic(content: WebItineraryContent, diagnostic: ContractDiagnostic): PreviewDiagnostic[] {
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
function assetReferences(content: WebItineraryContent) {
  const refs: Array<[string | null | undefined, string]> = [
    [content.brochure.agencyLogoAssetId, 'brochure.agencyLogoAssetId'], [content.hero.assetId, 'hero.assetId'],
    ...content.schedule.map((item, index) => [item.assetId, `schedule[${index}].assetId`] as [string | null | undefined, string]),
    ...content.spots.map((item, index) => [item.assetId, `spots[${index}].assetId`] as [string | null | undefined, string])
  ];
  const grouped = new Map<string, string[]>();
  for (const [assetId, path] of refs) if (assetId) grouped.set(assetId, [...(grouped.get(assetId) || []), path]);
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

function scheduleDiagnostics(content: WebItineraryContent): { errors: ContractDiagnostic[]; warnings: ContractDiagnostic[] } {
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  if (content.brochure.itineraryMode === 'destination_guide') return { errors, warnings };
  const maxMinutes = content.brochure.itineraryMode === 'half_day' ? 360 : 660;
  const isMulti = content.brochure.itineraryMode === 'multi_day';
  for (const [blockIndex, block] of content.schedule.entries()) {
    const condensed = isMulti && (block.isCondensed || block.dayEnd > block.dayStart);
    if (condensed) warnings.push(err('SCHEDULE_DAYS_NOT_FULLY_VERIFIED', `schedule[${blockIndex}]`, 'Rentang hari memadatkan beberapa hari; durasi tiap hari tidak dapat diverifikasi dari data ini.'));
    let knownTotal = 0;
    let allMeasured = true;
    const intervals: Array<{ start: number; end: number; path: string }> = [];
    for (const [activityIndex, activity] of block.activities.entries()) {
      const field = `schedule[${blockIndex}].activities[${activityIndex}]`;
      const label = activity.timeLabel.trim().replace(/[–—]/g, '-');
      const range = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(label);
      const start = range ? parseTime(range[1]) : parseTime(label);
      const end = range ? parseTime(range[2]) : null;
      if (activity.durationLabel && /^\s*-?\s*0*(?:[.,]0+)?\s*(?:min(?:ute)?s?|minutes?|m|h(?:ours?)?|hours?|jam)\s*$/i.test(activity.durationLabel)) {
        errors.push(err('SCHEDULE_DURATION_INVALID', `${field}.durationLabel`, 'Durasi harus lebih besar dari nol.'));
        continue;
      }
      if (activity.durationLabel && /^\s*-\s*\d+(?:[.,]\d+)?\s*(?:min(?:ute)?s?|minutes?|m|h(?:ours?)?|hours?|jam)\s*$/i.test(activity.durationLabel)) {
        errors.push(err('SCHEDULE_DURATION_INVALID', `${field}.durationLabel`, 'Durasi tidak boleh bernilai negatif.'));
        continue;
      }
      const duration = parseDuration(activity.durationLabel);
      const measuredDuration = end !== null && start !== null ? end - start : duration;
      if (measuredDuration !== null && (measuredDuration <= 0 || (end !== null && duration !== null && Math.abs(measuredDuration - duration) > 1))) {
        errors.push(err('SCHEDULE_TIME_CONTRADICTION', `${field}.durationLabel`, 'Rentang waktu dan durasi aktivitas saling bertentangan atau tidak valid.'));
        continue;
      }
      if (condensed) {
        if (measuredDuration !== null && measuredDuration > maxMinutes) errors.push(err('SCHEDULE_DURATION_CAP', `${field}.durationLabel`, `Satu aktivitas melampaui batas ${maxMinutes / 60} jam per hari.`));
        if (measuredDuration === null || start === null) {
          allMeasured = false;
          warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `${field}.${start === null ? 'timeLabel' : 'durationLabel'}`, 'Waktu atau durasi belum dapat dihitung pasti; jadwal belum sepenuhnya diverifikasi.'));
        }
        continue;
      }
      if (measuredDuration === null) {
        allMeasured = false;
        warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `${field}.durationLabel`, 'Waktu atau durasi belum dapat dihitung pasti; jadwal belum sepenuhnya diverifikasi.'));
        continue;
      }
      if (start === null) {
        allMeasured = false;
        knownTotal += measuredDuration;
        warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `${field}.timeLabel`, 'Waktu mulai belum dapat dihitung pasti; durasi terukur tetap dihitung terhadap batas mode.'));
        continue;
      }
      knownTotal += measuredDuration;
      intervals.push({ start, end: start + measuredDuration, path: field });
    }
    intervals.sort((a, b) => a.start - b.start);
    let previous = intervals[0];
    for (const interval of intervals.slice(1)) {
      if (interval.start < previous.end) errors.push(err('SCHEDULE_OVERLAP', interval.path + '.timeLabel', `Waktu bertumpang tindih dengan ${previous.path}.`));
      if (interval.end > previous.end) previous = interval;
    }
    const elapsed = intervals.length ? intervals.at(-1)!.end - intervals[0].start : 0;
    if (knownTotal > maxMinutes || elapsed > maxMinutes) errors.push(err('SCHEDULE_DURATION_CAP', `schedule[${blockIndex}].activities`, `Durasi terukur atau rentang waktu melebihi batas ${maxMinutes / 60} jam untuk mode ini.`));
    if (knownTotal === 0 || !allMeasured) {
      if (!warnings.some((item) => item.path === `schedule[${blockIndex}]`)) warnings.push(err('SCHEDULE_NOT_FULLY_VERIFIED', `schedule[${blockIndex}]`, 'Sebagian jadwal belum dapat dihitung; tidak ada durasi yang akan ditebak.'));
    }
  }
  return { errors, warnings };
}

function contentDiagnostics(content: WebItineraryContent): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const moneyClaim = /\b(?:(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|Rp\.?)\s*\d[\d.,]*|\d[\d.,]*\s*(?:IDR|USD|EUR|GBP|JPY|CNY|RMB|rupiah|yen|yuan))|[$€£¥]\s*\d[\d.,]*/i;
  const openingClaim = /(?:\b(?:opening hours?|hours of operation|jam buka|buka pukul|closes? at|horaires? d['’]ouverture|heures? d['’]ouverture|ouverture à|horario de apertura|horae? aperti(?:onis)?)\b|営業時間|開店時間|营业时间|开放时间)/i;
  const promotionalClaim = /(?:\b(?:book now|reserve now|limited spots?|only \d+ left|rated? \d(?:\.\d)?\s*(?:\/\s*5|stars?)|pesan sekarang|booking sekarang|kuota terbatas|tinggal \d+|réservez maintenant|réservez|places limitées|noté \d.*\/\s*5|reservare nunc|loca limitata)\b|今すぐ予約|予約する|残り\d+席|立即预订|马上预订|仅剩\d+|评分.{0,8}\d.*(?:星|分))/i;
  const fields: Array<[string, unknown]> = [
    ['brochure.tripTitle', content.brochure.tripTitle], ['brochure.destination', content.brochure.destination], ['brochure.region', content.brochure.region], ['brochure.agencyName', content.brochure.agencyName], ['brochure.themes', content.brochure.themes],
    ['overview.summary', content.overview.summary], ['overview.routeSummary', content.overview.routeSummary], ['overview.quickFacts.bestSeason', content.overview.quickFacts.bestSeason],
    ...content.overview.highlights.flatMap((item, i) => [[`overview.highlights[${i}].title`, item.title], [`overview.highlights[${i}].note`, item.note]] as Array<[string, unknown]>),
    ...content.schedule.flatMap((block, bi) => [
      [`schedule[${bi}].title`, block.title], [`schedule[${bi}].location`, block.location], [`schedule[${bi}].transportNote`, block.transportNote], [`schedule[${bi}].blockTip`, block.blockTip],
      ...block.mealsIncluded.map((value, mi) => [`schedule[${bi}].mealsIncluded[${mi}]`, value] as [string, unknown]),
      ...(block.accommodation ? [[`schedule[${bi}].accommodation`, [block.accommodation.name, block.accommodation.area, block.accommodation.note]] as [string, unknown]] : []),
      ...block.activities.flatMap((item, ai) => [[`schedule[${bi}].activities[${ai}].title`, item.title], [`schedule[${bi}].activities[${ai}].description`, item.description], [`schedule[${bi}].activities[${ai}].tip`, item.tip], [`schedule[${bi}].activities[${ai}].area`, item.area], [`schedule[${bi}].activities[${ai}].category`, item.category]] as Array<[string, unknown]>)
    ] as Array<[string, unknown]>),
    ...content.spots.flatMap((item, i) => [[`spots[${i}].name`, item.name], [`spots[${i}].description`, item.description], [`spots[${i}].logistics`, [item.area, item.category, item.gettingThere, item.tips, item.nearbyPairing, item.suggestedDuration, item.bestTimeToVisit]]] as Array<[string, unknown]>),
    ...content.practical.localTips.map((item, i) => [`practical.localTips[${i}]`, [item.topic, item.note]] as [string, unknown]),
    ...content.practical.included.map((value, i) => [`practical.included[${i}]`, value] as [string, unknown]),
    ...content.practical.notIncluded.map((value, i) => [`practical.notIncluded[${i}]`, value] as [string, unknown]),
    ...content.practical.whatToBring.map((value, i) => [`practical.whatToBring[${i}]`, value] as [string, unknown]),
    ...content.practical.healthSafety.map((value, i) => [`practical.healthSafety[${i}]`, value] as [string, unknown]),
    ...content.practical.emergencyContacts.map((item, i) => [`practical.emergencyContacts[${i}]`, [item.label, item.value]] as [string, unknown]),
    ...content.closing.photoCredits.map((item, i) => [`closing.photoCredits[${i}]`, [item.photographer, item.source]] as [string, unknown]),
    ['closing.closingNote', content.closing.closingNote], ['closing.disclaimer', content.closing.disclaimer]
  ];
  for (const [field, value] of fields) {
    const text = (Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '').trim();
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
  if (!record.languageContext || typeof record.languageContext !== 'object' || (record.languageContext as any).outputLanguage !== content.brochure.outputLanguage || (record.languageContext as any).source === 'unresolved' || !content.brochure.outputLanguage) {
    return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNRESOLVED', 'brochure.outputLanguage', 'Pilih atau deteksi bahasa dan simpan sebelum preview.')]), warnings: localize(draft.warnings) };
  }
  if (!getLocaleCatalog(content.brochure.outputLanguage)) return { ok: false as const, status: 422, errors: localize([err('LOCALE_UNSUPPORTED', 'brochure.outputLanguage', 'Katalog bahasa atau script ini belum tersedia.')]), warnings: localize(draft.warnings) };
  const readiness = validateForPublish(content);
  const schedule = scheduleDiagnostics(content);
  const contentErrors = contentDiagnostics(content);
  const unquantifiedTime = (diagnostic: ContractDiagnostic) => diagnostic.code === 'PUBLISH_FIELD_REQUIRED' && /^schedule(?:\[\d+\]|\[\])\.activities(?:\[\d+\]|\[\])\.timeLabel$/.test(diagnostic.path);
  const expandedReadinessErrors = readiness.errors.flatMap((item) => item.code === 'PUBLISH_FIELD_REQUIRED' ? expandRequiredDiagnostic(content, item) : [item]);
  const errors = [...expandedReadinessErrors.filter((item) => !unquantifiedTime(item)), ...schedule.errors, ...contentErrors];
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
  if (errors.some((item) => ['ASSET_INVALID', 'ASSET_BUNDLE_TOO_LARGE', 'LOCALE_UNRESOLVED'].includes(item.code))) return { ok: false as const, status: 422, errors: localize(errors), warnings: localize(warnings) };
  try {
    const resources = await loadInlineRenderResources(content.brochure.outputLanguage, content.brochure.destinationType, stylesheetPath);
    const rendered = renderItineraryHtml(content, { ...resources, assets });
    if (rendered.errors.length) return { ok: false as const, status: 422, errors: localize([...errors, ...rendered.errors]), warnings: localize([...warnings, ...rendered.warnings]) };
    return { ok: true as const, html: rendered.html, errors: localize(errors), warnings: localize([...warnings, ...rendered.warnings]), publishReady: errors.length === 0, scheduleVerification: content.brochure.itineraryMode === 'destination_guide' ? 'not_applicable' as const : schedule.warnings.length ? 'partial' as const : 'complete' as const };
  } catch {
    return { ok: false as const, status: 503, errors: localize([...errors, err('RENDER_RESOURCES_UNAVAILABLE', 'render', 'Resource renderer (CSS, font, atau catalog) belum tersedia.')]), warnings: localize(warnings) };
  }
}
