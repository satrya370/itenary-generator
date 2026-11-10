import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextField } from '../fields.js';
import { blankToNull } from '../model.js';

export function TripGuide(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="trip-guide" className="space-y-4">
      <h3 className="font-semibold">Guide trip</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={`${recordId}-guide-name`} meta={meta('guide.name', mode)} value={content.guide.name} onChange={(v) => patch((n) => { n.guide.name = blankToNull(v); })} />
        <TextField id={`${recordId}-guide-phone`} meta={meta('guide.phone', mode)} value={content.guide.phone} onChange={(v) => patch((n) => { n.guide.phone = blankToNull(v); })} />
        <p className="text-xs text-slate-500 sm:col-span-2">kosongkan jika sama dengan kontak agensi</p>
      </div>
    </section>
  );
}
