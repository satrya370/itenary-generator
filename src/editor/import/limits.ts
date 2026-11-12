/** Input limits the server reports in its capabilities (CP037). The defaults match the server constants and are used only before the capabilities arrive. */
export interface ImportLimits {
  aiConfigured: boolean;
  maxTextChars: number;
  maxPdfBytes: number;
  maxPdfPages: number;
  retentionDays: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  aiConfigured: false,
  maxTextChars: 120_000,
  maxPdfBytes: 10 * 1024 * 1024,
  maxPdfPages: 60,
  retentionDays: 30
};

/** The single primary action of the create flow footer for the text and PDF methods. */
export interface ImportStage { label: string; disabled: boolean; run: () => void }
