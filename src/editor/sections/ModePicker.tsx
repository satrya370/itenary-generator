import React from 'react';
import type { ItineraryMode } from '../../contracts/types.js';
import { modeCopy } from '../labels.js';

export function ModePicker({ onCreate, busy }: { onCreate: (mode: ItineraryMode) => void; busy: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(modeCopy).map(([mode, copy]) => (
        <button key={mode} type="button" data-mode-card={mode} disabled={busy} onClick={() => onCreate(mode as ItineraryMode)}
          className="rounded-xl border border-slate-200 p-4 text-left hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${copy.badge}`}>{copy.title}</span>
          <span className="mt-1 block text-sm text-slate-600">{copy.description}</span>
          <span className="mt-1 block text-xs text-slate-500">Contoh: {copy.example}</span>
        </button>
      ))}
    </div>
  );
}
