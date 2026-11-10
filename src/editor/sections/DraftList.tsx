import React from 'react';
import { modeCopy } from '../labels.js';

export function DraftList({ records, modeCopyBadge, onOpen, busy }: {
  records: Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>;
  modeCopyBadge: Record<string, string>; onOpen: (id: string) => void; busy: boolean;
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
    <ul className="mt-4 space-y-2">
      {records.map((item) => (
        <li key={item.id}>
          <button type="button" disabled={busy} onClick={() => onOpen(item.id)} className="w-full rounded-md border border-slate-200 p-3 text-left hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">
            <span className="block font-medium">{item.title || 'Tanpa judul'}</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${modeCopyBadge[item.mode] ?? 'bg-slate-100 text-slate-900'}`}>{modeCopy[item.mode]?.title ?? item.mode.replaceAll('_', ' ')}</span>
            <span className="mt-1 block text-xs text-slate-500">diubah {relativeText(item.updatedAt)} · revisi {item.revision}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
