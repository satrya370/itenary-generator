import React from 'react';
import type { ItineraryMode } from '../../contracts/types.js';
import type { StepId } from '../validation.js';

export const stepTitles: Record<StepId, string> = {
  info: 'Info perjalanan', plan: 'Susun perjalanan', details: 'Detail & tampilan', publish: 'Periksa & bagikan'
};

export function stepTitle(step: StepId, _mode: ItineraryMode): string {
  return stepTitles[step];
}

export function Stepper({ steps, mode, current, issueCounts, onSelect }: {
  steps: StepId[]; mode: ItineraryMode; current: number; issueCounts: Partial<Record<StepId, number>>; onSelect: (index: number) => void;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 pb-1 text-xs lg:grid-cols-1" aria-label="Langkah">
      {steps.map((step, index) => {
        const count = issueCounts[step] ?? 0;
        return (
          <li key={step}>
            <button type="button" aria-current={index === current ? 'step' : undefined} onClick={() => onSelect(index)}
              className={`min-h-[44px] w-full rounded-lg border px-3 py-2 text-left hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${index === current ? 'border-teal-700 bg-teal-50 font-semibold' : 'border-slate-300'}`}>
              {index + 1}. {stepTitle(step, mode)}{count > 0 ? ` · ${count} wajib` : ''}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
