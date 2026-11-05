import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { renderItineraryHtml } from '../../src/render/render.js';
import { loadInlineRenderResources } from '../../src/render/resources.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';
import type { ItineraryMode } from '../../src/contracts/types.js';

const root = process.cwd();
const outputDir = path.join(root, 'output/web-foundation');
const cssPath = path.join(root, '.runtime/web-render/brochure.css');

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const modes: Array<{ mode: ItineraryMode; label: string }> = [
    { mode: 'half_day', label: 'half_day' },
    { mode: 'full_day', label: 'full_day' },
    { mode: 'multi_day', label: 'multi_day' },
    { mode: 'destination_guide', label: 'destination_guide' }
  ];

  const locales = ['en', 'fr', 'ja', 'zh-Hans', 'id', 'la'];

  console.log('Rendering fixtures for 4 modes × 6 locales...');

  for (const mode of modes) {
    console.log(`\n[${mode.label}]`);

    for (const locale of locales) {
      try {
        const content = createContentV2(mode.mode, locale);
        const resources = await loadInlineRenderResources(locale, 'cultural', cssPath);
        const result = renderItineraryHtml(content, {
          ...resources,
          agency: { name: 'Sample Travel', contact: 'guide@example.test', logoAssetId: null },
          generatedDate: '2026-11-05'
        });

        if (result.errors.length > 0) {
          console.log(`  ${locale}: ⚠ ${result.errors.length} error(s)`);
          result.errors.forEach(e => console.log(`    - ${e.code}`));
        } else {
          console.log(`  ${locale}: ✓ ${result.html.length} bytes`);
        }
      } catch (err) {
        console.log(`  ${locale}: ✗ ${(err as Error).message}`);
      }
    }
  }

  console.log('\n✓ Fixture rendering complete');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
