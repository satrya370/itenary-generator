import React from 'react';
import { presetsFor } from '../practicalOptions.js';

export function policyLines(text: string | null): string[] {
  return text ? text.split('\n').filter((line) => line.trim() !== '') : [];
}

export function PolicyOptions({ language, policies, onChange }: {
  language: string | null; policies: string | null; onChange: (next: string | null) => void;
}) {
  const presets = presetsFor(language, 'policies');
  if (presets.length === 0) return <p className="text-xs text-slate-600">Pilih bahasa konten untuk melihat pilihan syarat & ketentuan umum.</p>;
  const lines = policyLines(policies);
  const toggle = (preset: string, checked: boolean) => {
    const next = checked ? [...lines, preset] : lines.filter((line) => line !== preset);
    onChange(next.length ? next.join('\n') : null);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Pilih syarat & ketentuan umum</legend>
      <div className="space-y-2">
        {presets.map((preset) => (
          <label key={preset} className="flex cursor-pointer items-start gap-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-700">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={lines.includes(preset)} onChange={(event) => toggle(preset, event.target.checked)} data-field-path="policies" />
            <span>{preset}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
