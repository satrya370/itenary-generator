import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextField, buttonClass } from '../fields.js';
import { OptionList } from './OptionList.js';
import { moveIndex } from '../model.js';

export function Practical(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="practical" className="space-y-4">
      <h3 className="font-semibold">Info praktis</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <OptionList id={`${recordId}-included`} meta={meta('included[]', mode)} group="included" language={content.trip.language} values={content.included} onChange={(values) => patch((n) => { n.included = values; })} />
        <OptionList id={`${recordId}-not-included`} meta={meta('notIncluded[]', mode)} group="notIncluded" language={content.trip.language} values={content.notIncluded} onChange={(values) => patch((n) => { n.notIncluded = values; })} />
        <OptionList id={`${recordId}-what-to-bring`} meta={meta('whatToBring[]', mode)} group="whatToBring" language={content.trip.language} values={content.whatToBring} onChange={(values) => patch((n) => { n.whatToBring = values; })} />
        <OptionList id={`${recordId}-not-suitable`} meta={meta('notSuitableFor[]', mode)} group="notSuitableFor" language={content.trip.language} values={content.notSuitableFor} onChange={(values) => patch((n) => { n.notSuitableFor = values; })} />
        <OptionList id={`${recordId}-not-allowed`} meta={meta('notAllowed[]', mode)} group="notAllowed" language={content.trip.language} values={content.notAllowed} onChange={(values) => patch((n) => { n.notAllowed = values; })} />
        <OptionList id={`${recordId}-local-tips`} meta={meta('localTips[]', mode)} group="localTips" language={content.trip.language} values={content.localTips} onChange={(values) => patch((n) => { n.localTips = values; })} />
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">{meta('emergencyContacts[].label', mode).label}</legend>
          {content.emergencyContacts.map((contact, index) => (
            <div key={`${recordId}-emergency-${index}`} className="grid gap-3 sm:grid-cols-2">
              <TextField id={`${recordId}-emergency-label-${index}`} meta={meta('emergencyContacts[].label', mode)} value={contact.label} onChange={(v) => patch((n) => { n.emergencyContacts[index] = { ...n.emergencyContacts[index], label: v ?? '' }; })} />
              <TextField id={`${recordId}-emergency-value-${index}`} meta={meta('emergencyContacts[].value', mode)} value={contact.value} onChange={(v) => patch((n) => { n.emergencyContacts[index] = { ...n.emergencyContacts[index], value: v ?? '' }; })} />
              <div className="flex gap-2 sm:col-span-2">
                <button type="button" className={buttonClass} aria-label={`Naikkan kontak darurat ${index + 1}`} disabled={index === 0} onClick={() => patch((n) => { n.emergencyContacts = moveIndex(n.emergencyContacts, index, -1); })}>Naikkan</button>
                <button type="button" className={buttonClass} aria-label={`Turunkan kontak darurat ${index + 1}`} disabled={index === content.emergencyContacts.length - 1} onClick={() => patch((n) => { n.emergencyContacts = moveIndex(n.emergencyContacts, index, 1); })}>Turunkan</button>
                <button type="button" className={buttonClass} onClick={() => { if (globalThis.confirm(`Hapus kontak darurat ${index + 1}?`)) patch((n) => { n.emergencyContacts = n.emergencyContacts.filter((_, i) => i !== index); }); }}>Hapus kontak {index + 1}</button>
              </div>
            </div>
          ))}
          <button type="button" className={buttonClass} disabled={content.emergencyContacts.length >= (meta('emergencyContacts[].label', mode).maxItems ?? 30)} onClick={() => patch((n) => { n.emergencyContacts.push({ label: '', value: '' }); })}>Tambah {meta('emergencyContacts[].label', mode).label.toLowerCase()}</button>
        </fieldset>
      </div>
    </section>
  );
}
