import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { TextArea } from '../fields.js';
import { blankToNull } from '../model.js';

export function Closing(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="closing" className="space-y-4">
      <h3 className="font-semibold">Ketentuan & penutup</h3>
      <TextArea id={`${recordId}-policies`} meta={meta('policies', mode)} value={content.policies} onChange={(v) => patch((n) => { n.policies = blankToNull(v); })} />
      <TextArea id={`${recordId}-closing-note`} meta={meta('closingNote', mode)} value={content.closingNote} onChange={(v) => patch((n) => { n.closingNote = blankToNull(v); })} />
      <TextArea id={`${recordId}-disclaimer`} meta={meta('disclaimer', mode)} value={content.disclaimer} onChange={(v) => patch((n) => { n.disclaimer = blankToNull(v); })} />
    </section>
  );
}
