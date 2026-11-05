import fs from 'node:fs';
import process from 'node:process';

const MODEL_ID = 'openai/gpt-6-luna';
const credentialPath = process.env.OPENROUTER_CREDENTIAL_FILE;
let credentialState = process.env.OPENROUTER_API_KEY?.trim() ? 'configured' : 'missing';

if (credentialState === 'missing' && credentialPath) {
  try {
    const content = fs.readFileSync(credentialPath, 'utf8');
    const matches = [...content.matchAll(/sk-or-v1-[A-Za-z0-9_-]{20,}/g)];
    const providerMatches = matches.filter(({ index }) =>
      /openrouter/i.test(content.slice(Math.max(0, index - 256), index + 256))
    );
    credentialState = providerMatches.length === 1 ? 'configured' : matches.length === 0 ? 'missing' : 'ambiguous';
  } catch {
    credentialState = 'unavailable';
  }
}

let modelState = 'unavailable';
let supportedParameters = [];
try {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(10000)
  });
  if (response.ok) {
    const catalog = await response.json();
    const model = catalog.data?.find((entry) => entry.id === MODEL_ID);
    if (model) {
      modelState = 'listed';
      supportedParameters = (model.supported_parameters || []).filter((parameter) =>
        ['temperature', 'top_p', 'max_tokens', 'reasoning'].includes(parameter)
      );
    } else {
      modelState = 'not_listed';
    }
  } else {
    modelState = `http_${response.status}`;
  }
} catch {
  modelState = 'network_unavailable';
}

console.log(JSON.stringify({ runtime: process.version, modelId: MODEL_ID, modelState, supportedParameters, credentialState }));
if (modelState !== 'listed' || !['configured', 'missing'].includes(credentialState)) process.exitCode = 1;
