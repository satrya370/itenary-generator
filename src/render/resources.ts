import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import paletteConfig from '../../config/palettes.json' with { type: 'json' };
import { getLocaleCatalog } from '../contracts/locale-catalogs.js';

const MAX_INLINE_FONT_BYTES = 16 * 1024 * 1024;
const PACKAGE_ROOT = path.resolve('node_modules/@fontsource-variable');

function hasNonDataUrl(css: string) {
  return [...css.matchAll(/url\(([^)]+)\)/gi)].some((match) => {
    const resource = match[1].trim().replace(/^['"]|['"]$/g, '');
    return !resource.startsWith('data:') && !resource.startsWith('#');
  });
}

function localeFontPackages(locale: string): string[] {
  let language = '';
  try { language = new Intl.Locale(locale).language; } catch {}
  if (language === 'ja') return ['noto-sans', 'noto-sans-jp'];
  if (locale.toLowerCase() === 'zh-hans' || locale.toLowerCase().startsWith('zh-hans-')) return ['noto-sans', 'noto-sans-sc'];
  return ['noto-sans'];
}

async function inlineFontStylesheet(packageName: string): Promise<{ css: string; bytes: number }> {
  const packagePath = path.join(PACKAGE_ROOT, packageName);
  const stylesheetPath = path.join(packagePath, 'index.css');
  let css = await fs.readFile(stylesheetPath, 'utf8');
  const references = [...css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)].map((match) => match[2]);
  let bytes = 0;
  for (const reference of references) {
    const resolved = path.resolve(packagePath, reference);
    const relative = path.relative(packagePath, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !resolved.endsWith('.woff2')) {
      throw new Error(`Font resource escaped its package: ${packageName}`);
    }
    const binary = await fs.readFile(resolved);
    bytes += binary.byteLength;
    if (bytes > MAX_INLINE_FONT_BYTES) throw new Error(`Font bundle for ${packageName} exceeds 16 MiB.`);
    const dataUri = `data:font/woff2;base64,${binary.toString('base64')}`;
    css = css.replaceAll(reference, dataUri);
  }
  const remainingExternal = [...css.matchAll(/url\(([^)]+)\)/gi)].some((match) => !match[1].trim().startsWith('data:'));
  if (references.length === 0 || remainingExternal) throw new Error(`Font bundle for ${packageName} could not be made self-contained.`);
  const license = await fs.readFile(path.join(packagePath, 'LICENSE'), 'utf8');
  const licenseComment = license.replaceAll('*/', '* /');
  return { css: `${css}\n/* Bundled font license: ${packageName}\n${licenseComment}\n*/`, bytes };
}

export async function loadInlineRenderResources(locale: string, colorTheme: string, stylesheetPath: string) {
  const stylesheet = await fs.readFile(stylesheetPath, 'utf8');
  const bundles = await Promise.all(localeFontPackages(locale).map(inlineFontStylesheet));
  const fontCss = bundles.map((bundle) => bundle.css).join('\n');
  const fontBytes = bundles.reduce((sum, bundle) => sum + bundle.bytes, 0);
  const catalog = getLocaleCatalog(locale);
  if (!catalog) throw new Error(`No locale label catalog installed for ${locale}`);
  const palettes = (paletteConfig as any).palettes;
  const palette = palettes[colorTheme] || palettes.mixed;
  if (fontBytes > MAX_INLINE_FONT_BYTES) throw new Error('Combined locale font bundle exceeds 16 MiB.');
  if (/@import|<\/style/i.test(stylesheet) || /@import|<\/style/i.test(fontCss) || hasNonDataUrl(stylesheet) || hasNonDataUrl(fontCss)) {
    throw new Error('Render styles must be self-contained and safe to inline.');
  }
  return { stylesheet, fontCss, fontBytes, catalog, palette };
}

export function defaultStylesheetPath() {
  return path.resolve(process.env.ENGINE_RENDER_CSS || '.runtime/web-render/brochure.css');
}
