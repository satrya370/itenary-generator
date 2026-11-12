import { randomUUID } from 'node:crypto';
import practical from '../../../config/web/practical-options.json' with { type: 'json' };
import type { Activity, Day, ItineraryMode, WebItineraryContent } from '../../contracts/types.js';
import { validateForPublish } from '../../contracts/validator.js';
import { blankDay } from '../draft.js';
import type { ParseResult, ListSection } from './parse/extract.js';
import { matchGuide, matchOption } from './normalize.js';
import type { Completion } from './complete.js';

/** Turns the parse result plus accepted AI values into canonical content. One function serves new drafts (start blank)
 * and overwrite (start from the saved draft): whatever the document does not provide keeps its current value. */

export interface Guide { id: string; name: string; phone: string }
export interface MergeInput {
  mode: ItineraryMode; parse: ParseResult; completion: Completion; guides: Guide[]; locale: string | null;
}
export interface MergeOutput { content: WebItineraryContent; filled: string[] }

const OPTION_LOCALES = new Set(['id', 'en']);
function optionsFor(locale: string | null, list: ListSection | 'policies'): string[] {
  if (!locale || !OPTION_LOCALES.has(locale)) return [];
  const locales = practical.locales as Record<string, Record<string, string[]>>;
  return locales[locale]?.[list] ?? [];
}

function freshPlace(place: NonNullable<Completion['places']>[number]) {
  return { id: randomUUID(), group: null, name: place.name.value, area: place.area?.value ?? '', description: place.description?.value ?? '', tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null, photo: null };
}

export function mergeContent(saved: WebItineraryContent, input: MergeInput): MergeOutput {
  const content = structuredClone(saved);
  const filled: string[] = [];
  const { parse, completion, mode } = input;
  const set = (path: string, apply: () => void) => { apply(); filled.push(path); };

  if (parse.fields.trip.title) set('trip.title', () => { content.trip.title = parse.fields.trip.title!; });
  if (parse.fields.trip.destination) set('trip.destination', () => { content.trip.destination = parse.fields.trip.destination!; });
  if (parse.fields.trip.country) set('trip.country', () => { content.trip.country = parse.fields.trip.country!; });
  if (parse.fields.trip.startDate) set('trip.startDate', () => { content.trip.startDate = parse.fields.trip.startDate!; });
  if (input.locale) set('trip.language', () => { content.trip.language = input.locale; });

  if (parse.fields.guide.name || parse.fields.guide.phone) {
    const matched = matchGuide(parse.fields.guide.name ?? null, parse.fields.guide.phone ?? null, input.guides);
    set('guide', () => {
      content.guide = matched
        ? { name: matched.name, phone: matched.phone }
        : { name: parse.fields.guide.name ?? content.guide.name, phone: parse.fields.guide.phone ?? content.guide.phone };
    });
  }

  const meeting = parse.fields.meeting;
  if (meeting.place) set('meeting.place', () => { content.meeting.place = meeting.place!; });
  if (meeting.time) set('meeting.time', () => { content.meeting.time = meeting.time!; });
  if (meeting.mapsUrl) set('meeting.mapsUrl', () => { content.meeting.mapsUrl = meeting.mapsUrl!; });

  for (const list of ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips'] as const) {
    const items = parse.fields.lists[list];
    if (items?.length) set(list, () => { content[list] = items.map((item) => matchOption(item, optionsFor(input.locale, list))); });
  }

  if (parse.fields.emergencyContacts.length) set('emergencyContacts', () => { content.emergencyContacts = parse.fields.emergencyContacts.map((c) => ({ label: c.label, value: c.value })); });

  if (parse.fields.days.length) {
    set('days', () => {
      content.days = parse.fields.days.map((day) => {
        const previous = saved.days.find((item) => item.dayNumber === day.dayNumber);
        const base: Day = blankDay(mode, day.dayNumber);
        return {
          ...base,
          id: randomUUID(),
          title: day.title ?? '',
          photo: previous?.photo ?? null,
          hotel: previous?.hotel ?? null,
          meals: previous?.meals ?? base.meals,
          transferNote: previous?.transferNote ?? null,
          activities: day.activities.map((activity): Activity => ({ id: randomUUID(), time: activity.time, durationMinutes: activity.durationMinutes, kind: activity.kind, title: activity.title, place: null, description: '', tip: null }))
        };
      });
    });
  }

  if (completion.summary) set('summary', () => { content.summary = completion.summary!.value; });
  if (completion.closingNote) set('closingNote', () => { content.closingNote = completion.closingNote!.value; });
  if (completion.policies) set('policies', () => { content.policies = completion.policies!.value; });
  if (completion.places?.length) set('places', () => { content.places = completion.places!.map(freshPlace); });

  for (const detail of completion.activityDetails ?? []) {
    for (const day of content.days) {
      for (const activity of day.activities) {
        if (activity.title !== detail.title) continue;
        if (detail.place && !activity.place) { activity.place = detail.place.value; filled.push('days[].activities[].place'); }
        if (detail.description && !activity.description) { activity.description = detail.description.value; filled.push('days[].activities[].description'); }
        if (detail.tip && !activity.tip) { activity.tip = detail.tip.value; filled.push('days[].activities[].tip'); }
      }
    }
  }
  return { content, filled };
}

/** Paths that the publish checks still report after the merge (the guide fills them, or uses "Buat dengan AI"). */
export function missingAfterImport(content: WebItineraryContent): string[] {
  return validateForPublish(content).errors.map((error) => error.path || error.code);
}

export function newDraftBase(mode: ItineraryMode, profile: { defaultCountry?: string; defaultLanguage?: string | null }): WebItineraryContent {
  return { schemaVersion: 'web-2.1.0', trip: { mode, title: '', destination: '', country: profile.defaultCountry ?? '', region: null, language: profile.defaultLanguage ?? null, colorTheme: 'mixed', startDate: null, startTime: null, endTime: null }, guide: { name: null, phone: null }, meeting: { place: null, mapsUrl: null, time: null, note: null }, pickup: { offered: false, area: null, time: null, dropoffNote: null }, cover: null, summary: '', days: mode === 'multi_day' ? [blankDay(mode, 1), blankDay(mode, 2)] : mode === 'destination_guide' ? [] : [blankDay(mode, 1)], places: [], included: [], notIncluded: [], notSuitableFor: [], notAllowed: [], whatToBring: [], localTips: [], emergencyContacts: [], policies: null, closingNote: null, disclaimer: null };
}

/** A document can hold a line longer than a field allows. Nothing is rejected: text is cut at a word boundary, the cut part of an
 * activity title moves to its description, and every cut is reported so the guide can finish it by hand. */
function clip(text: string, max: number): { kept: string; rest: string } {
  if (text.length <= max) return { kept: text, rest: '' };
  const window = text.slice(0, max);
  const space = window.lastIndexOf(' ');
  const cut = space > max * 0.6 ? space : max;
  return { kept: text.slice(0, cut).trimEnd(), rest: text.slice(cut).trim() };
}

export function fitToLimits(content: WebItineraryContent): string[] {
  const notes: string[] = [];
  const cut = (label: string, count = 1) => notes.push(count > 1 ? `${label}: ${count} isian terlalu panjang dan dipotong; lengkapi dari teks sumber.` : `${label}: isian terlalu panjang dan dipotong; lengkapi dari teks sumber.`);
  const fitString = (label: string, value: string | null, max: number, assign: (next: string) => void) => {
    if (typeof value !== 'string' || value.length <= max) return;
    assign(clip(value, max).kept); cut(label);
  };
  const fitList = (label: string, list: string[], maxItem: number, maxItems: number) => {
    if (list.length > maxItems) { notes.push(`${label}: hanya ${maxItems} butir pertama dipakai; ${list.length - maxItems} butir lain tidak dimasukkan.`); list.length = maxItems; }
    let clipped = 0;
    list.forEach((item, index) => { if (item.length > maxItem) { list[index] = clip(item, maxItem).kept; clipped += 1; } });
    if (clipped) cut(label, clipped);
  };

  const { trip, guide, meeting } = content;
  fitString('Judul', trip.title, 200, (v) => { trip.title = v; });
  fitString('Destinasi', trip.destination, 200, (v) => { trip.destination = v; });
  fitString('Negara', trip.country, 120, (v) => { trip.country = v; });
  fitString('Nama guide', guide.name, 160, (v) => { guide.name = v; });
  fitString('Nomor guide', guide.phone, 80, (v) => { guide.phone = v; });
  fitString('Titik kumpul', meeting.place, 240, (v) => { meeting.place = v; });
  if (meeting.mapsUrl && meeting.mapsUrl.length > 2048) { meeting.mapsUrl = null; notes.push('Link peta titik kumpul terlalu panjang dan tidak dimasukkan.'); }
  fitString('Ringkasan', content.summary, 4000, (v) => { content.summary = v; });
  fitString('Kebijakan', content.policies, 4000, (v) => { content.policies = v; });
  fitString('Catatan penutup', content.closingNote, 2000, (v) => { content.closingNote = v; });

  fitList('Sudah termasuk', content.included, 500, 50);
  fitList('Tidak termasuk', content.notIncluded, 500, 50);
  fitList('Yang perlu dibawa', content.whatToBring, 500, 50);
  fitList('Tidak cocok untuk', content.notSuitableFor, 500, 50);
  fitList('Tidak diperbolehkan', content.notAllowed, 500, 50);
  fitList('Tips lokal', content.localTips, 1200, 50);

  if (content.emergencyContacts.length > 30) { notes.push(`Kontak darurat: hanya 30 pertama dipakai; ${content.emergencyContacts.length - 30} lain tidak dimasukkan.`); content.emergencyContacts.length = 30; }
  for (const contact of content.emergencyContacts) { contact.label = clip(contact.label, 120).kept; contact.value = clip(contact.value, 240).kept; }

  content.days.forEach((day, dayIndex) => {
    fitString(`Hari ${dayIndex + 1}, judul`, day.title, 200, (v) => { day.title = v; });
    if (day.activities.length > 30) { notes.push(`Hari ${dayIndex + 1}: hanya 30 aktivitas pertama dipakai; ${day.activities.length - 30} aktivitas lain tidak dimasukkan.`); day.activities.length = 30; }
    for (const activity of day.activities) {
      if (activity.title.length > 200) {
        const { kept, rest } = clip(activity.title, 200);
        activity.title = kept;
        if (rest) activity.description = activity.description ? `${rest}\n${activity.description}` : rest;
        notes.push(`Hari ${dayIndex + 1}: judul aktivitas "${kept.slice(0, 40)}…" terlalu panjang; sisanya dipindah ke deskripsi.`);
      }
      if (activity.place && activity.place.length > 200) activity.place = clip(activity.place, 200).kept;
      if (activity.description.length > 4000) activity.description = clip(activity.description, 4000).kept;
      if (activity.tip && activity.tip.length > 4000) activity.tip = clip(activity.tip, 4000).kept;
    }
  });
  content.places.forEach((place) => {
    place.name = clip(place.name, 200).kept; place.area = clip(place.area ?? '', 160).kept; place.description = clip(place.description ?? '', 6000).kept;
  });
  return notes;
}
