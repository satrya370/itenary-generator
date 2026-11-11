import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import type { FieldMeta } from '../schema-meta.js';
import { IssueText, useIssue } from '../issues.js';
import { fieldClass } from '../fields.js';

export interface PlaceSuggestion { placeId: string; mainText: string; secondaryText: string }

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const SUPPORTED = new Set(['id', 'en', 'fr', 'ja', 'zh-Hans', 'la']);

/** The draft's content language as the Places request wants it; "auto" or unknown tags send no language. */
export function placeLanguageOf(tag: string | null | undefined): string | null {
  return tag && SUPPORTED.has(tag) ? tag : null;
}

/** Maps search link that keeps the Places ID (PD-1). The Maps link field stays editable. */
export function mapsUrlFor(suggestion: PlaceSuggestion): string {
  const query = suggestion.secondaryText ? `${suggestion.mainText}, ${suggestion.secondaryText}` : suggestion.mainText;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(suggestion.placeId)}`;
}

/** Keyboard-first combobox. The input is free text at all times; a suggestion only fills it. */
export function PlaceAutocomplete({ id, meta, value, onChange, onPick, languageCode }: {
  id: string; meta: FieldMeta; value: string | null | undefined; onChange: (value: string | null) => void;
  onPick?: (suggestion: PlaceSuggestion) => void; languageCode: string | null;
}) {
  const issue = useIssue(meta.path);
  const { onBlur: touch, ...issueProps } = issue.inputProps;
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const skipRef = useRef<string | null>(null);
  const listId = `${id}-places`;
  const noteId = `${id}-places-note`;
  const text = (value ?? '').trim();

  useEffect(() => {
    const current = ++requestRef.current;
    if (skipRef.current !== null && skipRef.current === text) { skipRef.current = null; return; }
    if (!focused || disabled || text.length < MIN_CHARS) {
      setItems([]); setOpen(false); setActive(-1); setNote(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      sessionRef.current ??= crypto.randomUUID();
      try {
        const result = await api.placesAutocomplete(text, sessionRef.current, languageCode);
        if (current !== requestRef.current) return;
        setItems(result.suggestions); setOpen(result.suggestions.length > 0); setActive(-1);
        setNote(result.suggestions.length > 0 ? null : 'Tidak ada tempat yang cocok; tetap bisa diketik manual.');
      } catch (cause) {
        if (current !== requestRef.current) return;
        const code = (cause as { body?: { code?: string } }).body?.code;
        setItems([]); setOpen(false); setActive(-1);
        if (code === 'PLACES_UNAVAILABLE') setDisabled(true);
        setNote((cause as Error).message);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, focused, disabled, languageCode]);

  function pick(suggestion: PlaceSuggestion) {
    requestRef.current += 1;
    sessionRef.current = null;
    skipRef.current = suggestion.mainText;
    onChange(suggestion.mainText);
    onPick?.(suggestion);
    setItems([]); setOpen(false); setActive(-1); setNote(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!open || items.length === 0) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index <= 0 ? items.length - 1 : index - 1)); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); pick(items[active]); }
  }

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{meta.label}{meta.required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        value={value ?? ''}
        maxLength={meta.maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setOpen(false); touch(); }}
        onChange={(event) => { skipRef.current = null; onChange(event.target.value); }}
        onKeyDown={onKeyDown}
        className={fieldClass(Boolean(issue.message))}
        data-field-path={meta.path}
        aria-describedby={[issue.message ? `${id}-issue` : null, note ? noteId : null].filter(Boolean).join(' ') || undefined}
        {...issueProps}
      />
      {open && items.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg">
          <ul id={listId} role="listbox" aria-label={`Saran ${meta.label}`}>
            {items.map((suggestion, index) => (
              <li key={suggestion.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === active} onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }} className={`cursor-pointer px-3 py-2 text-sm ${index === active ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                <span className="font-medium">{suggestion.mainText}</span>
                {suggestion.secondaryText && <span className="block text-xs text-slate-600">{suggestion.secondaryText}</span>}
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-200 px-3 py-1 text-right text-[11px] text-slate-500" data-places-attribution>Powered by Google</p>
        </div>
      )}
      {note && <p id={noteId} aria-live="polite" className="mt-1 text-xs text-slate-600">{note}</p>}
      <IssueText id={`${id}-issue`} message={issue.message} />
    </div>
  );
}

