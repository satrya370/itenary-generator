import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { DayCard } from './DayCard.js';
import { buttonClass } from '../fields.js';
import { makeDay, moveById, renumberDays } from '../model.js';

export function MultiDay(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
      <section data-editor-section="days" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Hari demi hari</h3>
          <button type="button" className={buttonClass} disabled={content.days.length >= (meta('days[].title', mode).maxItems ?? 14)} onClick={() => patch((n) => { n.days.push(makeDay('multi_day', n.days.length + 1)); })}>Tambah hari</button>
        </div>
        {content.days.map((day, index) => (
          <DayCard key={day.id} onUploadAsset={props.onUploadAsset} day={day} mode={mode} recordId={recordId} assets={assets} meta={meta} patch={patch} aiAction={props.aiAction} showHotel showTransfer showDayControls isFirst={index === 0} isLast={index === content.days.length - 1}
            onMove={(delta) => patch((n) => { n.days = renumberDays(moveById(n.days, day.id, delta)); })}
            onRemove={() => { if (content.days.length > 2 && globalThis.confirm('Hapus hari ini beserta aktivitasnya?')) patch((n) => { n.days = renumberDays(n.days.filter((x) => x.id !== day.id)); }); }} />
        ))}
        <p className="text-xs text-slate-500">{content.days.length} hari</p>
      </section>
  );
}
