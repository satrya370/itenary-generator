import { francAll } from 'franc';

const isoToLocale: Record<string, string> = { fra: 'fr', fre: 'fr', eng: 'en', sco: 'en', ind: 'id', zlm: 'id', lat: 'la', jpn: 'ja', cmn: 'zh', zho: 'zh', spa: 'es', deu: 'de', ger: 'de', por: 'pt', ita: 'it', nld: 'nl', rus: 'ru' };
const money = /(?:[$€£¥₹]\s*\d[\d,.]*|\b(?:USD|EUR|IDR|JPY|GBP|AUD|CAD|SGD|Rp\.?|dollars?|euros?|rupiah|yen)\s*\d[\d,.]*|\d[\d,.]*\s*(?:USD|EUR|IDR|JPY|GBP|AUD|CAD|SGD|dollars?|euros?|rupiah|yen)\b)/i;
const openingHours = /(?:\bopens?\b|\bopening hours?\b|\bcloses?\b|\bclosing time\b|\boperating hours?\b|jam buka|jam operasional|buka pukul|tutup pukul)[^.!?\n]{0,60}\b\d{1,2}(?::\d{2})?\b/i;

export type ValidatedSuggestion = { ok: true; text: string } | { ok: false; code: string; message: string };

export function validateSuggestion(raw: string, locale: string, target: 'overview' | 'activity' | 'place'): ValidatedSuggestion {
  let parsed: unknown;
  try { parsed = JSON.parse(raw.trim()); } catch { return { ok: false, code: 'AI_OUTPUT_INVALID', message: 'The provider did not return valid JSON.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || typeof (parsed as any).text !== 'string') return { ok: false, code: 'AI_OUTPUT_INVALID', message: 'The response must contain only a text string.' };
  const text = (parsed as { text: string }).text.trim();
  const maxLength = target === 'place' ? 6000 : 4000;
  if (!text || [...text].length > maxLength) return { ok: false, code: 'AI_OUTPUT_INVALID', message: `Text must contain 1–${maxLength} Unicode characters.` };
  if (money.test(text)) return { ok: false, code: 'AI_POLICY_REJECTED', message: 'The suggestion contains a price claim.' };
  if (openingHours.test(text)) return { ok: false, code: 'AI_POLICY_REJECTED', message: 'The suggestion contains an opening-hours claim.' };
  const { language, script } = new Intl.Locale(locale);
  const letters = [...text].filter(char => /\p{L}/u.test(char));
  if (language === 'ja' && (!/[ぁ-ゟ゠-ヿ]/u.test(text) || !letters.length)) return { ok: false, code: 'AI_LOCALE_MISMATCH', message: 'The suggestion does not contain Japanese kana.' };
  if (language === 'zh' && script === 'Hans' && (!/[\u4e00-\u9fff]/u.test(text) || /[這為國門裡發後臺與會]/u.test(text))) return { ok: false, code: 'AI_LOCALE_MISMATCH', message: 'The suggestion does not match the Simplified Chinese script.' };
  if (['en', 'fr', 'id'].includes(language) && [...text].length >= 80) {
    const code = francAll(text, { minLength: 80 })[0]?.[0];
    const detected = code ? isoToLocale[code] : undefined;
    if (detected && detected !== language) return { ok: false, code: 'AI_LOCALE_MISMATCH', message: `The suggestion appears to use a different language than ${locale}.` };
  }
  return { ok: true, text };
}
