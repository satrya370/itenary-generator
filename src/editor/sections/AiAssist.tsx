import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextList, inputClass } from '../fields.js';

export function AiAssist(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="ai-assist" className="space-y-4">
      <details>
        <summary className="cursor-pointer font-semibold">Bantuan AI</summary>
        <div className="mt-3 space-y-3">
          <label htmlFor={`${recordId}-brief`} className="block text-sm font-medium">Brief perjalanan</label>
          <textarea id={`${recordId}-brief`} rows={4} value={props.writing.brief} maxLength={20000} onChange={(e) => props.onWritingChange({ ...props.writing, brief: e.target.value })} className={inputClass} data-field-path="writing.brief" />
          <TextList id={`${recordId}-fact-notes`} meta={{ path: 'writing.notes[]', labelKey: 'factNotes', label: 'Catatan fakta itinerary', control: 'repeater', required: false, applies: true, maxLength: 4000, maxItems: 100 }} values={props.writing.notes.filter((n) => n.targetId === 'itinerary').map((n) => n.text)}
            onChange={(values) => props.onWritingChange({ ...props.writing, notes: [...props.writing.notes.filter((n) => n.targetId !== 'itinerary'), ...values.map((text) => ({ targetId: 'itinerary', text }))] })} />
          {props.aiAssistExtra}
        </div>
      </details>
    </section>
  );
}
