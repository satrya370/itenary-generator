import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { LocaleField, TextField, ThemePicker, inputClass } from '../fields.js';
import { blankToNull } from '../model.js';
import { modeCopy, statusCopy } from '../labels.js';
import type { ItineraryMode } from '../../contracts/types.js';

export function TripInfo(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  const scheduled = mode !== 'destination_guide';
  return (
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
        <LocaleField id={`${recordId}-locale`} meta={meta('trip.language', mode)} value={props.localeInput} onChange={props.onLocaleChange} error={props.localeError} help={statusCopy.languageUnresolved} unresolved={props.language.source === 'unresolved'} needsSupport={false} locale={props.language.outputLanguage} showDetect={props.language.source === 'unresolved'} busy={props.busy} dirty={props.dirty} proposal={props.languageProposal} onDetect={props.onDetectLanguage} onAccept={props.onAcceptLanguage} />
      </div>
    </section>
  );
}
