import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextArea, TextField, TimeField, Toggle } from '../fields.js';
import { blankToNull, pickupOff } from '../model.js';
import { PlaceAutocomplete, mapsUrlFor, placeLanguageOf } from '../fields/PlaceAutocomplete.js';

export function TimeAndMeeting(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
      <section data-editor-section="time-meeting" className="space-y-4">
        <h3 className="font-semibold">Waktu & titik kumpul</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(mode === 'half_day' || mode === 'full_day') && (
            <>
              <TimeField id={`${recordId}-start-time`} meta={meta('trip.startTime', mode)} value={content.trip.startTime} onChange={(v) => patch((n) => { n.trip.startTime = v; })} />
              <TimeField id={`${recordId}-end-time`} meta={meta('trip.endTime', mode)} value={content.trip.endTime} onChange={(v) => patch((n) => { n.trip.endTime = v; })} />
            </>
          )}
          <PlaceAutocomplete id={`${recordId}-meeting-place`} meta={meta('meeting.place', mode)} value={content.meeting.place} languageCode={placeLanguageOf(content.trip.language)} onChange={(v) => patch((n) => { n.meeting.place = blankToNull(v); })} onPick={(suggestion, source) => patch((n) => { n.meeting.mapsUrl = mapsUrlFor(suggestion, source); })} />
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
  );
}
