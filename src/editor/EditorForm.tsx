import React from 'react';
import type { FieldMeta } from './schema-meta.js';
import type { AssetDto, LanguageResolutionDto } from '../api/client.js';
import type { ItineraryMode, LanguageContext, WebItineraryContent } from '../contracts/types.js';
import { TripInfo } from './sections/TripInfo.js';
import { TimeAndMeeting } from './sections/TimeAndMeeting.js';
import { TripGuide } from './sections/TripGuide.js';
import { Cover } from './sections/Cover.js';
import { Summary } from './sections/Summary.js';
import { DaySchedule } from './sections/DaySchedule.js';
import { MultiDay } from './sections/MultiDay.js';
import { Places } from './sections/Places.js';
import { ActivityDetails } from './sections/ActivityDetails.js';
import { Practical } from './sections/Practical.js';
import { Closing } from './sections/Closing.js';
import { AiAssist } from './sections/AiAssist.js';
import type { StepId } from './validation.js';

export type Patch = (mutator: (next: WebItineraryContent) => void) => void;
export type AiAction = (key: string, labelText: string, task: 'overview' | 'description', target?: { kind: 'activity' | 'place'; id: string }, apply?: (text: string) => void) => React.ReactNode;
export type MetaFn = (path: string, mode: ItineraryMode) => FieldMeta;

export interface EditorProps {
  content: WebItineraryContent;
  mode: ItineraryMode;
  recordId: string;
  assets: AssetDto[];
  meta: MetaFn;
  patch: Patch;
  onModeChange: (mode: ItineraryMode) => void;
  agencyName: string;
  onFocusProfile: () => void;
  localeInput: string;
  localeError: string;
  language: LanguageContext;
  localeNeedsSupport: boolean;
  languageProposal: LanguageResolutionDto | null;
  onLocaleChange: (raw: string) => void;
  onDetectLanguage: () => void;
  onAcceptLanguage: () => void;
  busy: boolean;
  dirty: boolean;
  localeSupportedCheck: boolean;    
  aiAction: AiAction;
  writing: { brief: string; notes: Array<{ targetId: string; text: string }> };
  onWritingChange: (writing: EditorProps['writing']) => void;
  aiAssistExtra: React.ReactNode;
  guides: Array<{ id: string; name: string; phone: string }>;
  onUploadAsset: (file: File) => Promise<AssetDto | null>;
}

export function EditorForm(props: EditorProps & { activeStep?: StepId }) {
  const { mode, activeStep } = props;
  const show = (step: StepId) => (activeStep === undefined ? undefined : activeStep !== step);
  return (
    <div className="space-y-7">
      <div data-step="info" hidden={show('info')} className="space-y-7"><TripInfo {...props} />{mode !== 'destination_guide' && <TimeAndMeeting {...props} />}</div>
      <div data-step="plan" hidden={show('plan')} className="space-y-7">
        <Summary {...props} />
        <AiAssist {...props} />
        {(mode === 'half_day' || mode === 'full_day') && <DaySchedule {...props} />}
        {mode === 'multi_day' && <MultiDay {...props} />}
        {mode === 'destination_guide' && <Places {...props} />}
        {mode === 'activity' && <ActivityDetails {...props} />}
      </div>
      <div data-step="details" hidden={show('details')} className="space-y-7">
        <TripGuide {...props} /><Cover {...props} /><Practical {...props} />
        <details className="rounded-lg border border-slate-200 p-4">
          <summary className="min-h-[44px] cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Ketentuan & penutup {props.content.policies || props.content.closingNote || props.content.disclaimer ? '· sudah diisi' : ''}</summary>
          <Closing {...props} />
        </details>
      </div>
    </div>
  );
}
