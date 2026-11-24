import React, { useState } from 'react';
import templates from '../../../config/web/import-templates.json' with { type: 'json' };
import type { ItineraryMode } from '../../contracts/types.js';
import { buttonClass } from '../fields.js';
import { importCopy } from './copy.js';

/** Three mode-specific examples are offered for each itinerary mode. */
const FORMATS_BY_MODE: Record<ItineraryMode, string[]> = {
  half_day: ['F1', 'F3', 'F4'], full_day: ['F1', 'F3', 'F4'], multi_day: ['F2', 'F3', 'F4'], destination_guide: ['F1', 'F2', 'F3'], activity: ['F1', 'F2', 'F3']
};
const LOCALES = ['id', 'en'] as const;
type Template = { name?: string; lines: string[] };
type Templates = Record<string, Record<string, Record<string, Template>>>;

/** The supported formats for one mode, with an example that can be copied. The examples are checked by the parser in tests. */
export function ImportFormats({ id, mode, pdf }: { id: string; mode: ItineraryMode; pdf: boolean }) {
  const formats = FORMATS_BY_MODE[mode] ?? ['F1'];
  const [picked, setPicked] = useState(formats[0]);
  const [locale, setLocale] = useState<(typeof LOCALES)[number]>('id');
  const [status, setStatus] = useState<string | null>(null);
  const format = formats.includes(picked) ? picked : formats[0];
  const selectedTemplate = (templates as unknown as { locales: Templates }).locales[locale]?.[mode]?.[format];
  const formatName = selectedTemplate?.name ?? importCopy.formatNames[format] ?? format;
  const example = (selectedTemplate?.lines ?? []).join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(example);
      setStatus(importCopy.formatCopied);
    } catch {
      setStatus(importCopy.formatCopyFailed);
    }
  }

  return (
    <section id={id} aria-label={importCopy.formatsTitle} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h3 className="font-semibold text-slate-900">{importCopy.formatsTitle}</h3>
      <p className="text-slate-700">{importCopy.formatsHint}</p>
      {pdf && <p className="text-slate-700">{importCopy.formatPdfNote}</p>}
      <div role="tablist" aria-label={importCopy.formatsTitle} className="flex flex-wrap gap-2">
        {formats.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={item === format} onClick={() => { setPicked(item); setStatus(null); }}
            className={`min-h-[44px] rounded-md border px-3 text-sm ${item === format ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-400 bg-white text-slate-900'}`}>
            {((templates as unknown as { locales: Templates }).locales[locale]?.[mode]?.[item]?.name) ?? importCopy.formatNames[item] ?? item}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={importCopy.formatLanguage.id}>
        {LOCALES.map((item) => (
          <button key={item} type="button" aria-pressed={item === locale} onClick={() => { setLocale(item); setStatus(null); }}
            className={`min-h-[44px] rounded-md border px-3 text-sm ${item === locale ? 'border-teal-700 bg-teal-50 text-teal-950' : 'border-slate-400 bg-white text-slate-900'}`}>
            {importCopy.formatLanguage[item]}
          </button>
        ))}
      </div>
      <pre aria-label={formatName} tabIndex={0} className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900">{example}</pre>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} onClick={copy}>{importCopy.formatCopy}</button>
        {status && <span role="status" className="text-slate-700">{status}</span>}
      </div>
    </section>
  );
}
