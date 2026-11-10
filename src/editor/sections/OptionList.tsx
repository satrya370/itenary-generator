import React from 'react';
import { TextList } from '../fields.js';
import type { FieldMeta } from '../schema-meta.js';
import { presetsFor, type OptionGroup } from '../practicalOptions.js';

export function OptionList({ id, meta, group, language, values, onChange }: {
  id: string; meta: FieldMeta; group: OptionGroup; language: string | null; values: string[]; onChange: (values: string[]) => void;
}) {
  const presets = presetsFor(language, group);
  const custom = values.filter((value) => !presets.includes(value));
  const toggle = (preset: string, checked: boolean) => {
    if (checked) onChange([...values, preset]);
    else onChange(values.filter((value) => value !== preset));
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">{meta.label}</legend>
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const checked = values.includes(preset);
            return (
              <label key={preset} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${checked ? 'border-teal-700 bg-teal-50 font-medium' : 'border-slate-300'} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-700`}>
                <input type="checkbox" checked={checked} onChange={(event) => toggle(preset, event.target.checked)} className="h-4 w-4" data-field-path={meta.path} />
                {preset}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-600">Pilih bahasa konten untuk melihat pilihan umum.</p>
      )}
      <p className="text-xs text-slate-600">Lainnya (ketik sendiri):</p>
      <TextList id={`${id}-custom`} meta={meta} hideLegend values={custom} onChange={(next) => onChange([...values.filter((value) => presets.includes(value)), ...next])} />
    </fieldset>
  );
}
