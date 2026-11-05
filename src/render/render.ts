import type { Closing, PhotoAttribution, ScheduleBlock, Spot, WebItineraryContent } from '../contracts/types.js';
import type { ContractDiagnostic } from '../contracts/types.js';
import type { LocaleCatalog } from '../contracts/locale-catalogs.js';
import { getLocaleCatalog } from '../contracts/locale-catalogs.js';

export interface RenderPalette {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  textDark: string;
  textMuted: string;
  gradientStops: string[];
}

export interface RenderAsset {
  dataUri: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface RenderOptions {
  stylesheet: string;
  fontCss: string;
  catalog: LocaleCatalog;
  palette: RenderPalette;
  assets?: Record<string, RenderAsset>;
}

export interface RenderResult {
  html: string;
  errors: ContractDiagnostic[];
  warnings: ContractDiagnostic[];
}

const ICONS: Record<string, string> = {
  transport: '<path d="M5 16h14l-1-7H6l-1 7Z"/><path d="M8 9 9 5h6l1 4M7 19h2m6 0h2"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  sightseeing: '<path d="m12 3 2.2 5.2L20 10l-4.3 3.7L16.7 19 12 16.1 7.3 19l1-5.3L4 10l5.8-1.8L12 3Z"/>',
  food: '<path d="M6 3v8m3-8v8m-3 0h3m-1.5 0V21M15 3v18m0-18c3 1 3 5 0 6"/>',
  activity: '<circle cx="12" cy="12" r="8"/><path d="m12 7 1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5L12 7Z"/>',
  rest: '<path d="M4 12h16M5 12V9h5a2 2 0 0 1 2 2v1m0 0V9h5a2 2 0 0 1 2 2v1M4 18v-6m16 6v-6"/>',
  accommodation: '<path d="M4 18V8m0 7h16v3M7 13V9h4a2 2 0 0 1 2 2v2m0 0V9h4a2 2 0 0 1 2 2v2"/>',
  free: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>'
};

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]!));

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function label(catalog: { labels: Record<string, string> }, key: string): string {
  return catalog.labels[key] || key;
}

function icon(type: string, title: string): string {
  const path = ICONS[type] || ICONS.activity;
  return `<svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${esc(title)}">${path}</svg>`;
}

function activityTypeLabel(type: string, catalog: { labels: Record<string, string> }) {
  const key = `activityType${type[0]?.toUpperCase() || ''}${type.slice(1)}`;
  return label(catalog, key);
}

function safeCreditUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function isCompletePhotoCredit(credit: PhotoAttribution | null | undefined): boolean {
  if (!credit || !credit.photographer.trim() || !credit.source.trim()) return false;
  const link = safeCreditUrl(credit.photographerUrl);
  if (credit.photographerUrl && !link) return false;
  if (/unsplash|pexels/i.test(credit.source) && !link) return false;
  return true;
}

function hasUnsafeCss(css: string): boolean {
  if (/@import|<\/style/i.test(css)) return true;
  return [...css.matchAll(/url\(([^)]+)\)/gi)].some((match) => {
    const resource = match[1].trim().replace(/^['"]|['"]$/g, '');
    return !resource.startsWith('data:') && !resource.startsWith('#');
  });
}

function collectCredits(content: WebItineraryContent, used: PhotoAttribution[]): PhotoAttribution[] {
  return [
    ...content.closing.photoCredits.filter((credit): credit is PhotoAttribution => Boolean(credit)),
    ...used.filter((credit): credit is PhotoAttribution => Boolean(credit))
  ];
}

function catalogCapabilityError(locale: string | null | undefined, catalog: LocaleCatalog | null): ContractDiagnostic | null {
  const unsupported = (message: string): ContractDiagnostic => ({ code: 'LOCALE_UNSUPPORTED', path: 'brochure.outputLanguage', message });
  if (!locale || !catalog) return unsupported('No matching self-contained label catalog is available for this locale.');
  const expected = getLocaleCatalog(locale);
  if (!expected || expected.locale !== catalog.locale) {
    return unsupported(`The supplied label catalog (${catalog.locale}) does not match the language and script required by ${locale}.`);
  }
  const keys = Object.keys(expected.labels);
  if (!keys.length || keys.some((key) => typeof catalog.labels?.[key] !== 'string' || !catalog.labels[key].trim())) {
    return { code: 'LOCALE_LABELS_INCOMPLETE', path: 'brochure.outputLanguage', message: `The label catalog for ${catalog.locale} is incomplete and cannot be rendered.` };
  }
  return null;
}

function resolvedImage(assetId: string | null, options: RenderOptions, path: string, warnings: ContractDiagnostic[]): string | null {
  if (!assetId) return null;
  const asset = options.assets?.[assetId];
  if (!asset) {
    warnings.push({ code: 'RENDER_ASSET_MISSING', path, message: 'The referenced workspace asset is unavailable; the themed fallback is rendered.' });
    return null;
  }
  const mime = asset.mimeType;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !new RegExp(`^data:${mime.replace('/', '\\/')};base64,[a-z0-9+/]+=*$`, 'i').test(asset.dataUri)) return null;
  return asset.dataUri;
}

function assetErrors(content: WebItineraryContent, options: RenderOptions): ContractDiagnostic[] {
  const ids = [content.brochure.agencyLogoAssetId, content.hero.assetId, ...content.schedule.map((block) => block.assetId), ...content.spots.map((spot) => spot.assetId)].filter((id): id is string => Boolean(id));
  let totalBytes = 0;
  const errors: ContractDiagnostic[] = [];
  for (const id of new Set(ids)) {
    const asset = options.assets?.[id];
    if (!asset) continue;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) || !new RegExp(`^data:${asset.mimeType.replace('/', '\\/')};base64,[a-z0-9+/]+=*$`, 'i').test(asset.dataUri)) {
      errors.push({ code: 'ASSET_INVALID', path: `assets.${id}`, message: 'The resolved workspace asset is missing or is not a safe inline raster image.' });
      continue;
    }
    const payload = asset.dataUri.slice(asset.dataUri.indexOf(',') + 1);
    const bytes = Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
    if (bytes > 5 * 1024 * 1024) errors.push({ code: 'ASSET_TOO_LARGE', path: `assets.${id}`, message: 'Each resolved image must be at most 5 MiB.' });
    totalBytes += bytes;
  }
  if (totalBytes > 20 * 1024 * 1024) errors.push({ code: 'ASSET_BUNDLE_TOO_LARGE', path: 'assets', message: 'Resolved images must total at most 20 MiB per render.' });
  return errors;
}

function creditMarkup(credits: PhotoAttribution[], catalog: { labels: Record<string, string> }): string {
  if (!credits.length) return '';
  const unique = [...new Map(credits.map((credit) => [`${credit.photographer}|${credit.photographerUrl}|${credit.source}`, credit])).values()];
  return `<div class="credits mt-5 border-t pt-4 text-xs">${esc(label(catalog, 'photoCredits'))}: ${unique.map((credit) => {
    const href = safeCreditUrl(credit.photographerUrl);
    const name = href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(credit.photographer)}</a>` : esc(credit.photographer);
    return `${name}${credit.source ? ` · ${esc(credit.source)}` : ''}`;
  }).join(' &nbsp;·&nbsp; ')}</div>`;
}

function renderActivity(activity: WebItineraryContent['schedule'][number]['activities'][number], catalog: { labels: Record<string, string> }): string {
  return `<article class="timeline-row break-inside-avoid pb-5"><div class="pt-1 text-right text-xs font-bold text-[var(--brand-primary)]">${esc(activity.timeLabel)}</div><div class="timeline-marker">${icon(activity.type, activityTypeLabel(activity.type, catalog))}</div><div class="min-w-0 border-b border-slate-200 pb-4"><div class="flex flex-wrap items-baseline gap-2"><h4 class="m-0 text-lg font-bold tracking-tight">${esc(activity.title)}</h4><span class="text-xs text-slate-500">${esc(activityTypeLabel(activity.type, catalog))}</span>${activity.durationLabel ? `<span class="text-xs text-slate-500">${esc(activity.durationLabel)}</span>` : ''}</div><p class="mt-2 text-sm leading-relaxed text-slate-700">${esc(activity.description)}</p>${activity.area || activity.category ? `<p class="mt-2 text-xs font-medium text-slate-500">${[activity.area, activity.category].filter(Boolean).map(esc).join(' · ')}</p>` : ''}${activity.tip ? `<div class="local-tip mt-3 rounded-r-lg px-3 py-2 text-sm"><b>${esc(label(catalog, 'localTip'))}</b> · ${esc(activity.tip)}</div>` : ''}</div></article>`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '';
  try {
    const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const requestedLanguage = new Intl.Locale(locale).language.toLowerCase();
    const resolvedLanguage = new Intl.Locale(formatter.resolvedOptions().locale).language.toLowerCase();
    if (requestedLanguage !== resolvedLanguage) return value;
    return formatter.format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function renderSchedule(blocks: ScheduleBlock[], content: WebItineraryContent, options: RenderOptions, catalog: { labels: Record<string, string> }, errors: ContractDiagnostic[], warnings: ContractDiagnostic[], usedCredits: PhotoAttribution[]): string {
  if (!blocks.length) return '';
  const isMulti = content.brochure.itineraryMode === 'multi_day';
  const titleKey = content.brochure.itineraryMode === 'half_day' ? 'modeHalfDay' : content.brochure.itineraryMode === 'multi_day' ? 'modeMultiDay' : 'modeFullDay';
  return `<section class="section" id="schedule"><h2 class="section-title">${esc(label(catalog, titleKey))}</h2>${isMulti ? `<nav class="day-index mb-6 flex gap-2 overflow-x-auto" aria-label="${esc(label(catalog, 'itinerary'))}">${blocks.map((block) => `<span class="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">${block.dayStart === block.dayEnd ? `${esc(label(catalog, 'dayLabel'))} ${block.dayStart}` : `${esc(label(catalog, 'dayLabel'))} ${block.dayStart}–${block.dayEnd}`}</span>`).join('')}</nav>` : ''}${blocks.map((block, index) => {
    const image = resolvedImage(block.assetId || null, options, `schedule[${index}].assetId`, warnings);
    if (image && !isCompletePhotoCredit(block.photoAttribution)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `schedule[${index}].photoAttribution`, message: 'The schedule region image has no complete attribution.' });
    if (image && isCompletePhotoCredit(block.photoAttribution)) usedCredits.push(block.photoAttribution!);
    const photo = image ? `<img class="mb-4 aspect-[16/7] w-full rounded-xl object-cover" src="${esc(image)}" alt="${esc(label(catalog, 'regionPhoto'))}" />` : '';
    return `<section class="${isMulti ? 'mb-8 border-t border-slate-200 pt-5' : ''}">${isMulti ? `<header class="mb-4"><p class="m-0 text-xs font-bold uppercase tracking-wider text-[var(--brand-primary)]">${esc(label(catalog, 'dayLabel'))} ${block.dayStart}${block.dayEnd > block.dayStart ? `–${block.dayEnd}` : ''}${block.date ? ` · ${esc(formatDate(block.date, content.brochure.outputLanguage!))}` : ''}</p><h3 class="mb-1 mt-1 text-xl font-bold">${esc(block.title)}</h3><p class="m-0 text-sm text-slate-500">${esc(block.location)}</p></header>` : `<header class="mb-4">${block.title ? `<h3 class="m-0 text-lg font-bold">${esc(block.title)}</h3>` : ''}${block.location ? `<p class="m-0 text-sm text-slate-500">${esc(block.location)}</p>` : ''}</header>`}${photo}<div class="timeline">${block.activities.map((activity) => renderActivity(activity, catalog)).join('')}</div>${block.mealsIncluded.length ? `<p class="mt-2 text-sm"><b>${esc(label(catalog, 'mealsIncluded'))}:</b> ${block.mealsIncluded.map(esc).join(' · ')}</p>` : ''}${block.transportNote ? `<p class="text-sm"><b>${esc(label(catalog, 'transport'))}:</b> ${esc(block.transportNote)}</p>` : ''}${block.accommodation ? `<div class="my-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><b>${esc(label(catalog, 'accommodationName'))}</b>${block.accommodation.name ? ` · ${esc(block.accommodation.name)}` : ''}<p class="mb-0 mt-1 text-sm">${esc(block.accommodation.area)}${block.accommodation.note ? ` · ${esc(block.accommodation.note)}` : ''}</p></div>` : ''}${block.blockTip ? `<div class="local-tip rounded-r-lg px-3 py-2 text-sm"><b>${esc(label(catalog, 'localTip'))}</b> · ${esc(block.blockTip)}</div>` : ''}</section>`;
  }).join('')}</section>`;
}

function renderGuide(spots: Spot[], content: WebItineraryContent, options: RenderOptions, catalog: { labels: Record<string, string> }, errors: ContractDiagnostic[], warnings: ContractDiagnostic[], usedCredits: PhotoAttribution[]): string {
  if (!spots.length) return '';
  const runs: Array<{ group: string; entries: Array<{ spot: Spot; index: number }> }> = [];
  spots.forEach((spot, sourceIndex) => {
    const group = spot.groupLabel || '';
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.entries.push({ spot, index: sourceIndex });
    else runs.push({ group, entries: [{ spot, index: sourceIndex }] });
  });
  const sections = runs.map((run) => `<section class="guide-group mb-8">${run.group ? `<h3 class="guide-group-title mb-2 text-xl font-bold">${esc(run.group)}</h3>` : ''}<div class="guide-grid grid grid-cols-1 gap-5">${run.entries.map(({ spot, index }) => {
    const image = resolvedImage(spot.assetId, options, `spots[${index}].assetId`, warnings);
    if (image && !isCompletePhotoCredit(spot.photoAttribution)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `spots[${index}].photoAttribution`, message: 'The region image has no complete attribution.' });
    if (image && isCompletePhotoCredit(spot.photoAttribution)) usedCredits.push(spot.photoAttribution!);
    const photo = image ? `<img class="mb-4 aspect-[16/9] w-full rounded-lg object-cover" src="${esc(image)}" alt="${esc(label(catalog, 'regionPhoto'))}" />` : '';
    return `<article class="spot-card break-inside-avoid border-t border-slate-200 p-4"><p class="m-0 text-xs font-bold uppercase tracking-wider text-[var(--brand-primary)]">${String(index + 1).padStart(2, '0')}</p>${photo}<h4 class="mb-1 mt-2 text-lg font-bold">${esc(spot.name)}</h4><p class="m-0 text-xs font-semibold text-slate-500">${[spot.area, spot.category].filter(Boolean).map(esc).join(' · ')}</p><p class="my-3 text-sm leading-relaxed text-slate-700">${esc(spot.description)}</p><dl class="grid grid-cols-1 gap-3 text-sm"><div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'suggestedDuration'))}</dt><dd class="m-0">${esc(spot.suggestedDuration)}</dd></div><div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'bestTimeToVisit'))}</dt><dd class="m-0">${esc(spot.bestTimeToVisit)}</dd></div><div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'gettingThere'))}</dt><dd class="m-0">${esc(spot.gettingThere)}</dd></div>${spot.nearbyPairing ? `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'nearbyPairing'))}</dt><dd class="m-0">${esc(spot.nearbyPairing)}</dd></div>` : ''}</dl>${spot.tips.length ? `<div class="local-tip mt-4 rounded-r-lg px-3 py-2 text-sm"><b>${esc(label(catalog, 'localTip'))}</b> · ${spot.tips.map(esc).join(' · ')}</div>` : ''}</article>`;
  }).join('')}</div></section>`).join('');
  return `<section class="section" id="guide"><h2 class="section-title">${esc(label(catalog, 'exploreDestinations'))}</h2><p class="mb-6 max-w-3xl text-slate-600">${esc(content.overview.summary)}</p>${sections}</section>`;
}

function renderPractical(content: WebItineraryContent, catalog: { labels: Record<string, string> }): string {
  const groups: Array<[string, string[]]> = [
    ['included', content.practical.included], ['notIncluded', content.practical.notIncluded],
    ['whatToBring', content.practical.whatToBring], ['healthSafety', content.practical.healthSafety]
  ].filter(([, values]) => values.length) as Array<[string, string[]]>;
  if (content.practical.localTips.length) groups.push(['localTip', content.practical.localTips.map((tip) => tip.topic ? `${tip.topic}: ${tip.note}` : tip.note)]);
  if (content.practical.emergencyContacts.length) groups.push(['emergencyContact', content.practical.emergencyContacts.map((contact) => `${contact.label}: ${contact.value}`)]);
  if (!groups.length) return '';
  return `<section class="section" id="practical"><h2 class="section-title">${esc(label(catalog, 'practicalInfo'))}</h2><div class="practical-grid grid grid-cols-1 gap-4">${groups.map(([key, values]) => `<article class="practical-card rounded-xl border border-slate-200 p-4"><h3 class="mb-2 mt-0 text-base font-bold">${esc(label(catalog, key))}</h3><ul class="m-0 list-disc space-y-1 pl-5 text-sm text-slate-700">${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></article>`).join('')}</div></section>`;
}

export function renderItineraryHtml(content: WebItineraryContent, options: RenderOptions): RenderResult {
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  const locale = content.brochure.outputLanguage;
  const catalog = options.catalog;
  const capabilityError = catalogCapabilityError(locale, catalog);
  if (capabilityError) return { html: '', errors: [capabilityError], warnings };
  const resolvedLocale = locale!;
  errors.push(...assetErrors(content, options));
  if (!options.stylesheet.trim() || hasUnsafeCss(options.stylesheet)) errors.push({ code: 'RENDER_STYLES_INVALID', path: 'stylesheet', message: 'Renderer CSS must be non-empty, self-contained, and safe to inline.' });
  if (hasUnsafeCss(options.fontCss)) errors.push({ code: 'RENDER_FONTS_EXTERNAL', path: 'fontCss', message: 'Font CSS must not import or request external resources.' });
  const palette = options.palette;
  const primary = safeColor(palette?.primary, '#172B4D');
  const secondary = safeColor(palette?.secondary, '#0F766E');
  const accent = safeColor(palette?.accent, '#DFF4F0');
  const ink = safeColor(palette?.textDark, '#111827');
  const usedCredits: PhotoAttribution[] = [];
  const heroImage = !content.hero.gradientOnly && content.hero.assetId
    ? resolvedImage(content.hero.assetId, options, 'hero.assetId', warnings)
    : null;
  if (heroImage && !isCompletePhotoCredit(content.hero.photoAttribution)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: 'hero.photoAttribution', message: 'The hero image has no complete attribution.' });
  if (heroImage && isCompletePhotoCredit(content.hero.photoAttribution)) usedCredits.push(content.hero.photoAttribution!);
  const heroPhoto = heroImage ? `<img class="hero-image" src="${esc(heroImage)}" alt="${esc(label(catalog, 'heroPhoto'))}" />` : '';
  const logo = resolvedImage(content.brochure.agencyLogoAssetId || null, options, 'brochure.agencyLogoAssetId', warnings);
  const factThemes = content.overview.quickFacts.themes?.length
    ? content.overview.quickFacts.themes
    : content.brochure.themes || [];
  const quickFacts: Array<[string, string]> = [
    ['scope', content.overview.quickFacts.scope], ['pace', label(catalog, `pace${content.brochure.paceLevel}`)],
    ['bestSeason', content.overview.quickFacts.bestSeason], ['themes', factThemes.join(' · ')],
    ['startDate', content.brochure.startDate ? formatDate(content.brochure.startDate, resolvedLocale) : ''],
    ['endDate', content.brochure.endDate ? formatDate(content.brochure.endDate, resolvedLocale) : ''],
    ['travelerCount', content.brochure.travelerCount ? String(content.brochure.travelerCount) : ''],
    ['travelerType', content.brochure.travelerType || ''],
    ['generatedDate', content.brochure.generatedDate ? formatDate(content.brochure.generatedDate, resolvedLocale) : '']
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  const factsHtml = quickFacts.length ? `<section class="facts relative z-10"><div class="facts-grid grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">${quickFacts.map(([key, value]) => `<div class="border-b border-r border-slate-100 px-4 py-3"><span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">${esc(label(catalog, key))}</span><strong class="mt-1 block text-sm">${esc(value)}</strong></div>`).join('')}</div></section>` : '';
  const overview = content.overview.summary || content.overview.routeSummary.length || content.overview.highlights.length
    ? `<section class="section" id="overview"><h2 class="section-title">${esc(label(catalog, 'tripOverview'))}</h2>${content.overview.summary ? `<p class="max-w-3xl text-base leading-relaxed text-slate-700">${esc(content.overview.summary)}</p>` : ''}${content.overview.routeSummary.length ? `<div class="mt-4 flex flex-wrap gap-2"><b>${esc(label(catalog, 'routeSummary'))}:</b>${content.overview.routeSummary.map((stop) => `<span class="rounded-full bg-slate-100 px-3 py-1 text-sm">${esc(stop)}</span>`).join('')}</div>` : ''}${content.overview.highlights.length ? `<div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${content.overview.highlights.map((highlight) => `<article class="flex gap-3 rounded-xl border border-slate-200 p-4">${icon(highlight.icon, label(catalog, 'highlights'))}<div><h3 class="m-0 font-bold">${esc(highlight.title)}</h3><p class="mb-0 mt-1 text-sm text-slate-600">${esc(highlight.note)}</p></div></article>`).join('')}</div>` : ''}</section>` : '';
  const body = content.brochure.itineraryMode === 'destination_guide'
    ? renderGuide(content.spots, content, options, catalog, errors, warnings, usedCredits)
    : renderSchedule(content.schedule, content, options, catalog, errors, warnings, usedCredits);
  const practical = renderPractical(content, catalog);
  const credits = collectCredits(content, usedCredits);
  const closing: Closing = content.closing;
  const agencyContact = closing.agencyContact || content.brochure.agencyContact || '';
  const closingSection = `<footer class="closing p-6 sm:p-8"><h2 class="m-0 text-2xl font-bold">${esc(label(catalog, 'closingHeading'))}</h2>${closing.closingNote ? `<p class="mt-3">${esc(closing.closingNote)}</p>` : ''}${agencyContact ? `<p class="font-semibold">${esc(agencyContact)}</p>` : ''}${closing.disclaimer ? `<p class="text-sm text-white/80">${esc(closing.disclaimer)}</p>` : ''}${creditMarkup(credits, catalog)}</footer>`;
  if (errors.length) return { html: '', errors, warnings };
  const lang = esc(locale);
  const title = esc(content.brochure.tripTitle || content.brochure.destination);
  const cssVars = `--brand-primary:${primary};--brand-secondary:${secondary};--brand-accent:${accent};--brand-ink:${ink};`;
  const logoMarkup = logo ? `<img class="size-9 rounded-full bg-white object-contain p-1" src="${esc(logo)}" alt="${esc(label(catalog, 'agencyLogo'))}" />` : '';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>${options.fontCss}\n${options.stylesheet}</style></head><body><main class="brochure" style="${cssVars}"><header class="hero">${heroPhoto}<div class="hero-copy relative z-10"><div class="mb-5 flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-widest"><span class="flex items-center gap-2">${logoMarkup}${esc(content.brochure.agencyName)}</span><span class="rounded-full border border-white/50 px-3 py-1">${esc(content.brochure.scopeLabel)}</span></div><p class="mb-2 text-xs font-bold uppercase tracking-widest text-white/80">${esc(label(catalog, `mode${content.brochure.itineraryMode.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`))}</p><h1 class="m-0 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">${title}</h1><p class="mb-0 mt-3 text-base text-white/90">${esc([content.brochure.destination, content.brochure.region, content.brochure.country].filter(Boolean).join(' · '))}</p></div></header><div class="content">${factsHtml}${overview}${body}${practical}</div>${closingSection}</main></body></html>`;
  if (Buffer.byteLength(html, 'utf8') > 64 * 1024 * 1024) {
    return { html: '', errors: [{ code: 'HTML_BUNDLE_TOO_LARGE', path: 'html', message: 'The self-contained HTML exceeds the 64 MiB render limit.' }], warnings };
  }
  return { html, errors, warnings };
}
