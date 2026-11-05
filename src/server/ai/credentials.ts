import { stat, readFile } from 'node:fs/promises';

export type CredentialState = 'configured' | 'missing' | 'ambiguous' | 'unavailable';
export interface LoadedCredential { state: CredentialState; source: 'environment' | 'file' | null; key?: string; }

function matches(content: string) {
  const all = [...content.matchAll(/sk-or-v1-[A-Za-z0-9_-]{20,}/g)];
  const provider = all.filter(match => /openrouter/i.test(content.slice(Math.max(0, (match.index || 0) - 256), (match.index || 0) + match[0].length + 256)));
  return { all, provider };
}

export async function loadOpenRouterCredential(environment: NodeJS.ProcessEnv = process.env): Promise<LoadedCredential> {
  const injected = environment.OPENROUTER_API_KEY?.trim();
  if (injected) return /^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(injected)
    ? { state: 'configured', source: 'environment', key: injected }
    : { state: 'unavailable', source: 'environment' };
  const file = environment.OPENROUTER_CREDENTIAL_FILE;
  if (!file) return { state: 'missing', source: null };
  try {
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > 1024 * 1024) return { state: 'unavailable', source: 'file' };
    const found = matches(await readFile(file, 'utf8'));
    if (found.provider.length === 1) return { state: 'configured', source: 'file', key: found.provider[0][0] };
    if (found.provider.length > 1 || found.all.length > 0) return { state: 'ambiguous', source: 'file' };
    return { state: 'missing', source: 'file' };
  } catch {
    return { state: 'unavailable', source: 'file' };
  }
}

export function credentialSummary(credential: LoadedCredential) {
  return { state: credential.state, source: credential.source };
}
