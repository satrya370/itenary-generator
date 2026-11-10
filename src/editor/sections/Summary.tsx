import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextArea } from '../fields.js';

export function Summary(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="summary" className="space-y-4">
      <h3 className="font-semibold">Ringkasan</h3>
      <TextArea id={`${recordId}-summary`} meta={meta('summary', mode)} value={content.summary} onChange={(v) => patch((n) => { n.summary = v ?? ''; })} />
      {props.aiAction('overview.summary', 'Buat dengan AI', 'overview', undefined, (text) => patch((n) => { n.summary = text; }))}
    </section>
  );
}
