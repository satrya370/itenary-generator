import React, { useEffect, useRef, useState } from 'react';
import type { ImportApplyDto } from '../../api/client.js';
import type { ItineraryMode } from '../../contracts/types.js';
import { buttonClass, primaryClass } from '../fields.js';
import { modeCopy } from '../labels.js';
import { ImportScreen } from '../import/ImportScreen.js';
import { DEFAULT_IMPORT_LIMITS, type ImportLimits, type ImportStage } from '../import/limits.js';
import { createCopy } from './copy.js';

type Method = 'paste' | 'pdf' | 'manual';
type Result = ImportApplyDto & { target: 'new' };
type Last = { mode: ItineraryMode; method: Method };

const LAST_KEY = 'itinerary-create-last';
const MODES = Object.keys(modeCopy) as ItineraryMode[];
const METHODS: Method[] = ['paste', 'pdf', 'manual'];

function readLast(): Last | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Partial<Last> | null;
    if (parsed && MODES.includes(parsed.mode as ItineraryMode) && METHODS.includes(parsed.method as Method)) return parsed as Last;
  } catch { /* storage unavailable or corrupt: start without a remembered choice */ }
  return null;
}
function writeLast(last: Last) { try { localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* storage unavailable: nothing to remember */ } }

const WAITING_STAGE: ImportStage = { label: createCopy.readFirst, disabled: true, run: () => undefined };

/** The create flow (CP037). Step 1 picks the type, step 2 picks the method and holds the reading screens; the editor is step 3.
 * Typed text and reading results live here, so moving between steps and methods never clears them. Steps use the browser
 * history (#buat/1, #buat/2): Back goes one step, leaving the flow asks first when something was typed. While a request is
 * running, navigation is locked: the server finishes the import even if the screen were left, so the flow must not pretend otherwise. */
export function CreateFlow({ aiActive, busy, limits = DEFAULT_IMPORT_LIMITS, onManual, onImported, onCancel }: {
  aiActive: boolean; busy: boolean; limits?: ImportLimits;
  onManual: (mode: ItineraryMode) => void; onImported: (result: Result) => void; onCancel: () => void;
}) {
  const last = useRef(readLast()).current;
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<ItineraryMode | null>(last?.mode ?? null);
  const [method, setMethod] = useState<Method | null>(last?.method ?? null);
  const [dirty, setDirty] = useState({ paste: false, pdf: false });
  const [importBusy, setImportBusy] = useState({ paste: false, pdf: false });
  const [stages, setStages] = useState<Partial<Record<'paste' | 'pdf', ImportStage>>>({});

  const locked = busy || importBusy.paste || importBusy.pdf;
  const anyDirty = dirty.paste || dirty.pdf;
  const lockedRef = useRef(locked); lockedRef.current = locked;
  const dirtyRef = useRef(anyDirty); dirtyRef.current = anyDirty;
  const stepRef = useRef(step); stepRef.current = step;
  const leaving = useRef(false);
  const onCancelRef = useRef(onCancel); onCancelRef.current = onCancel;

  useEffect(() => {
    if (history.state?.buat !== 1) history.pushState({ buat: 1 }, '', '#buat/1');
    const onPop = (event: PopStateEvent) => {
      if (leaving.current) return;
      const next = (event.state as { buat?: number } | null)?.buat;
      if (lockedRef.current) { history.pushState({ buat: stepRef.current }, '', `#buat/${stepRef.current}`); return; }
      if (!next) {
        if (dirtyRef.current && !window.confirm(createCopy.discardInput)) { history.pushState({ buat: 1 }, '', '#buat/1'); return; }
        leaving.current = true; onCancelRef.current(); return;
      }
      setStep(next === 2 ? 2 : 1);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!leaving.current && location.hash.startsWith('#buat')) history.replaceState(null, '', `${location.pathname}${location.search}`);
    };
  }, []);

  function confirmLeave() { return !dirtyRef.current || window.confirm(createCopy.discardInput); }

  function chooseMode(next: ItineraryMode) {
    setMode(next);
    if (method) writeLast({ mode: next, method });
    history.pushState({ buat: 2 }, '', '#buat/2');
    setStep(2);
  }

  function chooseMethod(next: Method) {
    setMethod(next);
    writeLast({ mode: mode ?? 'half_day', method: next });
  }

  function back() {
    if (locked) return;
    history.back();
  }

  function cancel() {
    if (locked || !confirmLeave()) return;
    leaving.current = true;
    onCancel();
    if (history.state?.buat) history.back();
  }

  const chosenMode: ItineraryMode = mode ?? 'half_day';
  const activeStage: ImportStage | null = method === 'paste' || method === 'pdf' ? (stages[method] ?? WAITING_STAGE) : null;
  const stepNames = createCopy.stepNames;

  return (
    <section aria-label="Buat itinerary baru" className="mx-auto w-full max-w-3xl pb-32">
      <div className="flex items-center gap-2" aria-label={createCopy.stepLabel(step, stepNames[step - 1])}>
        {[1, 2, 3].map((n) => (
          <span key={n} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${n === step ? 'bg-teal-700' : n < step ? 'bg-teal-400' : 'bg-slate-300'}`} />
        ))}
      </div>
      <p className="mt-2 text-sm font-semibold text-teal-800">{createCopy.stepLabel(step, stepNames[step - 1])}</p>
      <h2 className="mt-1 text-2xl font-bold">{step === 1 ? createCopy.typeTitle : createCopy.methodTitle}</h2>

      {step === 1 && (
        <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
          {MODES.map((key) => {
            const copy = modeCopy[key];
            const selected = mode === key;
            return (
              <button key={key} type="button" data-mode-card={key} aria-pressed={selected} disabled={locked} onClick={() => chooseMode(key)}
                className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50 ${selected ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50 active:bg-slate-100'}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{copy.title}</span>
                  {last?.mode === key && <span className="text-xs text-slate-600">{createCopy.lastUsed}</span>}
                </span>
                <span aria-hidden="true" className="text-xl text-slate-400">›</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="mt-5 space-y-5">
          <p className="text-sm text-slate-600">Jenis: <strong>{modeCopy[chosenMode].title}</strong></p>
          <div className="grid gap-3">
            {createCopy.methods.map((item) => {
              const selected = method === item.id;
              return (
                <button key={item.id} type="button" data-method={item.id} aria-pressed={selected} disabled={locked} onClick={() => chooseMethod(item.id)}
                  className={`min-h-[44px] rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60 ${selected ? 'border-teal-700 bg-teal-50 ring-2 ring-teal-600' : 'border-slate-300 bg-white hover:border-teal-600'}`}>
                  <span className="flex items-center gap-2 text-lg font-semibold"><span aria-hidden="true">{item.icon}</span>{item.title}</span>
                  <span className="mt-1 block text-base text-slate-700"><strong>Cocok untuk:</strong> {item.fit}</span>
                  <span className="mt-1 block text-sm text-slate-600"><strong>Yang terjadi:</strong> {item.does}</span>
                </button>
              );
            })}
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <summary className="cursor-pointer font-medium">{createCopy.help}</summary>
            <dl className="mt-3 space-y-3">
              {createCopy.helpItems(limits).map((item) => (
                <div key={item.q}><dt className="font-semibold">{item.q}</dt><dd className="text-slate-700">{item.a}</dd></div>
              ))}
            </dl>
          </details>
        </div>
      )}

      {/* Both reading screens stay mounted; only the chosen one is shown. Hiding instead of unmounting keeps typed text and results. */}
      <div hidden={!(step === 2 && method === 'paste')} className="mt-5">
        <ImportScreen embedded presetTab="paste" presetMode={chosenMode} target="new" draftMode={null} draftId={null} draftRevision={null} aiActive={aiActive} limits={limits}
          onCancel={cancel} onDone={(result) => onImported({ ...result, target: 'new' })}
          onDirty={(value) => setDirty((prev) => ({ ...prev, paste: value }))}
          onBusy={(value) => setImportBusy((prev) => ({ ...prev, paste: value }))}
          onStage={(stage) => setStages((prev) => ({ ...prev, paste: stage }))} />
      </div>
      <div hidden={!(step === 2 && method === 'pdf')} className="mt-5">
        <ImportScreen embedded presetTab="pdf" presetMode={chosenMode} target="new" draftMode={null} draftId={null} draftRevision={null} aiActive={aiActive} limits={limits}
          onCancel={cancel} onDone={(result) => onImported({ ...result, target: 'new' })}
          onDirty={(value) => setDirty((prev) => ({ ...prev, pdf: value }))}
          onBusy={(value) => setImportBusy((prev) => ({ ...prev, pdf: value }))}
          onStage={(stage) => setStages((prev) => ({ ...prev, pdf: stage }))} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {step === 1
            ? <button type="button" className={`${buttonClass} min-h-[44px]`} onClick={cancel} disabled={locked}>{createCopy.cancel}</button>
            : <button type="button" className={`${buttonClass} min-h-[44px]`} onClick={back} disabled={locked}>{createCopy.back}</button>}
          {step === 2 && method === 'manual' && (
            <button type="button" className={`${primaryClass} min-h-[44px]`} disabled={locked} onClick={() => onManual(chosenMode)}>{createCopy.startManual}</button>
          )}
          {step === 2 && method === null && <p className="text-sm text-slate-600">{createCopy.pickMethod}</p>}
          {step === 2 && activeStage && (
            <button type="button" className={`${primaryClass} min-h-[44px]`} disabled={activeStage.disabled || locked} onClick={() => activeStage.run()}>{activeStage.label}</button>
          )}
        </div>
      </div>
    </section>
  );
}
