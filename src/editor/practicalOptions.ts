import optionsFile from '../../config/web/practical-options.json' with { type: 'json' };

export type OptionGroup = 'included' | 'notIncluded' | 'whatToBring' | 'notSuitableFor' | 'notAllowed' | 'localTips' | 'policies';
const locales = (optionsFile as { locales: Record<string, Partial<Record<OptionGroup, string[]>>> }).locales;

export function presetsFor(language: string | null | undefined, group: OptionGroup): string[] {
  if (!language) return [];
  return locales[language]?.[group] ?? [];
}
