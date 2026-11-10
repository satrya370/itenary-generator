import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { DayCard } from './DayCard.js';

export function DaySchedule(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
      <section data-editor-section="schedule" className="space-y-4">
        <h3 className="font-semibold">Jadwal</h3>
        {content.days.map((day) => (
          <DayCard key={day.id} day={day} mode={mode} recordId={recordId} assets={assets} meta={meta} patch={patch} aiAction={props.aiAction} showHotel={false} showTransfer={false} showDayControls={false} isFirst isLast
            onMove={() => {}} onRemove={() => {}} />
        ))}
      </section>
  );
}
