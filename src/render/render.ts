import type { Activity, Day, Place, Photo, ItineraryV2 } from '../contracts/types.js';
import type { ContractDiagnostic } from '../contracts/types.js';
import { getLocaleCatalog, type LocaleCatalog } from '../contracts/locale-catalogs.js';

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

export interface RenderAgency {
  name: string;
  contact: string;
  logoAssetId: string | null;
}

export interface RenderOptions {
  stylesheet: string;
  fontCss: string;
  catalog: LocaleCatalog;
  palette: RenderPalette;
  assets?: Record<string, RenderAsset>;
  agency: RenderAgency;
  generatedDate: string;
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

function isCompletePhotoCredit(credit: { photographer: string; url: string | null; source: string } | null | undefined): boolean {
  if (!credit || !credit.photographer.trim()) return false;
  const link = safeCreditUrl(credit.url);
  if (credit.url && !link) return false;
  if (/unsplash|pexels/i.test(credit.source) && !link) return false;
  return true;
}

function catalogCapabilityError(locale: string | null | undefined, catalog: LocaleCatalog | null): ContractDiagnostic | null {
  const unsupported = (message: string): ContractDiagnostic => ({ code: 'LOCALE_UNSUPPORTED', path: 'trip.language', message });
  if (!locale || !catalog) return unsupported('No matching self-contained label catalog is available for this locale.');
  const expected = getLocaleCatalog(locale);
  if (!expected || expected.locale !== catalog.locale) {
    return unsupported(`The supplied label catalog (${catalog.locale}) does not match the language and script required by ${locale}.`);
  }
  const keys = Object.keys(expected.labels);
  if (!keys.length || keys.some((key) => typeof catalog.labels?.[key] !== 'string' || !catalog.labels[key].trim())) {
    return { code: 'LOCALE_LABELS_INCOMPLETE', path: 'trip.language', message: `The label catalog for ${catalog.locale} is incomplete and cannot be rendered.` };
  }
  return null;
}

function hasUnsafeCss(css: string): boolean {
  if (/@import|<\/style/i.test(css)) return true;
  return [...css.matchAll(/url\(([^)]+)\)/gi)].some((match) => {
    const resource = match[1].trim().replace(/^['"]|['"]$/g, '');
    return !resource.startsWith('data:') && !resource.startsWith('#');
  });
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

function formatDuration(minutes: number | null, locale: string): string {
  if (!minutes) return '';
  const h = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' });
  const m = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' });
  const resolved = new Intl.Locale(h.resolvedOptions().locale).language.toLowerCase();
  const requested = new Intl.Locale(locale).language.toLowerCase();
  if (requested !== resolved) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return h.format(hours);
  return hours ? `${h.format(hours)} ${m.format(mins)}` : m.format(mins);
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

function assetErrors(content: ItineraryV2, options: RenderOptions): ContractDiagnostic[] {
  const ids = [options.agency.logoAssetId, content.cover?.assetId, ...content.days.flatMap((d) => d.photo?.assetId || []), ...content.places.flatMap((p) => p.photo?.assetId || [])].filter((id): id is string => Boolean(id));
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

function creditMarkup(credits: Array<{ photographer: string; url: string | null; source: string }>, catalog: { labels: Record<string, string> }): string {
  if (!credits.length) return '';
  const unique = [...new Map(credits.map((credit) => [`${credit.photographer}|${credit.url}|${credit.source}`, credit])).values()];
  return `<div class="credits mt-5 border-t pt-4 text-xs">${esc(label(catalog, 'photoCredits'))}: ${unique.map((credit) => {
    const href = safeCreditUrl(credit.url);
    const name = href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(credit.photographer)}</a>` : esc(credit.photographer);
    return `${name}${credit.source ? ` · ${esc(credit.source)}` : ''}`;
  }).join(' &nbsp;·&nbsp; ')}</div>`;
}

/** Category and difficulty words for the activity block (web-2.2.0). Unknown locales fall back to English. */
const ACTIVITY_WORDS: Record<string, { category: Record<string, string>; difficulty: Record<string, string> }> = {
  en: { category: { adventure: 'Adventure', water: 'Water', culture: 'Culture', wellness: 'Wellness', nature: 'Nature', family: 'Family' }, difficulty: { easy: 'Easy', moderate: 'Moderate', challenging: 'Challenging' } },
  id: { category: { adventure: 'Petualangan', water: 'Air', culture: 'Budaya', wellness: 'Wellness', nature: 'Alam', family: 'Keluarga' }, difficulty: { easy: 'Mudah', moderate: 'Sedang', challenging: 'Menantang' } }
};
function activityWord(table: 'category' | 'difficulty', key: string, locale: string): string {
  const words = ACTIVITY_WORDS[locale.split('-')[0]] ?? ACTIVITY_WORDS.en;
  return words[table][key] ?? key;
}

/** The activity mode body: facts, highlights and the steps of the activity. No day schedule. */
function renderActivityBlock(content: ItineraryV2, catalog: { labels: Record<string, string> }, locale: string): string {
  const activity = content.activity;
  if (!activity) return '';
  const facts: Array<[string, string]> = [];
  if (activity.category) facts.push([label(catalog, 'activityCategory'), activityWord('category', activity.category, locale)]);
  if (activity.durationMinutes !== null) facts.push([label(catalog, 'activityDuration'), formatDuration(activity.durationMinutes, locale)]);
  if (activity.sessionTimes.length) facts.push([label(catalog, 'activitySessionsLabel'), activity.sessionTimes.join(' · ')]);
  if (activity.difficulty) facts.push([label(catalog, 'activityLevelLabel'), activityWord('difficulty', activity.difficulty, locale)]);
  if (activity.ageMin !== null || activity.ageMax !== null) facts.push([label(catalog, 'activityAgeLabel'), `${activity.ageMin ?? ''}–${activity.ageMax ?? ''}`]);
  if (activity.weightMaxKg !== null) facts.push([label(catalog, 'activityWeightLabel'), `${activity.weightMaxKg} kg`]);
  if (activity.guideLanguages.length) facts.push([label(catalog, 'activityGuidesLabel'), activity.guideLanguages.join(', ')]);
  const factsHtml = facts.length ? `<dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${facts.map(([name, value]) => `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(name)}</dt><dd class="m-0">${esc(value)}</dd></div>`).join('')}</dl>` : '';
  const highlights = activity.highlights.length ? `<ul class="mt-4 list-disc space-y-1 pl-5">${activity.highlights.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  const steps = activity.steps.length ? `<h3 class="mt-6 font-semibold">${esc(label(catalog, 'activitySteps'))}</h3><ol class="mt-3 space-y-3">${activity.steps.map((step, index) => `<li><b>${index + 1}. ${esc(step.title)}</b>${step.minutes !== null ? ` · ${esc(formatDuration(step.minutes, locale))}` : ''}${step.note ? `<p class="m-0 text-slate-700">${esc(step.note)}</p>` : ''}</li>`).join('')}</ol>` : '';
  return `<section class="section" id="activity" data-section="activity" data-mode="activity"><h2 class="section-title">${esc(label(catalog, 'modeActivity'))}</h2>${factsHtml}${highlights}${steps}</section>`;
}

function renderActivity(activity: Activity, catalog: { labels: Record<string, string> }, locale: string): string {
  return `<article class="timeline-row break-inside-avoid pb-5" data-activity-id="${esc(activity.id)}"><div class="pt-1 text-right text-xs font-bold text-[var(--brand-primary)]">${esc(activity.time || '')}</div><div class="timeline-marker">${icon(activity.kind, activityTypeLabel(activity.kind, catalog))}</div><div class="min-w-0 border-b border-slate-200 pb-4"><div class="flex flex-wrap items-baseline gap-2"><h4 class="m-0 text-lg font-bold tracking-tight">${esc(activity.title)}</h4><span class="text-xs text-slate-500">${esc(activityTypeLabel(activity.kind, catalog))}</span>${activity.durationMinutes ? `<span class="text-xs text-slate-500">${esc(formatDuration(activity.durationMinutes, locale))}</span>` : ''}</div><p class="mt-2 text-sm leading-relaxed text-slate-700">${esc(activity.description)}</p>${activity.place ? `<p class="mt-2 text-xs font-medium text-slate-500">${esc(activity.place)}</p>` : ''}${activity.tip ? `<div class="local-tip mt-3 rounded-r-lg px-3 py-2 text-sm"><b>${esc(label(catalog, 'localTip'))}</b> · ${esc(activity.tip)}</div>` : ''}</div></article>`;
}

export function renderItineraryHtml(content: ItineraryV2, options: RenderOptions): RenderResult {
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  const catalog = options.catalog;
  const capabilityError = catalogCapabilityError(content.trip.language, catalog);
  if (capabilityError) return { html: '', errors: [capabilityError], warnings };
  const locale = content.trip.language!;

  errors.push(...assetErrors(content, options));
  if (!options.stylesheet.trim() || hasUnsafeCss(options.stylesheet)) errors.push({ code: 'RENDER_STYLES_INVALID', path: 'stylesheet', message: 'Renderer CSS must be non-empty, self-contained, and safe to inline.' });
  if (hasUnsafeCss(options.fontCss)) errors.push({ code: 'RENDER_FONTS_EXTERNAL', path: 'fontCss', message: 'Font CSS must not import or request external resources.' });

  const palette = options.palette;
  const primary = safeColor(palette?.primary, '#172B4D');
  const secondary = safeColor(palette?.secondary, '#0F766E');
  const accent = safeColor(palette?.accent, '#DFF4F0');
  const ink = safeColor(palette?.textDark, '#111827');

  const usedCredits: Array<{ photographer: string; url: string | null; source: string }> = [];
  const heroImage = content.cover ? resolvedImage(content.cover.assetId, options, 'cover.assetId', warnings) : null;
  if (heroImage && !isCompletePhotoCredit(content.cover?.credit)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: 'cover.credit', message: 'The hero image has no complete attribution.' });
  if (heroImage && isCompletePhotoCredit(content.cover?.credit)) usedCredits.push(content.cover!.credit!);
  const heroPhoto = heroImage ? `<img class="hero-image" src="${esc(heroImage)}" alt="${esc(label(catalog, 'heroPhoto'))}" />` : '';

  const logo = resolvedImage(options.agency.logoAssetId, options, 'profile.agencyLogoAssetId', warnings);
  const scopeLabel = `scope${content.trip.mode.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`;
  const scopeText = content.trip.mode === 'multi_day' ? label(catalog, scopeLabel).replace('{count}', String(content.days.length)) : label(catalog, scopeLabel);

  const summary = content.summary ? `<section class="section" id="summary" data-section="summary"><h2 class="section-title">${esc(label(catalog, 'tripOverview'))}</h2><p class="max-w-3xl text-base leading-relaxed text-slate-700">${esc(content.summary)}</p></section>` : '';

  // Route summary (full/multi only, ≥2 distinct stops)
  let routeStops: string[] = [];
  if (content.trip.mode === 'full_day' || content.trip.mode === 'multi_day') {
    if (content.trip.mode === 'full_day') {
      routeStops = content.days[0]?.activities.map((a) => a.place || a.title).filter(Boolean) || [];
    } else {
      routeStops = content.days.map((d) => d.location || d.title).filter(Boolean);
    }
    routeStops = [...new Map(routeStops.map((s) => [s, s])).keys()];
  }
  const route = routeStops.length >= 2 ? `<section class="section" id="route" data-section="route"><div class="mt-4 flex flex-wrap gap-2"><b>${esc(label(catalog, 'routeSummary'))}:</b>${routeStops.map((stop) => `<span class="rounded-full bg-slate-100 px-3 py-1 text-sm">${esc(stop)}</span>`).join('')}</div></section>` : '';

  // Schedule or guide
  let schedule = '';
  let guide = '';
  if (content.trip.mode === 'activity') {
    schedule = renderActivityBlock(content, catalog, locale);
  } else if (content.trip.mode !== 'destination_guide') {
    schedule = renderSchedule(content.days, content.trip.mode, content.trip.startDate, options, catalog, errors, warnings, usedCredits, locale);
  } else {
    guide = renderGuide(content.places, options, catalog, errors, warnings, usedCredits);
  }

  const practical = renderPractical(content, catalog);
  const policies = content.policies?.trim() ? `<section class="section" id="policies" data-section="policies"><h2 class="section-title">${esc(label(catalog, 'policies'))}</h2><p class="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-700">${esc(content.policies)}</p></section>` : '';
  const closingSection = `<footer class="closing p-6 sm:p-8" data-section="closing"><h2 class="m-0 text-2xl font-bold">${esc(label(catalog, 'closingHeading'))}</h2>${content.closingNote ? `<p class="mt-3">${esc(content.closingNote)}</p>` : ''}${options.agency.contact ? `<p class="font-semibold">${esc(options.agency.contact)}</p>` : ''}${content.disclaimer ? `<p class="text-sm text-white/80">${esc(content.disclaimer)}</p>` : ''}${creditMarkup(usedCredits, catalog)}<p class="text-xs text-white/60 mt-3">${esc(label(catalog, 'generatedDate'))}: ${esc(formatDate(options.generatedDate, locale))}</p></footer>`;

  if (errors.length) return { html: '', errors, warnings };

  const lang = esc(locale);
  const title = esc(content.trip.title || content.trip.destination);
  const cssVars = `--brand-primary:${primary};--brand-secondary:${secondary};--brand-accent:${accent};--brand-ink:${ink};`;
  const logoMarkup = logo ? `<img class="size-9 rounded-full bg-white object-contain p-1" src="${esc(logo)}" alt="${esc(label(catalog, 'agencyLogo'))}" />` : '';

  // Trip info strip
  const tripInfoItems: string[] = [];
  if (content.trip.mode !== 'destination_guide') {
    if (content.trip.startDate) {
      const endDate = new Date(new Date(`${content.trip.startDate}T00:00:00Z`).getTime() + (content.days.length - 1) * 86_400_000).toISOString().slice(0, 10);
      tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'startDate'))}</dt><dd class="m-0">${esc(formatDate(content.trip.startDate, locale))}</dd></div>`);
      if (content.trip.mode === 'multi_day') tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'endDate'))}</dt><dd class="m-0">${esc(formatDate(endDate, locale))}</dd></div>`);
    }
    if (content.trip.startTime || content.trip.endTime) {
      const timeText = content.trip.endTime ? `${content.trip.startTime}–${content.trip.endTime}` : content.trip.startTime || '';
      tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'startTime'))}</dt><dd class="m-0">${esc(timeText)}</dd></div>`);
    }
    if (content.meeting.place) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'meetingPoint'))}</dt><dd class="m-0">${esc(content.meeting.place)}</dd></div>`);
    const mapsHref = safeCreditUrl(content.meeting.mapsUrl);
    if (mapsHref) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'mapsLink'))}</dt><dd class="m-0"><a href="${esc(mapsHref)}" target="_blank" rel="noopener noreferrer">${esc(label(catalog, 'mapsLink'))}</a></dd></div>`);
    if (content.meeting.time) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'meetingTime'))}</dt><dd class="m-0">${esc(content.meeting.time)}</dd></div>`);
    if (content.meeting.note) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'meetingNote'))}</dt><dd class="m-0">${esc(content.meeting.note)}</dd></div>`);
    if (content.pickup.offered) {
      if (content.pickup.area) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'pickup'))}</dt><dd class="m-0">${esc(content.pickup.area)}</dd></div>`);
      if (content.pickup.time) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'pickupTime'))}</dt><dd class="m-0">${esc(content.pickup.time)}</dd></div>`);
      if (content.pickup.dropoffNote) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'dropoffNote'))}</dt><dd class="m-0">${esc(content.pickup.dropoffNote)}</dd></div>`);
    }
  }
  if (content.guide.name) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'guideName'))}</dt><dd class="m-0">${esc(content.guide.name)}</dd></div>`);
  if (content.guide.phone) tripInfoItems.push(`<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'guidePhone'))}</dt><dd class="m-0">${esc(content.guide.phone)}</dd></div>`);
  const tripInfoHtml = tripInfoItems.length ? `<section class="trip-info" data-section="trip-info"><dl class="grid grid-cols-1 gap-3 text-sm">${tripInfoItems.join('')}</dl></section>` : '';

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>${options.fontCss}\n${options.stylesheet}</style></head><body><main class="brochure" style="${cssVars}"><header class="hero" data-section="hero">${heroPhoto}<div class="hero-copy relative z-10"><div class="mb-5 flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-widest">${logoMarkup || options.agency.name ? `<span class="flex items-center gap-2">${logoMarkup}${esc(options.agency.name)}</span>` : '<span></span>'}<span class="rounded-full border border-white/50 px-3 py-1">${esc(scopeText)}</span></div><p class="mb-2 text-xs font-bold uppercase tracking-widest text-white/80">${esc(label(catalog, `mode${content.trip.mode.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`))}</p><h1 class="m-0 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">${title}</h1><p class="mb-0 mt-3 text-base text-white/90">${esc([content.trip.destination, content.trip.region, content.trip.country].filter(Boolean).join(' · '))}</p></div></header><div class="content">${tripInfoHtml}${summary}${route}${schedule}${guide}${practical}${policies}</div>${closingSection}</main></body></html>`;

  if (Buffer.byteLength(html, 'utf8') > 64 * 1024 * 1024) {
    return { html: '', errors: [{ code: 'HTML_BUNDLE_TOO_LARGE', path: 'html', message: 'The self-contained HTML exceeds the 64 MiB render limit.' }], warnings };
  }
  return { html, errors, warnings };
}

function dayDate(startDate: string | null, offset: number): string | null {
  if (!startDate) return null;
  const time = new Date(`${startDate}T00:00:00Z`).getTime();
  return Number.isNaN(time) ? null : new Date(time + offset * 86_400_000).toISOString().slice(0, 10);
}

function renderSchedule(days: Day[], mode: string, startDate: string | null, options: RenderOptions, catalog: { labels: Record<string, string> }, errors: ContractDiagnostic[], warnings: ContractDiagnostic[], usedCredits: Array<{ photographer: string; url: string | null; source: string }>, locale: string): string {
  if (!days.length) return '';
  const isMulti = mode === 'multi_day';
  const showMeals = mode !== 'half_day';
  return `<section class="section" id="schedule" data-section="schedule"><h2 class="section-title">${esc(label(catalog, 'itinerary'))}</h2>${isMulti ? `<nav class="day-index mb-6 flex gap-2 overflow-x-auto" aria-label="${esc(label(catalog, 'itinerary'))}">${days.map((day) => `<span class="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">${esc(label(catalog, 'dayLabel'))} ${day.dayNumber}</span>`).join('')}</nav>` : ''}${days.map((day, index) => {
    const image = day.photo ? resolvedImage(day.photo.assetId, options, `days[${index}].photo.assetId`, warnings) : null;
    if (image && !isCompletePhotoCredit(day.photo?.credit)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `days[${index}].photo.credit`, message: 'The day photo has no complete attribution.' });
    if (image && isCompletePhotoCredit(day.photo?.credit)) usedCredits.push(day.photo!.credit!);
    const photo = image ? `<img class="mb-4 aspect-[16/7] w-full rounded-xl object-cover" src="${esc(image)}" alt="${esc(label(catalog, 'regionPhoto'))}" />` : '';
    const mealsLine = showMeals && day.meals && (day.meals.breakfast || day.meals.lunch || day.meals.dinner) ? `<p class="mt-2 text-sm"><b>${esc(label(catalog, 'meals'))}:</b> ${[day.meals.breakfast && label(catalog, 'breakfast'), day.meals.lunch && label(catalog, 'lunch'), day.meals.dinner && label(catalog, 'dinner')].filter(Boolean).join(' · ')}</p>` : '';
    const hotelName = day.hotel?.name?.trim() || '';
    const hotelDetail = [day.hotel?.area?.trim(), day.hotel?.note?.trim()].filter(Boolean).join(' · ');
    const hotelMarkup = isMulti && (hotelName || hotelDetail) ? `<div class="my-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><b>${esc(label(catalog, 'hotel'))}</b>${hotelName ? `: ${esc(hotelName)}` : ''}${hotelDetail ? `<p class="mb-0 mt-1 text-sm">${esc(hotelDetail)}</p>` : ''}</div>` : '';
    const date = isMulti ? dayDate(startDate, index) : null;
    const transferLine = isMulti && day.transferNote ?`<p class="text-sm"><b>${esc(label(catalog, 'transferNote'))}:</b> ${esc(day.transferNote)}</p>` : '';
    return `<section class="${isMulti ? 'mb-8 border-t border-slate-200 pt-5' : ''}" data-day-id="${esc(day.id)}">${isMulti ? `<header class="mb-4"><p class="m-0 text-xs font-bold uppercase tracking-wider text-[var(--brand-primary)]">${esc(label(catalog, 'dayLabel'))} ${day.dayNumber}${date ? ` · ${esc(formatDate(date, locale))}` : ''}</p>${day.title ? `<h3 class="mb-1 mt-1 text-xl font-bold">${esc(day.title)}</h3>` : ''}${day.location ? `<p class="m-0 text-sm text-slate-500">${esc(day.location)}</p>` : ''}</header>` : `<header class="mb-4">${day.title ? `<h3 class="m-0 text-lg font-bold">${esc(day.title)}</h3>` : ''}${day.location ? `<p class="m-0 text-sm text-slate-500">${esc(day.location)}</p>` : ''}</header>`}${photo}<div class="timeline">${day.activities.map((activity) => renderActivity(activity, catalog, locale)).join('')}</div>${mealsLine}${hotelMarkup}${transferLine}</section>`;
  }).join('')}</section>`;
}

function renderGuide(places: Place[], options: RenderOptions, catalog: { labels: Record<string, string> }, errors: ContractDiagnostic[], warnings: ContractDiagnostic[], usedCredits: Array<{ photographer: string; url: string | null; source: string }>): string {
  if (!places.length) return '';
  const runs: Array<{ group: string; entries: Array<{ place: Place; index: number }> }> = [];
  places.forEach((place, sourceIndex) => {
    const group = place.group || '';
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.entries.push({ place, index: sourceIndex });
    else runs.push({ group, entries: [{ place, index: sourceIndex }] });
  });
  const sections = runs.map((run) => `<section class="guide-group mb-8">${run.group ? `<h3 class="guide-group-title mb-2 text-xl font-bold">${esc(run.group)}</h3>` : ''}<div class="guide-grid grid grid-cols-1 gap-5">${run.entries.map(({ place, index }) => {
    const image = place.photo ? resolvedImage(place.photo.assetId, options, `places[${index}].photo.assetId`, warnings) : null;
    if (image && !isCompletePhotoCredit(place.photo?.credit)) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `places[${index}].photo.credit`, message: 'The place photo has no complete attribution.' });
    if (image && isCompletePhotoCredit(place.photo?.credit)) usedCredits.push(place.photo!.credit!);
    const photo = image ? `<img class="mb-4 aspect-[16/9] w-full rounded-lg object-cover" src="${esc(image)}" alt="${esc(label(catalog, 'regionPhoto'))}" />` : '';
    const optionalFields = [place.suggestedDuration, place.bestTime, place.gettingThere, place.nearby].filter(Boolean);
    return `<article class="spot-card break-inside-avoid border-t border-slate-200 p-4" data-place-id="${esc(place.id)}"><p class="m-0 text-xs font-bold uppercase tracking-wider text-[var(--brand-primary)]">${String(index + 1).padStart(2, '0')}</p>${photo}<h4 class="mb-1 mt-2 text-lg font-bold">${esc(place.name)}</h4><p class="m-0 text-xs font-semibold text-slate-500">${esc(place.area)}</p><p class="my-3 text-sm leading-relaxed text-slate-700">${esc(place.description)}</p>${optionalFields.length ? `<dl class="grid grid-cols-1 gap-3 text-sm">${place.suggestedDuration ? `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'suggestedDuration'))}</dt><dd class="m-0">${esc(place.suggestedDuration)}</dd></div>` : ''}${place.bestTime ? `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'bestTime'))}</dt><dd class="m-0">${esc(place.bestTime)}</dd></div>` : ''}${place.gettingThere ? `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'gettingThere'))}</dt><dd class="m-0">${esc(place.gettingThere)}</dd></div>` : ''}${place.nearby ? `<div><dt class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label(catalog, 'nearby'))}</dt><dd class="m-0">${esc(place.nearby)}</dd></div>` : ''}</dl>` : ''}${place.tips.length ? `<div class="local-tip mt-4 rounded-r-lg px-3 py-2 text-sm"><b>${esc(label(catalog, 'localTip'))}</b> · ${place.tips.map(esc).join(' · ')}</div>` : ''}</article>`;
  }).join('')}</div></section>`).join('');
  return `<section class="section" id="guide" data-section="guide"><h2 class="section-title">${esc(label(catalog, 'exploreDestinations'))}</h2>${sections}</section>`;
}

function renderPractical(content: ItineraryV2, catalog: { labels: Record<string, string> }): string {
  const groups: Array<[string, string[]]> = [
    ['included', content.included], ['notIncluded', content.notIncluded],
    ['whatToBring', content.whatToBring], ['notSuitableFor', content.notSuitableFor], ['notAllowed', content.notAllowed],
    ...content.localTips.length ? [['localTip', content.localTips]] : [],
    ...content.emergencyContacts.length ? [['emergencyContact', content.emergencyContacts.map((c) => `${c.label}: ${c.value}`)]] : []
  ].filter(([, values]) => values.length) as Array<[string, string[]]>;
  if (!groups.length) return '';
  return `<section class="section" id="practical" data-section="practical"><h2 class="section-title">${esc(label(catalog, 'practicalInfo'))}</h2><div class="practical-grid grid grid-cols-1 gap-4">${groups.map(([key, values]) => `<article class="practical-card rounded-xl border border-slate-200 p-4"><h3 class="mb-2 mt-0 text-base font-bold">${esc(label(catalog, key))}</h3><ul class="m-0 list-disc space-y-1 pl-5 text-sm text-slate-700">${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></article>`).join('')}</div></section>`;
}
