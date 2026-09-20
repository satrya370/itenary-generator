import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const required = ['package.json', 'render-itinerary-html.js', 'scripts/render-pdf.mjs'];
for (const file of required) {
  try { await fs.access(path.join(root, file)); }
  catch { throw new Error('Missing required package file: ' + file); }
}
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (packageJson.dependencies?.puppeteer !== '25.1.0') {
  throw new Error('Puppeteer must remain pinned to 25.1.0');
}
const forbidden = /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----)/;
for (const file of ['package.json', 'scripts/render-pdf.mjs', 'render-itinerary-html.js']) {
  const body = await fs.readFile(path.join(root, file), 'utf8');
  if (forbidden.test(body)) throw new Error('Potential secret found in ' + file);
}
console.log('package validation passed');
