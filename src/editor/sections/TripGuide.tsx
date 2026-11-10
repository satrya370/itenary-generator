import React, { useState } from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextField } from '../fields.js';
import { blankToNull } from '../model.js';

export function TripGuide(props: EditorProps) {
  const { content, mode, recordId, meta, patch, guides } = props;
  const matched = guides.find((guide) => guide.name === content.guide.name && guide.phone === content.guide.phone);
  const [manual, setManual] = useState(!matched && guides.length === 0 ? true : false);
  const choice = manual ? 'manual' : matched?.id ?? (guides.length ? '' : 'manual');
  return (
    <section data-editor-section="trip-guide" className="space-y-4">
      <h3 className="font-semibold">Guide trip</h3>
      {guides.length > 0 && (
        <div>
          <label htmlFor={`${recordId}-guide-pick`} className="block text-sm font-medium">Pilih guide</label>
          <select id={`${recordId}-guide-pick`} value={choice} onChange={(event) => {
            const value = event.target.value;
            if (value === 'manual') { setManual(true); return; }
            const picked = guides.find((guide) => guide.id === value);
            setManual(false);
            if (picked) patch((n) => { n.guide.name = blankToNull(picked.name); n.guide.phone = blankToNull(picked.phone); });
          }} className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm">
            <option value="">Pilih dari daftar</option>
            {guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.name}</option>)}
            <option value="manual">Isi manual</option>
          </select>
        </div>
      )}
      {(manual || guides.length === 0 || !matched) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={`${recordId}-guide-name`} meta={meta('guide.name', mode)} value={content.guide.name} onChange={(v) => patch((n) => { n.guide.name = blankToNull(v); })} />
          <TextField id={`${recordId}-guide-phone`} meta={meta('guide.phone', mode)} value={content.guide.phone} onChange={(v) => patch((n) => { n.guide.phone = blankToNull(v); })} />
        </div>
      )}
      <p className="text-xs text-slate-500">kosongkan jika sama dengan kontak agensi</p>
    </section>
  );
}
