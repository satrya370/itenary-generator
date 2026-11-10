import React, { useEffect } from 'react';
import type { FieldMeta } from '../schema-meta.js';
import type { AssetDto, LanguageResolutionDto } from '../../api/client.js';
import type { ItineraryMode, LanguageContext, WebItineraryContent } from '../../contracts/types.js';
import { AssetSelect, NumberField, SelectField, TextArea, TextField, TextList, ThemePicker, TimeField, Toggle, buttonClass, inputClass } from '../fields.js';
import { blankToNull, makeActivity, makeDay, makePlace, moveById, normalizeHotel, pickupOff, renumberDays, setPhotoAsset, setPhotoCredit } from '../model.js';
import { kindLabels, modeCopy, statusCopy } from '../labels.js';

export type Patch = (mutator: (next: WebItineraryContent) => void) => void;
export type AiAction = (key: string, labelText: string, task: 'overview' | 'description', target?: { kind: 'activity' | 'place'; id: string }, apply?: (text: string) => void) => React.ReactNode;
export type MetaFn = (path: string, mode: ItineraryMode) => FieldMeta;

export interface EditorProps {
  content: WebItineraryContent;
  mode: ItineraryMode;
  recordId: string;
  assets: AssetDto[];
  meta: MetaFn;
  patch: Patch;
  onModeChange: (mode: ItineraryMode) => void;
  agencyName: string;
  onFocusProfile: () => void;
  localeInput: string;
  localeError: string;
  language: LanguageContext;
  localeNeedsSupport: boolean;
  languageProposal: LanguageResolutionDto | null;
  onLocaleChange: (raw: string) => void;
  onDetectLanguage: () => void;
  onAcceptLanguage: () => void;
  busy: boolean;
  dirty: boolean;
  localeSupportedCheck: boolean;    
  aiAction: AiAction;
  writing: { brief: string; notes: Array<{ targetId: string; text: string }> };
  onWritingChange: (writing: EditorProps['writing']) => void;
  aiAssistExtra: React.ReactNode;
}

const localeOptions = ['auto', 'la', 'fr', 'en', 'id', 'ja', 'zh-Hans'];

export function PhotoField({ id, meta, photo, assets, onAsset, onCredit }: {
  id: string; meta: FieldMeta; photo: NonNullable<WebItineraryContent['cover']> | null; assets: AssetDto[];
  onAsset: (value: string | null) => void; onCredit: (key: 'photographer' | 'url' | 'source', value: string | null) => void;
}) {
  const creditMeta = (path: string) => ({ ...meta, path } as unknown as FieldMeta);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AssetSelect id={id} meta={meta} value={photo?.assetId ?? null} assets={assets} onChange={onAsset} />
      {photo === null ? <p className="self-end text-sm text-slate-600">{statusCopy.noCover}</p> : (
        <>
          <TextField id={`${id}-photographer`} meta={creditMeta(meta.path.replace(/\.assetId$/, '.credit.photographer'))} value={photo.credit?.photographer ?? ''} onChange={(v) => onCredit('photographer', v)} />
          <TextField id={`${id}-url`} meta={creditMeta(meta.path.replace(/\.assetId$/, '.credit.url'))} value={photo.credit?.url ?? ''} type="url" onChange={(v) => onCredit('url', v)} />
          <TextField id={`${id}-source`} meta={creditMeta(meta.path.replace(/\.assetId$/, '.credit.source'))} value={photo.credit?.source ?? ''} onChange={(v) => onCredit('source', v)} />
        </>
      )}
    </div>
  );
}

export function LocaleField({ id, meta, value, onChange, error, help, needsSupport, locale, showDetect, busy, dirty, proposal, onDetect, onAccept }: {
  id: string; meta: FieldMeta; value: string; onChange: (v: string) => void; error: string; help: string; needsSupport: boolean; locale: string | null;
  showDetect: boolean; busy: boolean; dirty: boolean; proposal: LanguageResolutionDto | null; onDetect: () => void; onAccept: () => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <input id={id} list={`${id}-options`} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${error ? 'border-red-600' : ''}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-help`} data-field-path={meta.path} />
      <datalist id={`${id}-options`}>{localeOptions.map((option) => <option key={option} value={option} />)}</datalist>
      <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{help}</p>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-700">{error}</p>}
      {needsSupport && <p className="mt-1 text-xs text-amber-800">Katalog/font render untuk {locale} belum tersedia; tidak akan fallback diam-diam.</p>}
      {showDetect && <button type="button" disabled={busy || dirty} className={`${buttonClass} mt-2`} onClick={onDetect}>Deteksi otomatis</button>}
      {proposal?.status === 'resolved' && (
        <div className="mt-2 rounded-md bg-teal-50 p-2 text-sm">Proposal bahasa: {proposal.locale}. <button type="button" className="font-semibold text-teal-900 underline" onClick={onAccept}>Konfirmasi bahasa</button></div>
      )}
    </div>
  );
}

function ActivityList({ dayId, day, mode, recordId, assets, meta, patch, aiAction }: {
  dayId: string; day: NonNullable<WebItineraryContent['days'][number]>; mode: ItineraryMode; recordId: string; assets: AssetDto[]; meta: MetaFn; patch: Patch; aiAction: AiAction;
}) {
  const kindChoices: Array<[string, string]> = Object.entries(kindLabels).map(([k, v]) => [k, v]);
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Aktivitas ({day.activities.length})</h4>
        <button type="button" className={buttonClass} disabled={day.activities.length >= 30} onClick={() => patch((next) => { const d = next.days.find((x) => x.id === dayId); if (d) d.activities.push(makeActivity()); })}>Tambah aktivitas</button>
      </div>
      {day.activities.map((activity, activityIndex) => (
        <fieldset key={activity.id} className="space-y-3 rounded-lg bg-slate-50 p-3" data-target-id={activity.id} tabIndex={-1}>
          <legend className="px-1 text-sm font-medium">Aktivitas {activityIndex + 1}</legend>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} disabled={activityIndex === 0} onClick={() => patch((next) => { const d = next.days.find((x) => x.id === dayId); if (d) d.activities = moveById(d.activities, activity.id, -1); })}>Naikkan</button>
            <button type="button" className={buttonClass} disabled={activityIndex === day.activities.length - 1} onClick={() => patch((next) => { const d = next.days.find((x) => x.id === dayId); if (d) d.activities = moveById(d.activities, activity.id, 1); })}>Turunkan</button>
            <button type="button" className={buttonClass} disabled={day.activities.length <= 1} onClick={() => patch((next) => { const d = next.days.find((x) => x.id === dayId); if (d && d.activities.length > 1) d.activities = d.activities.filter((a) => a.id !== activity.id); })}>Hapus</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TimeField id={`${recordId}-activity-time-${activity.id}`} meta={meta('days[].activities[].time', mode)} value={activity.time} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.time = v; })} />
            <NumberField id={`${recordId}-activity-duration-${activity.id}`} meta={meta('days[].activities[].durationMinutes', mode)} value={activity.durationMinutes} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.durationMinutes = v; })} />
            <SelectField id={`${recordId}-activity-kind-${activity.id}`} meta={meta('days[].activities[].kind', mode)} value={activity.kind} choices={kindChoices} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.kind = v as typeof a.kind; })} />
            <TextField id={`${recordId}-activity-title-${activity.id}`} meta={meta('days[].activities[].title', mode)} value={activity.title} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.title = v ?? ''; })} />
            <TextField id={`${recordId}-activity-place-${activity.id}`} meta={meta('days[].activities[].place', mode)} value={activity.place} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.place = blankToNull(v); })} />
            <TextArea id={`${recordId}-activity-description-${activity.id}`} meta={meta('days[].activities[].description', mode)} value={activity.description} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.description = v ?? ''; })} />
            <TextArea id={`${recordId}-activity-tip-${activity.id}`} meta={meta('days[].activities[].tip', mode)} value={activity.tip} onChange={(v) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.tip = blankToNull(v); })} />
            {aiAction(`activity:${activity.id}`, 'Buat dengan AI', 'description', { kind: 'activity', id: activity.id }, (text) => patch((next) => { const a = next.days.find((x) => x.id === dayId)?.activities.find((x) => x.id === activity.id); if (a) a.description = text; }))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function DayCard({ day, mode, recordId, assets, meta, patch, aiAction, showHotel, showTransfer, canRemove, onMove, onRemove }: {
  day: NonNullable<WebItineraryContent['days'][number]>; mode: ItineraryMode; recordId: string; assets: AssetDto[]; meta: MetaFn; patch: Patch; aiAction: AiAction;
  showHotel: boolean; showTransfer: boolean; canRemove: boolean;
  onMove: (delta: number) => void; onRemove: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-300 p-4" data-target-id={day.id} tabIndex={-1}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={() => onMove(-1)}>Naikkan hari</button>
        <button type="button" className={buttonClass} onClick={() => onMove(1)}>Turunkan hari</button>
        <button type="button" className={buttonClass} disabled={!canRemove} onClick={onRemove}>Hapus hari</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField id={`${recordId}-day-title-${day.id}`} meta={meta('days[].title', mode)} value={day.title} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.title = v ?? ''; })} />
        <TextField id={`${recordId}-day-location-${day.id}`} meta={meta('days[].location', mode)} value={day.location} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.location = blankToNull(v); })} />
        <PhotoField id={`${recordId}-day-photo-${day.id}`} meta={meta('days[].photo.assetId', mode)} photo={day.photo} assets={assets}
          onAsset={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.photo = setPhotoAsset(d.photo, v); })}
          onCredit={(k, v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.photo = setPhotoCredit(d.photo, k, v); })} />
        {showHotel && (
          <>
            <TextField id={`${recordId}-hotel-name-${day.id}`} meta={meta('days[].hotel.name', mode)} value={day.hotel?.name ?? ''} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.hotel = normalizeHotel(v ?? '', d.hotel?.area ?? null, d.hotel?.note ?? null); })} />
            <TextField id={`${recordId}-hotel-area-${day.id}`} meta={meta('days[].hotel.area', mode)} value={day.hotel?.area} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.hotel = normalizeHotel(d.hotel?.name ?? '', v, d.hotel?.note ?? null); })} />
            <TextArea id={`${recordId}-hotel-note-${day.id}`} meta={meta('days[].hotel.note', mode)} value={day.hotel?.note} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.hotel = normalizeHotel(d.hotel?.name ?? '', d.hotel?.area ?? null, v); })} />
          </>
        )}
        {showTransfer && <TextArea id={`${recordId}-transfer-${day.id}`} meta={meta('days[].transferNote', mode)} value={day.transferNote} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.transferNote = blankToNull(v); })} />}
      </div>
      {(mode === 'full_day' || mode === 'multi_day') && (
        <div className="flex flex-wrap gap-4">
          <Toggle id={`${recordId}-meal-breakfast-${day.id}`} meta={meta('days[].meals.breakfast', mode)} value={day.meals?.breakfast ?? false} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) { const m = d.meals ?? { breakfast: false, lunch: false, dinner: false }; d.meals = { ...m, breakfast: v }; if (!d.meals.breakfast && !d.meals.lunch && !d.meals.dinner) d.meals = null; } })} />
          <Toggle id={`${recordId}-meal-lunch-${day.id}`} meta={meta('days[].meals.lunch', mode)} value={day.meals?.lunch ?? false} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) { const m = d.meals ?? { breakfast: false, lunch: false, dinner: false }; d.meals = { ...m, lunch: v }; if (!d.meals.breakfast && !d.meals.lunch && !d.meals.dinner) d.meals = null; } })} />
          <Toggle id={`${recordId}-meal-dinner-${day.id}`} meta={meta('days[].meals.dinner', mode)} value={day.meals?.dinner ?? false} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) { const m = d.meals ?? { breakfast: false, lunch: false, dinner: false }; d.meals = { ...m, dinner: v }; if (!d.meals.breakfast && !d.meals.lunch && !d.meals.dinner) d.meals = null; } })} />
        </div>
      )}
      <ActivityList dayId={day.id} day={day} mode={mode} recordId={recordId} assets={assets} meta={meta} patch={patch} aiAction={aiAction} />
    </div>
  );
}

export function EditorForm(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  const scheduled = mode !== 'destination_guide';
  return (
    <div className="space-y-7">
      <section data-editor-section="trip-info" className="space-y-4">
        <h3 className="font-semibold">Informasi trip</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField id={`${recordId}-trip-title`} meta={meta('trip.title', mode)} value={content.trip.title} onChange={(v) => patch((n) => { n.trip.title = v ?? ''; })} />
          <TextField id={`${recordId}-trip-destination`} meta={meta('trip.destination', mode)} value={content.trip.destination} onChange={(v) => patch((n) => { n.trip.destination = v ?? ''; })} />
          <TextField id={`${recordId}-trip-country`} meta={meta('trip.country', mode)} value={content.trip.country} onChange={(v) => patch((n) => { n.trip.country = v ?? ''; })} />
          <TextField id={`${recordId}-trip-region`} meta={meta('trip.region', mode)} value={content.trip.region} onChange={(v) => patch((n) => { n.trip.region = blankToNull(v); })} />
          <ThemePicker id={`${recordId}-color-theme`} meta={meta('trip.colorTheme', mode)} value={content.trip.colorTheme} onChange={(v) => patch((n) => { n.trip.colorTheme = v as typeof n.trip.colorTheme; })} />
          {scheduled && <TextField id={`${recordId}-start-date`} meta={meta('trip.startDate', mode)} value={content.trip.startDate} type="date" onChange={(v) => patch((n) => { n.trip.startDate = blankToNull(v); })} />}
          <div>
            <label htmlFor={`${recordId}-mode`} className="block text-sm font-medium">{meta('trip.mode', mode).label}</label>
            <select id={`${recordId}-mode`} value={mode} onChange={(e) => props.onModeChange(e.target.value as ItineraryMode)} className={inputClass} data-field-path={meta('trip.mode', mode).path}>
              {Object.entries(modeCopy).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
            </select>
          </div>
          <p className="self-end text-sm text-slate-600">Dari profil agensi: {props.agencyName || 'belum diisi'} · <button type="button" className="font-semibold text-teal-800 underline" onClick={props.onFocusProfile}>Ubah profil</button></p>
          <LocaleField id={`${recordId}-locale`} meta={meta('trip.language', mode)} value={props.localeInput} onChange={props.onLocaleChange} error={props.localeError} help={statusCopy.languageUnresolved} needsSupport={props.localeNeedsSupport} locale={props.language.outputLanguage} showDetect={props.language.source === 'unresolved'} busy={props.busy} dirty={props.dirty} proposal={props.languageProposal} onDetect={props.onDetectLanguage} onAccept={props.onAcceptLanguage} />
        </div>
      </section>

      {scheduled && (
        <section data-editor-section="time-meeting" className="space-y-4">
          <h3 className="font-semibold">Waktu & titik kumpul</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(mode === 'half_day' || mode === 'full_day') && (
              <>
                <TimeField id={`${recordId}-start-time`} meta={meta('trip.startTime', mode)} value={content.trip.startTime} onChange={(v) => patch((n) => { n.trip.startTime = v; })} />
                <TimeField id={`${recordId}-end-time`} meta={meta('trip.endTime', mode)} value={content.trip.endTime} onChange={(v) => patch((n) => { n.trip.endTime = v; })} />
              </>
            )}
            <TextField id={`${recordId}-meeting-place`} meta={meta('meeting.place', mode)} value={content.meeting.place} onChange={(v) => patch((n) => { n.meeting.place = blankToNull(v); })} />
            <TextField id={`${recordId}-meeting-maps`} meta={meta('meeting.mapsUrl', mode)} value={content.meeting.mapsUrl} type="url" onChange={(v) => patch((n) => { n.meeting.mapsUrl = blankToNull(v); })} />
            <TimeField id={`${recordId}-meeting-time`} meta={meta('meeting.time', mode)} value={content.meeting.time} onChange={(v) => patch((n) => { n.meeting.time = v; })} />
            <TextArea id={`${recordId}-meeting-note`} meta={meta('meeting.note', mode)} value={content.meeting.note} onChange={(v) => patch((n) => { n.meeting.note = blankToNull(v); })} />
            <Toggle id={`${recordId}-pickup-offered`} meta={meta('pickup.offered', mode)} value={content.pickup.offered} onChange={(v) => patch((n) => { n.pickup = v ? { ...n.pickup, offered: true } : pickupOff(); })} />
            {content.pickup.offered && (
              <>
                <TextField id={`${recordId}-pickup-area`} meta={meta('pickup.area', mode)} value={content.pickup.area} onChange={(v) => patch((n) => { n.pickup.area = blankToNull(v); })} />
                <TimeField id={`${recordId}-pickup-time`} meta={meta('pickup.time', mode)} value={content.pickup.time} onChange={(v) => patch((n) => { n.pickup.time = v; })} />
                <TextArea id={`${recordId}-pickup-dropoff`} meta={meta('pickup.dropoffNote', mode)} value={content.pickup.dropoffNote} onChange={(v) => patch((n) => { n.pickup.dropoffNote = blankToNull(v); })} />
              </>
            )}
          </div>
        </section>
      )}

      <section data-editor-section="trip-guide" className="space-y-4">
        <h3 className="font-semibold">Guide trip</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={`${recordId}-guide-name`} meta={meta('guide.name', mode)} value={content.guide.name} onChange={(v) => patch((n) => { n.guide.name = blankToNull(v); })} />
          <TextField id={`${recordId}-guide-phone`} meta={meta('guide.phone', mode)} value={content.guide.phone} onChange={(v) => patch((n) => { n.guide.phone = blankToNull(v); })} />
          <p className="text-xs text-slate-500 sm:col-span-2">kosongkan jika sama dengan kontak agensi</p>
        </div>
      </section>

      <section data-editor-section="cover" className="space-y-4">
        <h3 className="font-semibold">Foto sampul</h3>
        <PhotoField id={`${recordId}-cover`} meta={meta('cover.assetId', mode)} photo={content.cover} assets={assets}
          onAsset={(v) => patch((n) => { n.cover = setPhotoAsset(n.cover, v); })}
          onCredit={(k, v) => patch((n) => { n.cover = setPhotoCredit(n.cover, k, v); })} />
      </section>

      <section data-editor-section="summary" className="space-y-4">
        <h3 className="font-semibold">Ringkasan</h3>
        <TextArea id={`${recordId}-summary`} meta={meta('summary', mode)} value={content.summary} onChange={(v) => patch((n) => { n.summary = v ?? ''; })} />
        {props.aiAction('overview.summary', 'Buat dengan AI', 'overview', undefined, (text) => patch((n) => { n.summary = text; }))}
      </section>

      {(mode === 'half_day' || mode === 'full_day') && (
        <section data-editor-section="schedule" className="space-y-4">
          <h3 className="font-semibold">Jadwal</h3>
          {content.days.map((day) => (
            <DayCard key={day.id} day={day} mode={mode} recordId={recordId} assets={assets} meta={meta} patch={patch} aiAction={props.aiAction} showHotel={false} showTransfer={false} canRemove={false}
              onMove={() => {}} onRemove={() => {}} />
          ))}
        </section>
      )}

      {mode === 'multi_day' && (
        <section data-editor-section="days" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Hari demi hari</h3>
            <button type="button" className={buttonClass} disabled={content.days.length >= 14} onClick={() => patch((n) => { n.days.push(makeDay('multi_day', n.days.length + 1)); })}>Tambah hari</button>
          </div>
          {content.days.map((day, index) => (
            <DayCard key={day.id} day={day} mode={mode} recordId={recordId} assets={assets} meta={meta} patch={patch} aiAction={props.aiAction} showHotel showTransfer canRemove={content.days.length > 2}
              onMove={(delta) => patch((n) => { const from = n.days.findIndex((x) => x.id === day.id); const to = from + delta; if (from < 0 || to < 0 || to >= n.days.length) return; [n.days[from], n.days[to]] = [n.days[to], n.days[from]]; n.days = renumberDays(n.days); })}
              onRemove={() => patch((n) => { n.days = renumberDays(n.days.filter((x) => x.id !== day.id)); })} />
          ))}
          <p className="text-xs text-slate-500">{content.days.length} hari</p>
        </section>
      )}

      {mode === 'destination_guide' && (
        <section data-editor-section="places" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Tempat</h3>
            <button type="button" className={buttonClass} disabled={content.places.length >= 60} onClick={() => patch((n) => { n.places.push(makePlace()); })}>Tambah tempat</button>
          </div>
          {content.places.map((place, index) => {
            const prevGroup = index > 0 ? content.places[index - 1].group : undefined;
            const showHeading = place.group !== prevGroup;
            return (
              <fieldset key={place.id} className="space-y-4 rounded-xl border border-slate-300 p-4" data-target-id={place.id} tabIndex={-1}>
                <legend className="px-2 font-semibold">{place.group ? `${place.group} — ` : ''}Tempat {index + 1}</legend>
                {showHeading && place.group && <h4 className="text-base font-bold">{place.group}</h4>}
                <div className="flex gap-2">
                  <button type="button" className={buttonClass} disabled={index === 0} onClick={() => patch((n) => { n.places = moveById(n.places, place.id, -1); })}>Naikkan</button>
                  <button type="button" className={buttonClass} disabled={index === content.places.length - 1} onClick={() => patch((n) => { n.places = moveById(n.places, place.id, 1); })}>Turunkan</button>
                  <button type="button" className={buttonClass} onClick={() => patch((n) => { n.places = n.places.filter((x) => x.id !== place.id); })}>Hapus tempat</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField id={`${recordId}-place-name-${place.id}`} meta={meta('places[].name', mode)} value={place.name} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.name = v ?? ''; })} />
                  <TextField id={`${recordId}-place-area-${place.id}`} meta={meta('places[].area', mode)} value={place.area} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.area = v ?? ''; })} />
                  <TextField id={`${recordId}-place-group-${place.id}`} meta={meta('places[].group', mode)} value={place.group} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.group = blankToNull(v); })} />
                  <TextArea id={`${recordId}-place-description-${place.id}`} meta={meta('places[].description', mode)} value={place.description} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.description = v ?? ''; })} />
                  {props.aiAction(`place:${place.id}`, 'Buat dengan AI', 'description', { kind: 'place', id: place.id }, (text) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.description = text; }))}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Detail tambahan</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TextField id={`${recordId}-place-duration-${place.id}`} meta={meta('places[].suggestedDuration', mode)} value={place.suggestedDuration} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.suggestedDuration = blankToNull(v); })} />
                    <TextField id={`${recordId}-place-besttime-${place.id}`} meta={meta('places[].bestTime', mode)} value={place.bestTime} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.bestTime = blankToNull(v); })} />
                    <TextArea id={`${recordId}-place-getting-${place.id}`} meta={meta('places[].gettingThere', mode)} value={place.gettingThere} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.gettingThere = blankToNull(v); })} />
                    <TextField id={`${recordId}-place-nearby-${place.id}`} meta={meta('places[].nearby', mode)} value={place.nearby} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.nearby = blankToNull(v); })} />
                    <TextList id={`${recordId}-place-tips-${place.id}`} meta={meta('places[].tips[]', mode)} values={place.tips} onChange={(values) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.tips = values; })} />
                    <PhotoField id={`${recordId}-place-photo-${place.id}`} meta={meta('places[].photo.assetId', mode)} photo={place.photo} assets={assets}
                      onAsset={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.photo = setPhotoAsset(p.photo, v); })}
                      onCredit={(k, v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.photo = setPhotoCredit(p.photo, k, v); })} />
                  </div>
                </details>
              </fieldset>
            );
          })}
        </section>
      )}

      <section data-editor-section="practical" className="space-y-4">
        <h3 className="font-semibold">Info praktis</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextList id={`${recordId}-included`} meta={meta('included[]', mode)} values={content.included} onChange={(values) => patch((n) => { n.included = values; })} />
          <TextList id={`${recordId}-not-included`} meta={meta('notIncluded[]', mode)} values={content.notIncluded} onChange={(values) => patch((n) => { n.notIncluded = values; })} />
          <TextList id={`${recordId}-what-to-bring`} meta={meta('whatToBring[]', mode)} values={content.whatToBring} onChange={(values) => patch((n) => { n.whatToBring = values; })} />
          <TextList id={`${recordId}-local-tips`} meta={meta('localTips[]', mode)} values={content.localTips} onChange={(values) => patch((n) => { n.localTips = values; })} />
          <TextList id={`${recordId}-health-safety`} meta={meta('healthSafety[]', mode)} values={content.healthSafety} onChange={(values) => patch((n) => { n.healthSafety = values; })} />
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">{meta('emergencyContacts[].label', mode).label}</legend>
            {content.emergencyContacts.map((contact, index) => (
              <div key={`${recordId}-emergency-${index}`} className="grid gap-3 sm:grid-cols-2">
                <TextField id={`${recordId}-emergency-label-${index}`} meta={meta('emergencyContacts[].label', mode)} value={contact.label} onChange={(v) => patch((n) => { n.emergencyContacts[index] = { ...n.emergencyContacts[index], label: v ?? '' }; })} />
                <TextField id={`${recordId}-emergency-value-${index}`} meta={meta('emergencyContacts[].value', mode)} value={contact.value} onChange={(v) => patch((n) => { n.emergencyContacts[index] = { ...n.emergencyContacts[index], value: v ?? '' }; })} />
              </div>
            ))}
            <button type="button" className={buttonClass} disabled={content.emergencyContacts.length >= 30} onClick={() => patch((n) => { n.emergencyContacts.push({ label: '', value: '' }); })}>Tambah {meta('emergencyContacts[].label', mode).label.toLowerCase()}</button>
          </fieldset>
        </div>
      </section>

      <section data-editor-section="closing" className="space-y-4">
        <h3 className="font-semibold">Ketentuan & penutup</h3>
        <TextArea id={`${recordId}-policies`} meta={meta('policies', mode)} value={content.policies} onChange={(v) => patch((n) => { n.policies = blankToNull(v); })} />
        <TextArea id={`${recordId}-closing-note`} meta={meta('closingNote', mode)} value={content.closingNote} onChange={(v) => patch((n) => { n.closingNote = blankToNull(v); })} />
        <TextArea id={`${recordId}-disclaimer`} meta={meta('disclaimer', mode)} value={content.disclaimer} onChange={(v) => patch((n) => { n.disclaimer = blankToNull(v); })} />
      </section>

      <section data-editor-section="ai-assist" className="space-y-4">
        <details>
          <summary className="cursor-pointer font-semibold">Bantuan AI</summary>
          <div className="mt-3 space-y-3">
            <textarea id={`${recordId}-brief`} rows={4} value={props.writing.brief} maxLength={20000} onChange={(e) => props.onWritingChange({ ...props.writing, brief: e.target.value })} className={inputClass} data-field-path="writing.brief" />
            <label htmlFor={`${recordId}-brief`} className="block text-sm font-medium">Brief perjalanan</label>
            <TextList id={`${recordId}-fact-notes`} meta={{ path: 'writing.notes[]', labelKey: 'factNotes', label: 'Catatan fakta itinerary', control: 'repeater', required: false, applies: true, maxLength: 4000, maxItems: 100 }} values={props.writing.notes.filter((n) => n.targetId === 'itinerary').map((n) => n.text)}
              onChange={(values) => props.onWritingChange({ ...props.writing, notes: [...props.writing.notes.filter((n) => n.targetId !== 'itinerary'), ...values.map((text) => ({ targetId: 'itinerary', text }))] })} />
            {props.aiAssistExtra}
          </div>
        </details>
      </section>
      <AiAssistProbe />
    </div>
  );
}

function AiAssistProbe() { useEffect(() => {}, []); return null; }

export function ModePicker({ onCreate, busy }: { onCreate: (mode: ItineraryMode) => void; busy: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(modeCopy).map(([mode, copy]) => (
        <button key={mode} type="button" data-mode-card={mode} disabled={busy} onClick={() => onCreate(mode as ItineraryMode)}
          className="rounded-xl border border-slate-200 p-4 text-left hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${copy.badge}`}>{copy.title}</span>
          <span className="mt-2 block text-sm font-medium">{copy.title}</span>
          <span className="mt-1 block text-sm text-slate-600">{copy.description}</span>
          <span className="mt-1 block text-xs text-slate-500">Contoh: {copy.example}</span>
        </button>
      ))}
    </div>
  );
}

export function DraftList({ records, modeCopyBadge, onOpen, busy }: {
  records: Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>;
  modeCopyBadge: Record<string, string>; onOpen: (id: string) => void; busy: boolean;
}) {
  const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  function relativeText(iso: string): string {
    const date = new Date(iso).getTime();
    if (Number.isNaN(date)) return '';
    const diffSeconds = Math.round((date - Date.now()) / 1000);
    if (Math.abs(diffSeconds) < 3600) {
      const minutes = Math.round(diffSeconds / 60);
      if (Math.abs(minutes) < 1) return relative.format(0, 'minute');
      return relative.format(minutes, 'minute');
    }
    if (Math.abs(diffSeconds) < 86400) return relative.format(Math.round(diffSeconds / 3600), 'hour');
    if (Math.abs(diffSeconds) < 86400 * 30) return relative.format(Math.round(diffSeconds / 86400), 'day');
    return new Date(iso).toLocaleDateString('id');
  }
  return (
    <ul className="mt-4 space-y-2">
      {records.map((item) => (
        <li key={item.id}>
          <button type="button" disabled={busy} onClick={() => onOpen(item.id)} className="w-full rounded-md border border-slate-200 p-3 text-left hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">
            <span className="block font-medium">{item.title || 'Tanpa judul'}</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${modeCopyBadge[item.mode] ?? 'bg-slate-100 text-slate-900'}`}>{modeCopy[item.mode]?.title ?? item.mode.replaceAll('_', ' ')}</span>
            <span className="mt-1 block text-xs text-slate-500">diubah {relativeText(item.updatedAt)} · revisi {item.revision}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
