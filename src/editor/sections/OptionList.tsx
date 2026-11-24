import React, { useEffect, useRef, useState } from 'react';
import { buttonClass, inputClass } from '../fields.js';
import { moveIndex } from '../model.js';
import type { FieldMeta } from '../schema-meta.js';
import { presetsFor, type OptionGroup } from '../practicalOptions.js';

export function OptionList({ id, meta, group, language, values, onChange }: {
  id: string; meta: FieldMeta; group: OptionGroup; language: string | null; values: string[]; onChange: (values: string[]) => void;
}) {
  const presets = presetsFor(language, group);
  type Row = { id: string; kind: 'preset' | 'custom'; value: string };
  const makeRows = (items: string[]): Row[] => items.map((value, index) => ({ id: `${id}-row-${index}`, kind: presets.includes(value) ? 'preset' : 'custom', value }));
  const [rows, setRows] = useState<Row[]>(() => makeRows(values));
  const nextId = useRef(values.length);
  const valueKey = JSON.stringify(values);
  const presetKey = JSON.stringify(presets);
  const previousProps = useRef({ id, valueKey, presetKey });
  const emittedValueKey = useRef<string | null>(null);
  const focusId = useRef<string | null>(null);
  const root = useRef<HTMLFieldSetElement>(null);

  // Reconcile only genuine parent record changes. Own keystroke updates are
  // tagged so a custom row equal to a preset does not get reclassified mid-edit.
  useEffect(() => {
    const recordChanged = id !== previousProps.current.id;
    const incomingChanged = valueKey !== previousProps.current.valueKey && valueKey !== emittedValueKey.current;
    const presetsChanged = presetKey !== previousProps.current.presetKey;
    if (recordChanged || incomingChanged) {
      setRows(makeRows(values));
      nextId.current = values.length;
    }
    else if (presetsChanged) setRows((current) => current.map((row) => row.kind === 'preset' && !presets.includes(row.value) ? { ...row, kind: 'custom' } : row));
    previousProps.current = { id, valueKey, presetKey };
    if (valueKey === emittedValueKey.current) emittedValueKey.current = null;
  }, [id, valueKey, presetKey]);

  useEffect(() => {
    if (!focusId.current) return;
    root.current?.querySelector<HTMLTextAreaElement>(`#${CSS.escape(focusId.current)}`)?.focus();
    focusId.current = null;
  }, [rows]);

  const emit = (next: Row[]) => {
    setRows(next);
    const nextValues = next.map((row) => row.value);
    emittedValueKey.current = JSON.stringify(nextValues);
    onChange(nextValues);
  };

  const toggle = (preset: string, checked: boolean) => {
    if (checked) {
      const matchingCustom = rows.find((row) => row.kind === 'custom' && row.value === preset);
      if (matchingCustom) emit(rows.map((row) => row.id === matchingCustom.id ? { ...row, kind: 'preset' } : row));
      else emit([...rows, { id: `${id}-row-${nextId.current++}`, kind: 'preset', value: preset }]);
    }
    else emit(rows.filter((row) => !(row.kind === 'preset' && row.value === preset)));
  };

  const customRows = rows.filter((row) => row.kind === 'custom');
  const selectedPresets = new Set(rows.filter((row) => row.kind === 'preset').map((row) => row.value));
  const customMax = Math.max(0, (meta.maxItems ?? 30) - rows.filter((row) => row.kind === 'preset').length);
  const updateCustom = (index: number, value: string) => emit(rows.map((row, rowIndex) => row.kind === 'custom' && customRows.indexOf(row) === index ? { ...row, value } : row));
  const removeCustom = (index: number) => {
    const row = customRows[index];
    if (!row || !globalThis.confirm(`Hapus ${meta.label.toLowerCase()} baris ${index + 1}?`)) return;
    const remaining = customRows.filter((item) => item.id !== row.id);
    focusId.current = remaining[Math.max(0, index - 1)]?.id ?? null;
    emit(rows.filter((item) => item.id !== row.id));
  };
  const moveCustom = (index: number, delta: number) => {
    const moved = moveIndex(customRows, index, delta);
    const slots = rows.map((row, rowIndex) => row.kind === 'custom' ? rowIndex : -1).filter((rowIndex) => rowIndex >= 0);
    const next = [...rows];
    slots.forEach((slot, customIndex) => { next[slot] = moved[customIndex]; });
    emit(next);
  };
  const addCustom = () => {
    if (customRows.length >= customMax) return;
    const row = { id: `${id}-row-${nextId.current++}`, kind: 'custom' as const, value: '' };
    focusId.current = row.id;
    emit([...rows, row]);
  };
  return (
    <fieldset ref={root} data-option-list={group} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">{meta.label}</legend>
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const checked = selectedPresets.has(preset);
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
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        {customRows.map((row, index) => (
          <div className="flex items-start gap-2" key={row.id}>
            <label className="sr-only" htmlFor={row.id}>{meta.label}, baris {index + 1}</label>
            <textarea id={row.id} rows={2} value={row.value} maxLength={meta.maxLength} onChange={(event) => updateCustom(index, event.target.value)} className={`${inputClass} mt-0`} data-field-path={meta.path} />
            <div className="flex flex-col gap-1">
              <button type="button" aria-label={`Naikkan ${meta.label} ${index + 1}`} disabled={index === 0} className={buttonClass} onClick={() => moveCustom(index, -1)}>↑</button>
              <button type="button" aria-label={`Turunkan ${meta.label} ${index + 1}`} disabled={index === customRows.length - 1} className={buttonClass} onClick={() => moveCustom(index, 1)}>↓</button>
              <button type="button" aria-label={`Hapus ${meta.label} ${index + 1}`} className={buttonClass} onClick={() => removeCustom(index)}>Hapus</button>
            </div>
          </div>
        ))}
        <button type="button" disabled={customRows.length >= customMax} onClick={addCustom} className={buttonClass}>Tambah {meta.label.toLowerCase()}</button>
      </div>
    </fieldset>
  );
}
