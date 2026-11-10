import React from 'react';
import type { ItineraryMode } from '../../contracts/types.js';
import type { StepId } from '../validation.js';

export const stepTitles: Record<StepId, string> = {
  info: 'Info trip', time: 'Waktu & titik kumpul', guide: 'Guide & foto', summary: 'Ringkasan', plan: 'Jadwal',
  practical: 'Info praktis', terms: 'Ketentuan & penutup', ai: 'Bantuan AI (opsional)', publish: 'Preview & publish'
};

export function stepTitle(step: StepId, mode: ItineraryMode): string {
  if (step !== 'plan') return stepTitles[step];
  return mode === 'multi_day' ? 'Hari demi hari' : mode === 'destination_guide' ? 'Tempat' : 'Jadwal';
}

export function Stepper({ steps, mode, current, issueCounts, onSelect }: {
  steps: StepId[]; mode: ItineraryMode; current: number; issueCounts: Partial<Record<StepId, number>>; onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1 text-xs lg:flex-col lg:overflow-visible" aria-label="Langkah">
      {steps.map((step, index) => {
        const count = issueCounts[step] ?? 0;
        return (
          <li key={step}>
            <button type="button" aria-current={index === current ? 'step' : undefined} onClick={() => onSelect(index)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-teal-700 ${index === current ? 'border-teal-700 bg-teal-50 font-semibold' : 'border-slate-300'}`}>
              {index + 1}. {stepTitle(step, mode)}{count > 0 ? ` · ${count} wajib` : ''}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
