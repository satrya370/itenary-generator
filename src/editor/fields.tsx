import React, { useEffect, useRef } from 'react';
import type { FieldMeta } from './schema-meta.js';
import { moveIndex } from './model.js';
import type { AssetDto, LanguageResolutionDto } from '../api/client.js';
import type { ItineraryMode, Photo } from '../contracts/types.js';
import type { MetaFn } from './EditorForm.js';
import { statusCopy, themeNames } from './labels.js';
import palettes from '../../config/palettes.json' with { type: 'json' };

export const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700 disabled:bg-slate-100';
export const buttonClass = 'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
export const primaryClass = 'rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50';

export function TextField({ id, meta, value, onChange, type = 'text' }: {
  id: string; meta: FieldMeta; value: string | null | undefined; onChange: (value: string | null) => void; type?: 'text' | 'url' | 'date' | 'time';
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <input id={id} type={type} value={value ?? ''} maxLength={meta.maxLength} required={meta.required} onChange={(event) => onChange(event.target.value)} className={inputClass} data-field-path={meta.path} />
    </div>
  );
}

export function TextArea({ id, meta, value, onChange, rows = 3 }: {
  id: string; meta: FieldMeta; value: string | null | undefined; onChange: (value: string | null) => void; rows?: number;
}) {
  return (
    <div className="min-w-0 sm:col-span-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <textarea id={id} rows={rows} value={value ?? ''} maxLength={meta.maxLength} required={meta.required} onChange={(event) => onChange(event.target.value)} className={inputClass} data-field-path={meta.path} />
    </div>
  );
}

export function TimeField({ id, meta, value, onChange }: {
  id: string; meta: FieldMeta; value: string | null; onChange: (value: string | null) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <input id={id} type="time" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className={inputClass} data-field-path={meta.path} />
    </div>
  );
}

export function NumberField({ id, meta, value, onChange }: {
  id: string; meta: FieldMeta; value: number | null; onChange: (value: number | null) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <input id={id} type="number" min={1} max={1440} value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} className={inputClass} data-field-path={meta.path} />
    </div>
  );
}

export function Toggle({ id, meta, value, onChange }: {
  id: string; meta: FieldMeta; value: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" data-field-path={meta.path} />
      <label htmlFor={id} className="text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
    </div>
  );
}

export function SelectField({ id, meta, value, choices, onChange }: {
  id: string; meta: FieldMeta; value: string; choices: Array<[string, string]>; onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} data-field-path={meta.path}>
        {choices.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </div>
  );
}

export function TextList({ id, meta, values, onChange }: {
  id: string; meta: FieldMeta; values: string[]; onChange: (values: string[]) => void;
}) {
  const root = useRef<HTMLFieldSetElement>(null);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current !== null) {
      const items = root.current?.querySelectorAll('[data-field-path]');
      (items?.[focusIndex.current] as HTMLElement | undefined)?.focus() ?? (root.current?.querySelector('button:last-child') as HTMLElement | null)?.focus();
    }
    focusIndex.current = null;
  }, [values.length]);
  return (
    <fieldset ref={root} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold">{meta.label}</legend>
      {values.map((value, index) => (
        <div className="flex items-start gap-2" key={`${id}-${index}`}>
          <label className="sr-only" htmlFor={`${id}-${index}`}>{meta.label}, baris {index + 1}</label>
          <textarea id={`${id}-${index}`} rows={2} value={value} maxLength={meta.maxLength} onChange={(event) => onChange(values.map((item, i) => (i === index ? event.target.value : item)))} className={`${inputClass} mt-0`} data-field-path={meta.path} />
          <div className="flex flex-col gap-1">
            <button type="button" aria-label={`Naikkan ${meta.label} ${index + 1}`} disabled={index === 0} className={buttonClass} onClick={() => onChange(moveIndex(values, index, -1))}>↑</button>
            <button type="button" aria-label={`Turunkan ${meta.label} ${index + 1}`} disabled={index === values.length - 1} className={buttonClass} onClick={() => onChange(moveIndex(values, index, 1))}>↓</button>
            <button type="button" aria-label={`Hapus ${meta.label} ${index + 1}`} className={buttonClass} onClick={() => { if (globalThis.confirm(`Hapus ${meta.label.toLowerCase()} baris ${index + 1}?`)) { focusIndex.current = Math.max(0, index - 1); onChange(values.filter((_, i) => i !== index)); } }}>Hapus</button>
          </div>
        </div>
      ))}
      <button type="button" disabled={meta.maxItems !== undefined && values.length >= meta.maxItems} onClick={() => { focusIndex.current = values.length; onChange([...values, '']); }} className={buttonClass}>Tambah {meta.label.toLowerCase()}</button>
    </fieldset>
  );
}

export function AssetSelect({ id, meta, value, assets, onChange }: {
  id: string; meta: FieldMeta; value: string | null; assets: AssetDto[]; onChange: (value: string | null) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className={inputClass} data-field-path={meta.path}>
        <option value="">Tanpa foto</option>
        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename} · {asset.width}×{asset.height}</option>)}
      </select>
    </div>
  );
}

export function ThemePicker({ id, meta, value, onChange }: {
  id: string; meta: FieldMeta; value: string; onChange: (value: string) => void;
}) {
  const palettesMap = (palettes as unknown as { palettes: Record<string, { primary: string; secondary: string }> }).palettes;
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.keys(themeNames).map((key) => (
          <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700 ${value === key ? 'border-teal-700 bg-teal-50 font-medium' : 'border-slate-300'}`}>
            <input type="radio" name={id} value={key} checked={value === key} onChange={() => onChange(key)} className="sr-only" data-field-path={meta.path} />
            <span className="inline-block h-4 w-4 rounded-full border border-slate-300" style={{ background: `linear-gradient(135deg, ${palettesMap[key]?.primary ?? '#333'}, ${palettesMap[key]?.secondary ?? '#666'})` }} aria-hidden="true" />
            {themeNames[key]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}


export function PhotoField({ id, basePath, mode, meta, photo, assets, emptyText, onAsset, onCredit }: {
  id: string; basePath: string; mode: ItineraryMode; meta: MetaFn; photo: Photo | null; assets: AssetDto[]; emptyText: string;
  onAsset: (value: string | null) => void; onCredit: (key: 'photographer' | 'url' | 'source', value: string | null) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AssetSelect id={id} meta={meta(`${basePath}.assetId`, mode)} value={photo?.assetId ?? null} assets={assets} onChange={onAsset} />
      {photo === null ? <p className="self-end text-sm text-slate-600">{emptyText}</p> : (
        <>
          <TextField id={`${id}-photographer`} meta={meta(`${basePath}.credit.photographer`, mode)} value={photo.credit?.photographer ?? ''} onChange={(v) => onCredit('photographer', v)} />
          <TextField id={`${id}-url`} meta={meta(`${basePath}.credit.url`, mode)} value={photo.credit?.url ?? ''} type="url" onChange={(v) => onCredit('url', v)} />
          <TextField id={`${id}-source`} meta={meta(`${basePath}.credit.source`, mode)} value={photo.credit?.source ?? ''} onChange={(v) => onCredit('source', v)} />
        </>
      )}
    </div>
  );
}

export const contentLanguages = [
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-Hans', label: '中文（简体）' },
  { value: 'la', label: 'Latina' }
];

export function LocaleField({ id, meta, value, onChange, error, help, unresolved, showDetect, busy, dirty, proposal, onDetect, onAccept }: {
  id: string; meta: FieldMeta; value: string; onChange: (v: string) => void; error: string; help: string; unresolved: boolean; needsSupport: boolean; locale: string | null;
  showDetect: boolean; busy: boolean; dirty: boolean; proposal: LanguageResolutionDto | null; onDetect: () => void; onAccept: () => void;
}) {
  const known = value === 'auto' || contentLanguages.some((item) => item.value === value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} ${error ? 'border-red-600' : ''}`} aria-invalid={Boolean(error)} aria-describedby={`${id}-help`} data-field-path={meta.path}>
        <option value="auto">Deteksi otomatis</option>
        {contentLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        {!known && <option value={value} disabled>Bahasa tidak didukung: {value}</option>}
      </select>
      <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{unresolved ? help : !known ? 'Pilih salah satu bahasa yang tersedia.' : ''}</p>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-700">{error}</p>}
      {showDetect && <button type="button" disabled={busy || dirty} className={`${buttonClass} mt-2`} onClick={onDetect}>Deteksi otomatis</button>}
      {proposal?.status === 'resolved' && (
        <div className="mt-2 rounded-md bg-teal-50 p-2 text-sm">Proposal bahasa: {proposal.locale}. <button type="button" className="font-semibold text-teal-900 underline" onClick={onAccept}>Konfirmasi bahasa</button></div>
      )}
    </div>
  );
}
