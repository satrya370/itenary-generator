import dictionary from '../../../../config/web/import-headings.json' with { type: 'json' };

/** Lower-case, accent-free, single-spaced form used for every dictionary comparison. */
export function fold(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const dict = dictionary;
