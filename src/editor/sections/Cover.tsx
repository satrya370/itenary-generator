import React from 'react';
import type { EditorProps } from '../EditorForm.js';
import { PhotoField } from '../fields.js';
import { setPhotoAsset, setPhotoCredit } from '../model.js';
import { statusCopy } from '../labels.js';

export function Cover(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
    <section data-editor-section="cover" className="space-y-4">
      <h3 className="font-semibold">Foto sampul</h3>
      <PhotoField onUpload={props.onUploadAsset} id={`${recordId}-cover`} basePath="cover" mode={mode} meta={meta} photo={content.cover} assets={assets} emptyText={statusCopy.noCover}
        onAsset={(v) => patch((n) => { n.cover = setPhotoAsset(n.cover, v); })}
        onCredit={(k, v) => patch((n) => { n.cover = setPhotoCredit(n.cover, k, v); })} />
    </section>
  );
}
