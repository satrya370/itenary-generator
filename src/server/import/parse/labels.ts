import { fold } from './text.js';

/**
 * Matches a label to one canonical target. Tiers are tried in order and the first tier that yields exactly one target wins:
 * exact alias, bilingual "A / B" (both halves must agree), abbreviation or merged words, then a typo of 1 edit (4-7 letters)
 * or 2 edits (8+ letters). Two targets at the same tier means no decision: the label is left for review. No scores are compared.
 */
export function matchLabel<T extends string>(aliases: ReadonlyArray<readonly [T, readonly string[]]>, label: string): T | null {
  const key = clean(label);
  if (key.length < 2 || key.length > 40 || /\d/.test(key)) return null;
  const exact = targetsWhere(aliases, (alias) => alias === key);
  if (exact.size === 1) return [...exact][0];
  if (exact.size > 1) return null;

  const parts = key.split(/\s*[/|]\s*/).filter(Boolean);
  if (parts.length > 1) {
    const halves = new Set(parts.map((part) => matchLabel(aliases, part)).filter((target): target is T => target !== null));
    return halves.size === 1 ? [...halves][0] : null;
  }

  const compact = key.replace(/\s+/g, '');
  // A short key can abbreviate a close alias only ("tgl" -> "tanggal"); "harga" must not select "harga termasuk".
  const abbreviated = targetsWhere(aliases, (alias) => {
    const other = alias.replace(/\s+/g, '');
    return compact.length >= 3 && other.length <= compact.length * 2.5 && other[0] === compact[0] && isSubsequence(compact, other);
  });
  if (abbreviated.size === 1) return [...abbreviated][0];
  if (abbreviated.size > 1) return null;

  const typo = targetsWhere(aliases, (alias) => {
    const other = alias.replace(/\s+/g, '');
    const limit = compact.length >= 8 ? 2 : compact.length >= 4 ? 1 : 0;
    return limit > 0 && Math.abs(other.length - compact.length) <= limit && editDistance(compact, other) <= limit;
  });
  return typo.size === 1 ? [...typo][0] : null;
}

function clean(label: string): string {
  return fold(label).replace(/[:.]$/, '').trim();
}

function targetsWhere<T extends string>(aliases: ReadonlyArray<readonly [T, readonly string[]]>, predicate: (alias: string) => boolean): Set<T> {
  const found = new Set<T>();
  for (const [target, names] of aliases) {
    if (names.some((name) => predicate(clean(name)))) found.add(target);
  }
  return found;
}

function isSubsequence(short: string, long: string): boolean {
  let at = 0;
  for (const char of long) {
    if (char === short[at]) at += 1;
    if (at === short.length) return true;
  }
  return at === short.length && short.length > 0;
}

/** Optimal string alignment distance: insertions, deletions, substitutions and adjacent transpositions. */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}
