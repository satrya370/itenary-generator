import la from '../../config/web/locales/la.json' with { type: 'json' };
import fr from '../../config/web/locales/fr.json' with { type: 'json' };
import en from '../../config/web/locales/en.json' with { type: 'json' };
import id from '../../config/web/locales/id.json' with { type: 'json' };
import ja from '../../config/web/locales/ja.json' with { type: 'json' };
import zhHans from '../../config/web/locales/zh-Hans.json' with { type: 'json' };

export interface LocaleCatalog {
  locale: string;
  labels: Record<string, string>;
}

const catalogs: Record<string, LocaleCatalog> = { la, fr, en, id, ja, 'zh-Hans': zhHans };

export function getLocaleCatalog(locale: string | null | undefined): LocaleCatalog | null {
  if (!locale) return null;
  let canonical: string;
  try { canonical = Intl.getCanonicalLocales(locale)[0]; } catch { return null; }
  if (catalogs[canonical]) return catalogs[canonical];
  let parsed: Intl.Locale;
  try { parsed = new Intl.Locale(canonical); } catch { return null; }
  if (parsed.language === 'zh') {
    return parsed.script === 'Hans' ? catalogs['zh-Hans'] : null;
  }
  return catalogs[parsed.language] || null;
}
