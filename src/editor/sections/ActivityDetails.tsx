import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import type { FieldMeta } from '../schema-meta.js';
import { NumberField, SelectField, TextArea, TextField, TextList, buttonClass, inputClass } from '../fields.js';

/** Detail of an activity itinerary (mode "activity", web-2.2.0). One block, no day schedule. */
const CATEGORY_CHOICES: Array<[string, string]> = [['', 'Pilih jenis kegiatan'], ['adventure', 'Petualangan'], ['water', 'Air'], ['culture', 'Budaya'], ['wellness', 'Wellness'], ['nature', 'Alam'], ['family', 'Keluarga']];
const DIFFICULTY_CHOICES: Array<[string, string]> = [['', 'Tidak ditentukan'], ['easy', 'Mudah'], ['moderate', 'Sedang'], ['challenging', 'Menantang']];

const QUICK_SESSIONS: Array<[string, string]> = [['Pagi', '08:00'], ['Siang', '12:00'], ['Sore', '15:00']];
const FREE_SLOTS = ['08:00', '10:00', '13:00', '15:00', '09:00', '11:00', '14:00', '16:00'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const tidyTimes = (list: string[]) => [...new Set(list.filter((time) => TIME_PATTERN.test(time)))].sort().slice(0, 8);

/** Session start times: quick choices (pagi, siang, sore), one native time input per session, sorted when a field is left. */
function SessionTimes({ id, meta, values, onChange }: { id: string; meta: FieldMeta; values: string[]; onChange: (values: string[]) => void }) {
  const max = meta.maxItems ?? 8;
  const full = values.length >= max;
  const nextFree = FREE_SLOTS.find((slot) => !values.includes(slot)) ?? '12:00';
  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3" data-editor-field="activity-sessions">
      <legend className="px-1 text-sm font-semibold">{meta.label} <span className="font-normal text-slate-500">({values.length}/{max})</span></legend>
      <div className="flex flex-wrap gap-2">
        {QUICK_SESSIONS.map(([name, time]) => (
          <button key={time} type="button" className={buttonClass} disabled={full || values.includes(time)} onClick={() => onChange(tidyTimes([...values, time]))}>{name} {time}</button>
        ))}
      </div>
      {values.length === 0 && <p className="text-sm text-slate-600">Belum ada jam sesi. Pilih jam cepat di atas atau tambah jam lain.</p>}
      <ul className="space-y-2">
        {values.map((time, index) => (
          <li key={`${index}-${time}`} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${id}-${index}`}>{meta.label}, sesi {index + 1}</label>
            <input id={`${id}-${index}`} type="time" step={300} defaultValue={time} className={`${inputClass} mt-0 max-w-[10rem]`} data-field-path={meta.path}
              onBlur={(event) => { const next = event.target.value; if (next && next !== time) onChange(tidyTimes(values.map((item, i) => (i === index ? next : item)))); }} />
            <button type="button" className={buttonClass} aria-label={`Hapus sesi ${time}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Hapus</button>
          </li>
        ))}
      </ul>
      <button type="button" className={buttonClass} disabled={full} onClick={() => onChange(tidyTimes([...values, nextFree]))}>Tambah jam lain</button>
    </fieldset>
  );
}

/** Highlights: short one-line points with a counter per line and for the list. */
function HighlightList({ id, meta, values, onChange }: { id: string; meta: FieldMeta; values: string[]; onChange: (values: string[]) => void }) {
  const max = meta.maxItems ?? 5;
  const maxLength = meta.maxLength ?? 160;
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3" data-editor-field="activity-highlights">
      <legend className="px-1 text-sm font-semibold">{meta.label} <span className="font-normal text-slate-500">({values.length}/{max})</span></legend>
      <p className="text-sm text-slate-600">Satu poin singkat per baris, misalnya "Jeram grade III" atau "Makan siang termasuk".</p>
      {values.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          <label className="sr-only" htmlFor={`${id}-${index}`}>{meta.label}, poin {index + 1}</label>
          <input id={`${id}-${index}`} type="text" value={value} maxLength={maxLength} className={`${inputClass} mt-0`} data-field-path={meta.path}
            onChange={(event) => onChange(values.map((item, i) => (i === index ? event.target.value : item)))} />
          <span className="min-w-[3.5rem] pt-3 text-right text-xs text-slate-500">{value.length}/{maxLength}</span>
          <button type="button" className={buttonClass} aria-label={`Hapus poin ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>Hapus</button>
        </div>
      ))}
      <button type="button" className={buttonClass} disabled={values.length >= max} onClick={() => onChange([...values, ''])}>Tambah highlight</button>
    </fieldset>
  );
}

export function ActivityDetails(props: EditorProps) {
  const { content, recordId, meta, patch } = props;
  const activity = content.activity;
  if (!activity) return null;
  const mode = 'activity' as const;
  const id = (name: string) => `${recordId}-activity-${name}`;
  return (
    <section data-editor-section="activity-details" className="space-y-4">
      <h3 className="font-semibold">Detail aktivitas</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField id={id('category')} meta={meta('activity.category', mode)} value={activity.category ?? ''} choices={CATEGORY_CHOICES}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.category = (v || null) as typeof n.activity.category; })} />
        <NumberField id={id('duration')} meta={meta('activity.durationMinutes', mode)} value={activity.durationMinutes}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.durationMinutes = v; })} />
        <SelectField id={id('difficulty')} meta={meta('activity.difficulty', mode)} value={activity.difficulty ?? ''} choices={DIFFICULTY_CHOICES}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.difficulty = (v || null) as typeof n.activity.difficulty; })} />
        <NumberField id={id('age-min')} meta={meta('activity.ageMin', mode)} value={activity.ageMin}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.ageMin = v; })} />
        <NumberField id={id('age-max')} meta={meta('activity.ageMax', mode)} value={activity.ageMax}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.ageMax = v; })} />
        <NumberField id={id('weight')} meta={meta('activity.weightMaxKg', mode)} value={activity.weightMaxKg}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.weightMaxKg = v; })} />
        <TextField id={id('operator')} meta={meta('activity.operator', mode)} value={activity.operator}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.operator = v?.trim() ? v : null; })} />
        <TextField id={id('best-time')} meta={meta('activity.bestTime', mode)} value={activity.bestTime}
          onChange={(v) => patch((n) => { if (n.activity) n.activity.bestTime = v?.trim() ? v : null; })} />
      </div>
      <SessionTimes id={id('sessions')} meta={meta('activity.sessionTimes[]', mode)} values={activity.sessionTimes}
        onChange={(values) => patch((n) => { if (n.activity) n.activity.sessionTimes = values; })} />
      <HighlightList id={id('highlights')} meta={meta('activity.highlights[]', mode)} values={activity.highlights}
        onChange={(values) => patch((n) => { if (n.activity) n.activity.highlights = values; })} />
      <TextList id={id('guide-languages')} meta={meta('activity.guideLanguages[]', mode)} values={activity.guideLanguages}
        onChange={(values) => patch((n) => { if (n.activity) n.activity.guideLanguages = values.slice(0, 6); })} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Jalannya kegiatan</h4>
          <button type="button" className={buttonClass} disabled={activity.steps.length >= 12}
            onClick={() => patch((n) => { if (n.activity) n.activity.steps.push({ title: '', minutes: null, note: null }); })}>Tambah langkah</button>
        </div>
        {activity.steps.map((step, index) => (
          <fieldset key={index} className="space-y-3 rounded-xl border border-slate-300 p-4">
            <legend className="px-2 font-semibold">Langkah {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id={id(`step-${index}-title`)} meta={meta('activity.steps[].title', mode)} value={step.title}
                onChange={(v) => patch((n) => { if (n.activity?.steps[index]) n.activity.steps[index].title = v ?? ''; })} />
              <NumberField id={id(`step-${index}-minutes`)} meta={meta('activity.steps[].minutes', mode)} value={step.minutes}
                onChange={(v) => patch((n) => { if (n.activity?.steps[index]) n.activity.steps[index].minutes = v; })} />
            </div>
            <TextArea id={id(`step-${index}-note`)} meta={meta('activity.steps[].note', mode)} value={step.note}
              onChange={(v) => patch((n) => { if (n.activity?.steps[index]) n.activity.steps[index].note = v?.trim() ? v : null; })} />
            <div className="flex gap-2">
              <button type="button" className={buttonClass} disabled={index === 0}
                onClick={() => patch((n) => { const steps = n.activity?.steps; if (steps && index > 0) [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; })}>Naikkan</button>
              <button type="button" className={buttonClass} onClick={() => { if (globalThis.confirm('Hapus langkah ini?')) patch((n) => { if (n.activity) n.activity.steps.splice(index, 1); }); }}>Hapus langkah</button>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
