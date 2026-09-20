import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('PDF renderer keeps print-safe options and remote Chromium support', async () => {
  const source = await fs.readFile(path.resolve('scripts/render-pdf.mjs'), 'utf8');
  assert.match(source, /CHROMIUM_WS_ENDPOINT/);
  assert.match(source, /printBackground:\s*true/);
  assert.match(source, /preferCSSPageSize:\s*true/);
  assert.match(source, /%PDF-/);
});
