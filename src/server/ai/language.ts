import { francAll } from 'franc';

const isoToLocale: Record<string, string> = { fra: 'fr', fre: 'fr', eng: 'en', ind: 'id', jpn: 'ja', lat: 'la', cmn: 'zh' };
const simplifiedMarkers = new Set(Array.from('这为国门里发后台与会书车长东云实点对开关应时过还进边面现体从来同见说话书')); 
const traditionalMarkers = new Set(Array.from('這為國門裡發後臺與會書車長東雲實點對開關應時過還進邊面現體從來同見說話'));

export interface LanguageProposal { status: 'resolved' | 'unresolved'; locale: string | null; source: 'detected' | 'explicit' | 'unresolved'; reason: string; }
function resolveChineseScript(text: string): string | null {
  let simplified = 0; let traditional = 0;
  for (const char of text) { if (simplifiedMarkers.has(char)) simplified++; if (traditionalMarkers.has(char)) traditional++; }
  if (simplified >= 2 && traditional === 0) return 'zh-Hans';
  if (traditional >= 2 && simplified === 0) return 'zh-Hant';
  return null;
}
function predict(text: string): string | null {
  if ([...text].length < 80) return null;
  const candidates = francAll(text, { minLength: 80 }).slice(0, 2);
  const best = candidates[0]; const runnerUp = candidates[1];
  if (!best || best[0] === 'und' || best[1] < 0.8 || (runnerUp && best[1] - runnerUp[1] < 0.15)) return null;
  const locale = isoToLocale[best[0]];
  if (locale !== 'zh') return locale || null;
  return resolveChineseScript(text);
}

export function detectLanguage(brief: string, notes: Array<{ targetId: string; text: string }>): LanguageProposal {
  const paragraphs = [brief, ...notes.map(note => note.text)].map(value => value.trim()).filter(value => [...value].length >= 80);
  if (!paragraphs.length) return { status: 'unresolved', locale: null, source: 'unresolved', reason: 'Tambahkan minimal 80 karakter deskriptif atau pilih bahasa secara manual.' };
  const detected = paragraphs.map(predict);
  const supported = detected.filter((value): value is string => value !== null);
  if (!supported.length) return { status: 'unresolved', locale: null, source: 'unresolved', reason: 'Bahasa atau aksara belum dapat dipastikan; pilih bahasa secara manual.' };
  const unique = new Set(supported);
  if (unique.size > 1 || supported.length !== detected.length) return { status: 'unresolved', locale: null, source: 'unresolved', reason: 'Konteks berisi bahasa campuran atau tidak cukup pasti; pilih bahasa secara manual.' };
  const locale = supported[0];
  if (locale === 'zh-Hant') return { status: 'unresolved', locale: null, source: 'unresolved', reason: 'Mandarin aksara Traditional tidak didukung oleh katalog CP020; pilih bahasa/aksara yang didukung.' };
  return { status: 'resolved', locale, source: 'detected', reason: 'Bahasa terdeteksi dari brief dan catatan deskriptif.' };
}

export function explicitLanguage(locale: string): LanguageProposal {
  let canonical: string;
  try { canonical = Intl.getCanonicalLocales(locale)[0]; }
  catch { return { status: 'unresolved', locale: null, source: 'unresolved', reason: 'Tag BCP 47 tidak valid.' }; }
  return { status: 'resolved', locale: canonical, source: 'explicit', reason: 'Bahasa dipilih guide.' };
}
