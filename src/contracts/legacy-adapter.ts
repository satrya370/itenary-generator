import { createHash } from 'node:crypto';
import type { ContractDiagnostic } from './types.js';

const WEB_SCHEMA_VERSION = 'web-1.0.0';
const MODES = new Set(['half_day', 'full_day', 'multi_day', 'destination_guide']);
const ACTIVITY_TYPES = new Set(['transport', 'sightseeing', 'food', 'activity', 'rest', 'accommodation', 'free']);
const DESTINATION_TYPES = new Set(['beach', 'mountain', 'city', 'cultural', 'nature', 'desert', 'mixed']);
const PACES: Record<string, string> = { relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Packed' };
type AnyRecord = Record<string, any>;

const isRecord = (value: unknown): value is AnyRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const nullableText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function stableId(fingerprint: string, path: string): string {
  const bytes = createHash('sha256').update(`${fingerprint}:${path}`).digest('hex').slice(0, 32).split('');
  bytes[12] = '5';
  bytes[16] = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function attribution(value: unknown): AnyRecord | null {
  if (!isRecord(value)) return null;
  const photographer = text(value.photographer);
  const photographerUrl = nullableText(value.photographerUrl);
  const source = text(value.source);
  return photographer || photographerUrl || source ? { photographer, photographerUrl, source } : null;
}

function recordUnmappedPhoto(value: unknown, path: string, diagnostics: ContractDiagnostic[]) {
  if (typeof value === 'string' && value.trim()) {
    diagnostics.push({ code: 'LEGACY_REMOTE_ASSET_NOT_IMPORTED', path, message: 'Legacy URL was not fetched. Import the image through the workspace asset flow before using it.' });
  }
}

function parseDayRange(block: AnyRecord, fallback: number): [number, number] {
  const explicitStart = Number(block.dayStart ?? block.blockNumber);
  const label = [block.blockRangeLabel, block.blockLabel, block.dayLabel, block.day].filter((value) => typeof value === 'string').join(' ');
  const range = label.match(/(?:hari|day)?\s*(\d+)\s*[-–—]\s*(\d+)/i);
  const single = label.match(/(?:hari|day)\s*(\d+)/i);
  const start = Number.isInteger(explicitStart) && explicitStart > 0 ? explicitStart : range ? Number(range[1]) : single ? Number(single[1]) : fallback;
  const end = Number(block.dayEnd) || (range ? Number(range[2]) : start);
  return [start, end];
}

function mapAccommodation(value: unknown, areaFallback: string, diagnostics: ContractDiagnostic[], path: string) {
  if (!value) return null;
  if (typeof value === 'string') return { name: null, area: areaFallback, note: value };
  if (Array.isArray(value)) {
    const notes = value.map((entry) => typeof entry === 'string' ? entry : isRecord(entry) ? text(entry.note || entry.description) : '').filter(Boolean);
    diagnostics.push({ code: 'LEGACY_ACCOMMODATION_LIST_JOINED', path, message: 'Multiple legacy accommodation notes were combined into one note; inspect the conversion report.' });
    return { name: null, area: areaFallback, note: notes.join('\n') };
  }
  if (!isRecord(value)) return null;
  return { name: nullableText(value.name), area: text(value.area, areaFallback), note: text(value.note || value.description) };
}

function normalizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => typeof entry === 'string' ? entry : isRecord(entry) ? text(entry.note || entry.label || entry.value || entry.name) : '').filter(Boolean);
}

function reportUnmappedKeys(value: unknown, path: string, allowedKeys: string[], diagnostics: ContractDiagnostic[]) {
  if (!isRecord(value)) return;
  const allowed = new Set(allowedKeys);
  const count = Object.keys(value).filter((key) => !allowed.has(key)).length;
  if (count) diagnostics.push({ code: 'LEGACY_UNMAPPED_FIELDS', path, message: `${count} unrecognized field(s) in this section were excluded; inspect the migration report before discarding the source.` });
}

function inspectLegacySections(source: AnyRecord, diagnostics: ContractDiagnostic[]) {
  const rootKeys = ['canonicalItinerary', 'schemaVersion', 'brochure', 'hero', 'overview', 'schedule', 'spots', 'practical', 'closing', 'agencyName', 'agencyContact', 'agencyLogoUrl', 'agencyLogoAssetId', 'tripTitle', 'destination', 'region', 'country', 'itineraryMode', 'durationDays', 'scopeLabel', 'startDate', 'endDate', 'travelerCount', 'travelerType', 'pace', 'paceLevel', 'themes', 'destinationType', 'generatedDate', 'outputLanguage', 'palette', 'paletteKey', 'sectionVisibility', 'finalCopy', 'finalCopyOk', 'finalCopyFailureReason', 'verifiedVenueSet', 'verificationQueries', 'verificationQueryCount', 'unverifiedVenueCount', 'highRiskVenues', 'verificationReconciled', 'routePlan', 'routePlanOrdered', 'routePlanProvided', 'routePlanBlockCount', 'brief', 'cpStage', 'limitsApplied', 'recipientEmail', 'requestBody', 'executionId', 'id', 'workspaceId', 'revision', 'modeConflictIgnored'];
  reportUnmappedKeys(source, '$canonical', rootKeys, diagnostics);
  if (source.brochure) reportUnmappedKeys(source.brochure, 'brochure', ['agencyName', 'agencyContact', 'agencyLogoUrl', 'agencyLogoAssetId', 'tripTitle', 'destination', 'region', 'country', 'itineraryMode', 'durationDays', 'scopeLabel', 'startDate', 'endDate', 'travelerCount', 'travelerType', 'pace', 'paceLevel', 'themes', 'destinationType', 'generatedDate', 'outputLanguage'], diagnostics);
  if (source.hero) reportUnmappedKeys(source.hero, 'hero', ['assetId', 'photoUrl', 'photoAttribution', 'gradientOnly'], diagnostics);
  if (isRecord(source.overview)) {
    reportUnmappedKeys(source.overview, 'overview', ['summary', 'quickFacts', 'routeSummary', 'highlights'], diagnostics);
    if (source.overview.quickFacts) reportUnmappedKeys(source.overview.quickFacts, 'overview.quickFacts', ['scope', 'bestSeason', 'pace', 'themes'], diagnostics);
    if (Array.isArray(source.overview.routeSummary)) source.overview.routeSummary.forEach((entry: unknown, index: number) => reportUnmappedKeys(entry, `overview.routeSummary[${index}]`, ['day', 'title', 'note', 'label', 'value'], diagnostics));
    if (Array.isArray(source.overview.highlights)) source.overview.highlights.forEach((entry: unknown, index: number) => reportUnmappedKeys(entry, `overview.highlights[${index}]`, ['icon', 'title', 'note'], diagnostics));
  }
  (Array.isArray(source.schedule) ? source.schedule : []).forEach((rawBlock: unknown, index: number) => {
    if (!isRecord(rawBlock)) return;
    reportUnmappedKeys(rawBlock, `schedule[${index}]`, ['id', 'blockNumber', 'blockLabel', 'blockRangeLabel', 'day', 'dayLabel', 'dayStart', 'dayEnd', 'date', 'title', 'location', 'area', 'summary', 'isCondensed', 'assetId', 'photoUrl', 'photoAttribution', 'activities', 'accommodation', 'mealsIncluded', 'transportNote', 'blockTip'], diagnostics);
    if (Array.isArray(rawBlock.activities)) rawBlock.activities.forEach((activity: unknown, activityIndex: number) => reportUnmappedKeys(activity, `schedule[${index}].activities[${activityIndex}]`, ['id', 'timeLabel', 'time', 'type', 'title', 'name', 'description', 'durationLabel', 'duration', 'area', 'category', 'tip'], diagnostics));
    if (rawBlock.accommodation && !Array.isArray(rawBlock.accommodation)) reportUnmappedKeys(rawBlock.accommodation, `schedule[${index}].accommodation`, ['name', 'area', 'note', 'description', 'tip'], diagnostics);
  });
  (Array.isArray(source.spots) ? source.spots : []).forEach((spot: unknown, index: number) => {
    if (!isRecord(spot)) return;
    reportUnmappedKeys(spot, `spots[${index}]`, ['id', 'groupLabel', 'name', 'area', 'category', 'description', 'suggestedDuration', 'bestTimeToVisit', 'gettingThere', 'tips', 'nearbyPairing', 'assetId', 'photoUrl', 'photoAttribution'], diagnostics);
    if (Array.isArray(spot.tips)) spot.tips.forEach((tip: unknown, tipIndex: number) => reportUnmappedKeys(tip, `spots[${index}].tips[${tipIndex}]`, ['note', 'label', 'value'], diagnostics));
  });
  if (source.practical) {
    reportUnmappedKeys(source.practical, 'practical', ['included', 'notIncluded', 'whatToBring', 'localTips', 'healthSafety', 'emergencyContacts'], diagnostics);
    for (const field of ['included', 'notIncluded', 'whatToBring', 'healthSafety']) {
      if (Array.isArray(source.practical[field])) source.practical[field].forEach((entry: unknown, index: number) => reportUnmappedKeys(entry, `practical.${field}[${index}]`, ['note', 'label', 'value', 'name'], diagnostics));
    }
    if (Array.isArray(source.practical.localTips)) source.practical.localTips.forEach((tip: unknown, index: number) => reportUnmappedKeys(tip, `practical.localTips[${index}]`, ['topic', 'note', 'label', 'value'], diagnostics));
    if (Array.isArray(source.practical.emergencyContacts)) source.practical.emergencyContacts.forEach((contact: unknown, index: number) => reportUnmappedKeys(contact, `practical.emergencyContacts[${index}]`, ['label', 'name', 'value', 'phone', 'contact'], diagnostics));
  }
  if (source.closing) {
    reportUnmappedKeys(source.closing, 'closing', ['closingNote', 'agencyContact', 'disclaimer', 'photoCredits'], diagnostics);
    if (Array.isArray(source.closing.photoCredits)) source.closing.photoCredits.forEach((credit: unknown, index: number) => reportUnmappedKeys(credit, `closing.photoCredits[${index}]`, ['photographer', 'photographerUrl', 'source'], diagnostics));
  }
}

function mapActivity(value: unknown, path: string, fingerprint: string, diagnostics: ContractDiagnostic[]) {
  const activity = isRecord(value) ? value : {};
  let type = text(activity.type, 'activity');
  if (!ACTIVITY_TYPES.has(type)) {
    diagnostics.push({ code: 'LEGACY_ACTIVITY_TYPE_DEFAULTED', path: `${path}.type`, message: 'Unknown legacy activity type was mapped to the generic activity type.' });
    type = 'activity';
  }
  return {
    id: isUuid(activity.id) ? activity.id : stableId(fingerprint, path),
    timeLabel: text(activity.timeLabel || activity.time),
    type,
    title: text(activity.title || activity.name),
    description: text(activity.description),
    durationLabel: nullableText(activity.durationLabel || activity.duration),
    area: nullableText(activity.area),
    category: nullableText(activity.category),
    tip: nullableText(activity.tip)
  };
}

function mapBlock(value: unknown, index: number, fingerprint: string, diagnostics: ContractDiagnostic[]) {
  const block = isRecord(value) ? value : {};
  const [dayStart, dayEnd] = parseDayRange(block, index + 1);
  recordUnmappedPhoto(block.photoUrl, `schedule[${index}].photoUrl`, diagnostics);
  const activities = Array.isArray(block.activities) ? block.activities : [];
  return {
    id: isUuid(block.id) ? block.id : stableId(fingerprint, `schedule[${index}]`),
    dayStart,
    dayEnd,
    date: nullableText(block.date),
    title: text(block.title),
    location: text(block.location || block.area),
    isCondensed: Boolean(block.isCondensed || dayEnd > dayStart),
    assetId: nullableText(block.assetId),
    photoAttribution: attribution(block.photoAttribution),
    activities: activities.map((activity: unknown, activityIndex: number) => mapActivity(activity, `schedule[${index}].activities[${activityIndex}]`, fingerprint, diagnostics)),
    accommodation: mapAccommodation(block.accommodation, text(block.location), diagnostics, `schedule[${index}].accommodation`),
    mealsIncluded: normalizeList(block.mealsIncluded),
    transportNote: nullableText(block.transportNote),
    blockTip: nullableText(block.blockTip)
  };
}

function mapSpot(value: unknown, index: number, fingerprint: string, diagnostics: ContractDiagnostic[]) {
  const spot = isRecord(value) ? value : {};
  recordUnmappedPhoto(spot.photoUrl, `spots[${index}].photoUrl`, diagnostics);
  return {
    id: isUuid(spot.id) ? spot.id : stableId(fingerprint, `spots[${index}]`),
    groupLabel: nullableText(spot.groupLabel),
    name: text(spot.name),
    area: text(spot.area),
    category: text(spot.category),
    description: text(spot.description),
    suggestedDuration: text(spot.suggestedDuration),
    bestTimeToVisit: text(spot.bestTimeToVisit),
    gettingThere: text(spot.gettingThere),
    tips: normalizeList(spot.tips),
    nearbyPairing: nullableText(spot.nearbyPairing),
    assetId: nullableText(spot.assetId),
    photoAttribution: attribution(spot.photoAttribution)
  };
}

function mapRouteSummary(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : isRecord(entry) ? [entry.day, entry.title, entry.note, entry.label, entry.value].filter(Boolean).map(String).join(' · ') : '').filter(Boolean);
  return typeof value === 'string' ? value.split(/(?<=[.!?])\s+|\r?\n/).map((entry) => entry.trim()).filter(Boolean) : [];
}

export function adaptLegacyDocument(input: unknown) {
  const diagnostics: ContractDiagnostic[] = [];
  const wrapper = isRecord(input) ? input : {};
  const source = isRecord(wrapper.canonicalItinerary) ? wrapper.canonicalItinerary : wrapper;
  inspectLegacySections(source, diagnostics);
  const brochure = isRecord(source.brochure) ? source.brochure : source;
  const hero = isRecord(source.hero) ? source.hero : {};
  const overview = isRecord(source.overview) ? source.overview : {};
  const quick = isRecord(overview.quickFacts) ? overview.quickFacts : {};
  const practical = isRecord(source.practical) ? source.practical : {};
  const closing = isRecord(source.closing) ? source.closing : {};
  const rawMode = text(brochure.itineraryMode || source.itineraryMode);
  const itineraryMode = MODES.has(rawMode) ? rawMode : 'full_day';
  if (rawMode && itineraryMode !== rawMode) diagnostics.push({ code: 'LEGACY_MODE_DEFAULTED', path: 'brochure.itineraryMode', message: 'Unknown legacy mode was mapped to full_day; review before publishing.' });
  const paceRaw = text(brochure.paceLevel || source.paceLevel || source.pace, 'Balanced').toLowerCase();
  const paceLevel = PACES[paceRaw] || 'Balanced';
  if (!PACES[paceRaw]) diagnostics.push({ code: 'LEGACY_PACE_DEFAULTED', path: 'brochure.paceLevel', message: 'Unknown legacy pace was mapped to Balanced.' });
  const destinationType = text(brochure.destinationType || source.destinationType, 'mixed');
  const safeDestinationType = DESTINATION_TYPES.has(destinationType) ? destinationType : 'mixed';
  if (safeDestinationType !== destinationType) diagnostics.push({ code: 'LEGACY_DESTINATION_TYPE_DEFAULTED', path: 'brochure.destinationType', message: 'Unknown legacy destination type was mapped to mixed.' });
  const rawHeroAsset = hero.assetId;
  recordUnmappedPhoto(hero.photoUrl, 'hero.photoUrl', diagnostics);
  recordUnmappedPhoto(brochure.agencyLogoUrl || source.agencyLogoUrl, 'brochure.agencyLogoUrl', diagnostics);
  const fingerprint = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const scheduleInput = Array.isArray(source.schedule) ? source.schedule : [];
  const spotsInput = Array.isArray(source.spots) ? source.spots : [];
  const finalCopy = isRecord(source.finalCopy) ? source.finalCopy : {};
  const outputLanguage = nullableText(brochure.outputLanguage || source.outputLanguage);
  const rawDurationDays = Number.isInteger(brochure.durationDays ?? source.durationDays) ? (brochure.durationDays ?? source.durationDays) : null;
  const durationDays = itineraryMode === 'multi_day' ? rawDurationDays : null;
  if (itineraryMode !== 'multi_day' && rawDurationDays !== null) diagnostics.push({ code: 'LEGACY_DURATION_IGNORED', path: 'brochure.durationDays', message: 'Duration days are derived only for multi-day itineraries and were cleared for this mode.' });
  if (!outputLanguage) diagnostics.push({ code: 'LEGACY_LANGUAGE_UNRESOLVED', path: 'brochure.outputLanguage', message: 'The legacy document has no resolved output language; choose one before publishing.' });

  const authoritativeContact = text(brochure.agencyContact || source.agencyContact);
  const legacyClosingContact = text(closing.agencyContact);
  if (authoritativeContact && legacyClosingContact && authoritativeContact !== legacyClosingContact) {
    diagnostics.push({ code: 'LEGACY_CONTACT_CONFLICT', path: 'closing.agencyContact', message: 'The legacy closing contact differs from the authoritative agency contact; normalization derives the closing contact from brochure.agencyContact.' });
  }
  const authoritativeThemes = normalizeList(brochure.themes || source.themes);
  const legacyQuickThemes = normalizeList(quick.themes);
  if (authoritativeThemes.length && legacyQuickThemes.length && JSON.stringify(authoritativeThemes) !== JSON.stringify(legacyQuickThemes)) {
    diagnostics.push({ code: 'LEGACY_THEME_CONFLICT', path: 'overview.quickFacts.themes', message: 'Legacy quick-fact themes differ from the authoritative brochure themes; normalization derives quick facts from brochure.themes.' });
  }

  const content = {
    schemaVersion: WEB_SCHEMA_VERSION,
    brochure: {
      agencyName: text(brochure.agencyName || source.agencyName),
      agencyContact: text(brochure.agencyContact || source.agencyContact || closing.agencyContact),
      agencyLogoAssetId: nullableText(brochure.agencyLogoAssetId),
      tripTitle: text(brochure.tripTitle || source.tripTitle),
      destination: text(brochure.destination || source.destination),
      region: nullableText(brochure.region || source.region),
      country: text(brochure.country || source.country),
      itineraryMode,
      durationDays,
      scopeLabel: text(brochure.scopeLabel || source.scopeLabel),
      startDate: nullableText(brochure.startDate || source.startDate),
      endDate: nullableText(brochure.endDate || source.endDate),
      travelerCount: Number.isInteger(brochure.travelerCount ?? source.travelerCount) ? (brochure.travelerCount ?? source.travelerCount) : null,
      travelerType: nullableText(brochure.travelerType || source.travelerType),
      paceLevel,
      themes: normalizeList(brochure.themes || source.themes),
      destinationType: safeDestinationType,
      generatedDate: nullableText(brochure.generatedDate || source.generatedDate),
      outputLanguage
    },
    hero: {
      assetId: nullableText(rawHeroAsset),
      photoAttribution: attribution(hero.photoAttribution),
      gradientOnly: rawHeroAsset ? Boolean(hero.gradientOnly) : true
    },
    overview: {
      summary: text(overview.summary || finalCopy.overview?.summary),
      quickFacts: {
        scope: text(quick.scope || brochure.scopeLabel || source.scopeLabel),
        bestSeason: text(quick.bestSeason),
        pace: text(quick.pace || paceLevel),
        themes: normalizeList(quick.themes || brochure.themes || source.themes)
      },
      routeSummary: mapRouteSummary(overview.routeSummary),
      highlights: Array.isArray(overview.highlights) ? overview.highlights.map((entry: unknown) => {
        const highlight = isRecord(entry) ? entry : {};
        return { icon: text(highlight.icon, 'activity'), title: text(highlight.title), note: text(highlight.note) };
      }) : []
    },
    schedule: scheduleInput.map((block: unknown, index: number) => mapBlock(block, index, fingerprint, diagnostics)),
    spots: spotsInput.map((spot: unknown, index: number) => mapSpot(spot, index, fingerprint, diagnostics)),
    practical: {
      included: normalizeList(practical.included),
      notIncluded: normalizeList(practical.notIncluded),
      whatToBring: normalizeList(practical.whatToBring),
      localTips: Array.isArray(practical.localTips) ? practical.localTips.map((entry: unknown) => isRecord(entry) ? { topic: text(entry.topic), note: text(entry.note) } : { topic: '', note: text(entry) }) : [],
      healthSafety: normalizeList(practical.healthSafety),
      emergencyContacts: Array.isArray(practical.emergencyContacts) ? practical.emergencyContacts.map((entry: unknown) => isRecord(entry) ? { label: text(entry.label || entry.name), value: text(entry.value || entry.phone || entry.contact) } : { label: '', value: text(entry) }) : []
    },
    closing: {
      closingNote: text(closing.closingNote || finalCopy.closing?.closingNote),
      agencyContact: text(closing.agencyContact || brochure.agencyContact || source.agencyContact),
      disclaimer: text(closing.disclaimer || finalCopy.closing?.disclaimer),
      photoCredits: Array.isArray(closing.photoCredits) ? closing.photoCredits.map(attribution).filter(Boolean) : []
    }
  };

  const knownWrapperKeys = new Set(['recipientEmail', 'verifiedVenueSet', 'verificationQueries', 'highRiskVenues', 'requestBody', 'executionId', 'id', 'workspaceId', 'revision', 'routePlan', 'routePlanOrdered', 'routePlanProvided', 'routePlanBlockCount', 'brief', 'cpStage', 'limitsApplied', 'paletteKey', 'modeConflictIgnored']);
  const privateWrapperFields = [
    ...Object.keys(wrapper).filter((key) => knownWrapperKeys.has(key)).map((key) => `$wrapper.${key}`),
    ...Object.keys(source).filter((key) => knownWrapperKeys.has(key) && key !== 'canonicalItinerary').map((key) => `$canonical.${key}`)
  ];
  if (privateWrapperFields.length) diagnostics.push({ code: 'LEGACY_PRIVATE_METADATA_EXCLUDED', path: '$wrapper', message: `${privateWrapperFields.length} execution/account metadata field(s) were excluded from brochure content.` });
  if (closing.photoCredits?.some?.((credit: unknown) => !credit)) diagnostics.push({ code: 'LEGACY_PHOTO_CREDIT_INCOMPLETE', path: 'closing.photoCredits', message: 'One or more legacy photo credits were incomplete and need review.' });

  return { content, diagnostics };
}
