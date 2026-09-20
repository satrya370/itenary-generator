import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const [htmlPath, pdfPath] = process.argv.slice(2);
if (!htmlPath || !pdfPath) {
  throw new Error('Usage: node scripts/render-pdf.mjs <input.html> <output.pdf>');
}

const endpoint = process.env.CHROMIUM_WS_ENDPOINT;
if (!endpoint) throw new Error('CHROMIUM_WS_ENDPOINT is required');

await fs.mkdir(path.dirname(pdfPath), { recursive: true });
const html = await fs.readFile(htmlPath, 'utf8');
const browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
const page = await browser.newPage();
try {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url === 'about:blank') request.continue();
    else request.abort();
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.emulateMediaType('print');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' }
  });
} finally {
  await page.close();
  await browser.disconnect();
}

const header = await fs.readFile(pdfPath, { encoding: 'utf8', flag: 'r' });
if (!header.startsWith('%PDF-')) throw new Error('Renderer did not produce a PDF');
console.log(JSON.stringify({ pdfPath, bytes: (await fs.stat(pdfPath)).size }));
