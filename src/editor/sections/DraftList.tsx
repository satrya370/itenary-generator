import React from 'react';
import { modeCopy } from '../labels.js';

export function DraftList({ records, onOpen, busy }: {
  records: Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>;
  onOpen: (id: string) => void; busy: boolean;
}) {
  const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  function relativeText(iso: string): string {
    const date = new Date(iso).getTime();
    if (Number.isNaN(date)) return '';
    const diffSeconds = Math.round((date - Date.now()) / 1000);
    if (Math.abs(diffSeconds) < 3600) {
      const minutes = Math.round(diffSeconds / 60);
      if (Math.abs(minutes) < 1) return relative.format(0, 'minute');
      return relative.format(minutes, 'minute');
    }
    if (Math.abs(diffSeconds) < 86400) return relative.format(Math.round(diffSeconds / 3600), 'hour');
    if (Math.abs(diffSeconds) < 86400 * 30) return relative.format(Math.round(diffSeconds / 86400), 'day');
    return new Date(iso).toLocaleDateString('id');
  }
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {records.map((item) => (
        <li key={item.id}>
          <button type="button" disabled={busy} onClick={() => onOpen(item.id)} className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:bg-teal-100 disabled:opacity-50">
            <span className="min-w-0"><span className="block break-words font-medium text-slate-900">{item.title || 'Tanpa judul'}</span>
            <span className="mt-1 block text-sm text-slate-600">{modeCopy[item.mode]?.title ?? item.mode.replaceAll('_', ' ')} · diubah {relativeText(item.updatedAt)}</span></span>
            <span aria-hidden="true" className="text-xl text-slate-400">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
