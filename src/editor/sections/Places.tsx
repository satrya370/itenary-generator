import React from 'react';
import { ItemScope } from '../issues.js';
import type { EditorProps } from '../EditorForm.js';
import { PhotoField, TextArea, TextField, TextList, buttonClass } from '../fields.js';
import { blankToNull, makePlace, moveById, setPhotoAsset, setPhotoCredit } from '../model.js';
import { statusCopy } from '../labels.js';

export function Places(props: EditorProps) {
  const { content, mode, recordId, assets, meta, patch } = props;
  return (
      <section data-editor-section="places" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Tempat</h3>
          <button type="button" className={buttonClass} onClick={() => patch((n) => { n.places.push(makePlace()); })}>Tambah tempat</button>
        </div>
        {content.places.map((place, index) => {
          const showHeading = place.group !== null && (index === 0 || place.group !== content.places[index - 1].group);
          return (
            <React.Fragment key={place.id}>
            {showHeading && <h4 className="text-base font-bold">{place.group}</h4>}
            <ItemScope id={place.id}><fieldset className="space-y-4 rounded-xl border border-slate-300 p-4" data-target-id={place.id} tabIndex={-1}>
              <legend className="px-2 font-semibold">Tempat {index + 1}</legend>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} disabled={index === 0} onClick={() => patch((n) => { n.places = moveById(n.places, place.id, -1); })}>Naikkan</button>
                <button type="button" className={buttonClass} disabled={index === content.places.length - 1} onClick={() => patch((n) => { n.places = moveById(n.places, place.id, 1); })}>Turunkan</button>
                <button type="button" className={buttonClass} onClick={() => { if (globalThis.confirm('Hapus tempat ini?')) patch((n) => { n.places = n.places.filter((x) => x.id !== place.id); }); }}>Hapus tempat</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TextField id={`${recordId}-place-name-${place.id}`} meta={meta('places[].name', mode)} value={place.name} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.name = v ?? ''; })} />
                <TextField id={`${recordId}-place-area-${place.id}`} meta={meta('places[].area', mode)} value={place.area} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.area = v ?? ''; })} />
                <TextField id={`${recordId}-place-group-${place.id}`} meta={meta('places[].group', mode)} value={place.group} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.group = blankToNull(v); })} />
                <TextArea id={`${recordId}-place-description-${place.id}`} meta={meta('places[].description', mode)} value={place.description} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.description = v ?? ''; })} />
                {props.aiAction(`place:${place.id}`, 'Buat dengan AI', 'description', { kind: 'place', id: place.id }, (text) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.description = text; }))}
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Detail tambahan</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextField id={`${recordId}-place-duration-${place.id}`} meta={meta('places[].suggestedDuration', mode)} value={place.suggestedDuration} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.suggestedDuration = blankToNull(v); })} />
                  <TextField id={`${recordId}-place-besttime-${place.id}`} meta={meta('places[].bestTime', mode)} value={place.bestTime} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.bestTime = blankToNull(v); })} />
                  <TextArea id={`${recordId}-place-getting-${place.id}`} meta={meta('places[].gettingThere', mode)} value={place.gettingThere} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.gettingThere = blankToNull(v); })} />
                  <TextField id={`${recordId}-place-nearby-${place.id}`} meta={meta('places[].nearby', mode)} value={place.nearby} onChange={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.nearby = blankToNull(v); })} />
                  <TextList id={`${recordId}-place-tips-${place.id}`} meta={meta('places[].tips[]', mode)} values={place.tips} onChange={(values) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.tips = values; })} />
                  <PhotoField onUpload={props.onUploadAsset} id={`${recordId}-place-photo-${place.id}`} basePath="places[].photo" mode={mode} meta={meta} photo={place.photo} assets={assets} emptyText={statusCopy.noPhoto}
                    onAsset={(v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.photo = setPhotoAsset(p.photo, v); })}
                    onCredit={(k, v) => patch((n) => { const p = n.places.find((x) => x.id === place.id); if (p) p.photo = setPhotoCredit(p.photo, k, v); })} />
                </div>
              </details>
            </fieldset></ItemScope>
            </React.Fragment>
          );
        })}
      </section>
  );
}
