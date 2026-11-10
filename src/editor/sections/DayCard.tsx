import React from 'react';
import type { AssetDto } from '../../api/client.js';
import type { ItineraryMode, WebItineraryContent } from '../../contracts/types.js';
import type { AiAction, MetaFn, Patch } from '../EditorForm.js';
import { NumberField, PhotoField, SelectField, TextArea, TextField, TimeField, Toggle, buttonClass } from '../fields.js';
import { blankToNull, makeActivity, moveById, normalizeHotel, setPhotoAsset, setPhotoCredit } from '../model.js';
import { kindLabels, statusCopy } from '../labels.js';

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

export function DayCard({ day, mode, recordId, assets, meta, patch, aiAction, showHotel, showTransfer, showDayControls, isFirst, isLast, onMove, onRemove }: {
  day: NonNullable<WebItineraryContent['days'][number]>; mode: ItineraryMode; recordId: string; assets: AssetDto[]; meta: MetaFn; patch: Patch; aiAction: AiAction;
  showHotel: boolean; showTransfer: boolean; showDayControls: boolean; isFirst: boolean; isLast: boolean;
  onMove: (delta: number) => void; onRemove: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-300 p-4" data-target-id={day.id} tabIndex={-1}>
      {showDayControls && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={isFirst} onClick={() => onMove(-1)}>Naikkan hari</button>
          <button type="button" className={buttonClass} disabled={isLast} onClick={() => onMove(1)}>Turunkan hari</button>
          <button type="button" className={buttonClass} onClick={onRemove}>Hapus hari</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField id={`${recordId}-day-title-${day.id}`} meta={meta('days[].title', mode)} value={day.title} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.title = v ?? ''; })} />
        <TextField id={`${recordId}-day-location-${day.id}`} meta={meta('days[].location', mode)} value={day.location} onChange={(v) => patch((next) => { const d = next.days.find((x) => x.id === day.id); if (d) d.location = blankToNull(v); })} />
        <PhotoField id={`${recordId}-day-photo-${day.id}`} basePath="days[].photo" mode={mode} meta={meta} photo={day.photo} assets={assets} emptyText={statusCopy.noPhoto}
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
