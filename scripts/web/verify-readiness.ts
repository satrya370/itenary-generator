import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import type { ItineraryMode } from '../../src/contracts/types.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';

const repo = process.cwd(); const release = path.resolve('output/releases/standalone');
const runId = randomKey(); const appA = `cp028-app-${runId}`; const appB = `cp028-upgrade-${runId}`;
const caddyA = `cp028-caddy-${runId}`; const caddyB = `cp028-caddy-upgrade-${runId}`; const caddyVolume = `cp028-caddy-data-${runId}`;
const runRoot = path.resolve(`output/readiness-runs/${runId}`); const dataRoot = path.join(runRoot, 'data'); const backupRoot = path.join(runRoot, 'backup');
const releaseB = path.join(runRoot, 'release-b'); const caPath = path.join(runRoot, 'local-root.crt'); const probePath = path.join(runRoot, 'runtime-probe.mjs'); const inputPath = path.join(runRoot, 'probe-input.json');
const statusPath = path.resolve('output/web-readiness/readiness-summary.json');
let activeApp: string | null = null; let activeCaddy: string | null = null; let hostPort = 0; let stage = 'prepare'; let lastHttpStatus: number | null = null; let lastContentType: string | null = null; let lastServer: string | null = null; let lastBodyBytes = 0; let dockerFailure: string | null = null; let caddyDiagnostic: string | null = null;

function randomKey() { return Math.random().toString(36).slice(2, 10); }
function docker(args: string[], options: { input?: string } = {}) {
  try { return execFileSync('docker', args, { cwd: repo, encoding: 'utf8', input: options.input, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch (error: any) { dockerFailure = String(error.stderr || '').trim().split('\n').slice(-3).join(' ').slice(0, 400) || error.name; throw error; }
}
async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}
function tlsRequest(port: number, ca: Buffer | null, target: string, method = 'GET', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port, path: target, method, servername: 'localhost', ...(ca ? { ca } : { rejectUnauthorized: false }), headers: { host: `localhost:${port}`, ...headers } }, response => {
      const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ status: response.statusCode || 0, headers: response.headers as any, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(5_000, () => request.destroy(new Error('Local TLS request timeout')));
    request.on('error', reject); request.end();
  });
}
async function waitForApp(container: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      docker(['exec', container, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:3000/api/health');if(!r.ok)process.exit(1)"]);
      return;
    } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error('runtime readiness timeout');
}
async function waitForTls() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await tlsRequest(hostPort, null, '/not-a-share');
      lastHttpStatus = response.status; lastContentType = String(response.headers['content-type'] || ''); lastServer = String(response.headers.server || ''); lastBodyBytes = response.body.length;
      if (lastServer === 'Caddy') { stage = 'tls-handshake-ready'; return; }
    }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error('TLS proxy readiness timeout');
}
async function startPair(appName: string, caddyName: string, appRoot: string, dataDir: string, sharedNodeModules = false) {
  const start = performance.now();
  const volumeRoot = `${appRoot}:/opt/app:ro`;
  stage = `start-${appName}`;
  docker(['run', '--detach', '--name', appName, '--platform', 'linux/amd64', '--publish', `127.0.0.1:${hostPort}:8443`, '--volume', volumeRoot,
    ...(sharedNodeModules ? ['--volume', `${path.join(release, 'node_modules')}:/opt/app/node_modules:ro`] : []),
    '--volume', `${dataDir}:/var/lib/itinerary-engine`, '--workdir', '/opt/app',
    '--env', 'HOST=127.0.0.1', '--env', 'PORT=3000', '--env', 'PUBLIC_ORIGIN=http://127.0.0.1:3000', '--env', `SHARE_ORIGIN=https://localhost:${hostPort}`,
    '--env', 'ENGINE_DATA_DIR=/var/lib/itinerary-engine', '--env', 'ENGINE_RENDER_CSS=/opt/app/runtime/brochure.css',
    'node:24-bookworm-slim', 'node', 'server/server/main.js']);
  activeApp = appName;
  await waitForApp(appName);
  stage = `start-${caddyName}`;
  docker(['run', '--detach', '--name', caddyName, '--network', `container:${appName}`, '--volume', `${path.join(appRoot, 'Caddyfile.example')}:/etc/caddy/Caddyfile:ro`, '--volume', `${caddyVolume}:/data`, 'caddy:2.10-alpine']);
  activeCaddy = caddyName;
  stage = `wait-tls-${caddyName}`;
  await waitForTls();
  stage = `check-tls-ca-${caddyName}`;
  if (!await fileExists(caPath)) { stage = `copy-tls-ca-${caddyName}`; docker(['cp', `${caddyName}:/data/caddy/pki/authorities/local/root.crt`, caPath]); }
  stage = `pair-ready-${appName}`;
  return performance.now() - start;
}
async function fileExists(file: string) { return stat(file).then(() => true, () => false); }
function stopPair() {
  if (activeCaddy) { docker(['rm', '--force', activeCaddy]); activeCaddy = null; }
  if (activeApp) { docker(['stop', '--time', '15', activeApp]); docker(['rm', activeApp]); activeApp = null; }
}
function bytesFromSize(value: string) {
  const match = /^([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)$/i.exec(value.trim());
  if (!match) return 0;
  const factors: Record<string, number> = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3 };
  return Number(match[1]) * factors[match[2]];
}
async function runRuntimeProbe(container: string) {
  docker(['cp', probePath, `${container}:/tmp/cp028-readiness-probe.mjs`]);
  docker(['cp', inputPath, `${container}:/tmp/cp028-readiness-fixtures.json`]);
  let stdout = ''; let exitCode: number | null = null; let peakCpu = 0; let peakMemory = 0;
  const child = spawn('docker', ['exec', container, 'node', '/tmp/cp028-readiness-probe.mjs'], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout?.on('data', chunk => { stdout += String(chunk); });
  child.on('close', code => { exitCode = code; });
  child.on('error', () => { exitCode = 127; });
  const started = performance.now();
  while (exitCode === null && performance.now() - started < 180_000) {
    try {
      const [cpuText, memoryText] = dockerStats(container).split('|');
      peakCpu = Math.max(peakCpu, Number.parseFloat(cpuText) || 0);
      peakMemory = Math.max(peakMemory, bytesFromSize(memoryText.split('/')[0]));
    } catch { /* A stats snapshot may race a container lifecycle event. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (exitCode === null) { child.kill(); throw new Error('runtime workload probe timed out'); }
  if (exitCode !== 0) throw new Error('runtime workload probe failed');
  return { result: JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || '{}'), peakCpuPercent: peakCpu, peakMemoryBytes: peakMemory };
}
function dockerStats(container: string) {
  return docker(['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}', container]);
}

async function main() {
  await mkdir(path.dirname(runRoot), { recursive: true }); await mkdir(runRoot, { recursive: true }); await mkdir(dataRoot, { recursive: true });
  await mkdir(path.dirname(statusPath), { recursive: true });
  const releaseManifest = JSON.parse(await readFile(path.join(release, 'release-manifest.json'), 'utf8'));
  stage = 'clean-linux-runtime-install';
  const installStarted = performance.now();
  docker(['run', '--rm', '--platform', 'linux/amd64', '--volume', `${release}:/opt/app`, '--workdir', '/opt/app', 'node:24-bookworm-slim', 'npm', 'ci', '--omit=dev']);
  const runtimeInstallMs = Math.round(performance.now() - installStarted);
  const runtimeProbeSource = await readFile(path.join(repo, 'scripts/web/readiness-runtime-probe.mjs'));
  await writeFile(probePath, runtimeProbeSource);
  const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#267c8a' } }).png().toBuffer();
  const modes = [
    { mode: 'half_day', locale: 'id' },
    { mode: 'full_day', locale: 'en' },
    { mode: 'multi_day', locale: 'ja' },
    { mode: 'destination_guide', locale: 'zh-Hans' }
  ].map(({ mode, locale }) => ({ mode, locale, content: createContentV2(mode as ItineraryMode, locale) }));
  const multiDayStress = createContentV2('multi_day', 'ja');
  while (multiDayStress.days.length < 14) {
    const dayNumber = multiDayStress.days.length + 1; const day = structuredClone(multiDayStress.days[0]);
    day.id = randomUUID(); day.dayNumber = dayNumber; day.title = `Day ${dayNumber}`;
    day.activities = day.activities.map(activity => ({ ...activity, id: randomUUID(), title: `Visit ${dayNumber}` })); multiDayStress.days.push(day);
  }
  const guideStress = createContentV2('destination_guide', 'zh-Hans'); const basePlace = guideStress.places[0];
  guideStress.places = Array.from({ length: 60 }, (_, index) => ({ ...structuredClone(basePlace), id: index === 0 ? basePlace.id : randomUUID(), name: `Linux guide place ${index + 1}` }));
  const stressFixtures = [{ mode: 'multi_day', locale: 'ja', content: multiDayStress }, { mode: 'destination_guide', locale: 'zh-Hans', content: guideStress }];
  await writeFile(inputPath, JSON.stringify({ action: 'create', modes, stressFixtures, pngBase64: png.toString('base64') }));
  hostPort = await availablePort();
  stage = 'clean-linux-runtime-start';
  const coldStartMs = await startPair(appA, caddyA, release, dataRoot);
  stage = 'measure-idle-runtime';
  const firstStats = dockerStats(appA);
  stage = 'internal-linux-workflows';
  const initialProbe = await runRuntimeProbe(appA); const created = initialProbe.result;
  assert.equal(created.status, 'passed'); assert.equal(created.credentialState, 'missing'); assert.equal(created.rotatedPublicationActive, true);
  const ca = await readFile(caPath);
  stage = 'anonymous-tls-share-contract';
  const activePages: Array<{ id: string; mode: string; url: string; htmlHash: string; imageHash: string; htmlBytes: number; imageBytes: number }> = [];
  for (const row of created.rows) {
    stage = `tls-${row.mode}-configured-url`;
    const url = new URL(row.shareUrl); assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'localhost');
    stage = `tls-${row.mode}-anonymous-html`;
    const page = await tlsRequest(hostPort, ca, `${url.pathname}${url.search}`);
    lastHttpStatus = page.status; lastContentType = String(page.headers['content-type'] || ''); lastServer = String(page.headers.server || ''); lastBodyBytes = page.body.length;
    assert.equal(page.status, 200); assert.match(page.headers['content-type'] as string, /text\/html/);
    const html = page.body.toString('utf8'); assert.match(html, /property="og:title"/); assert.doesNotMatch(html, /<script\b/i);
    assert.ok(html.includes(`lang="${row.locale}"`));
    if (row.locale === 'ja') assert.match(html, /Noto Sans JP Variable/);
    if (row.locale === 'zh-Hans') assert.match(html, /Noto Sans SC Variable/);
    stage = `tls-${row.mode}-og-image`;
    const image = await tlsRequest(hostPort, ca, `${url.pathname}/og-image`);
    assert.equal(image.status, 200); assert.match(image.headers['content-type'] as string, /image\/jpeg/);
    const metadata = await sharp(image.body).metadata(); assert.deepEqual([metadata.width, metadata.height], [1200, 630]);
    activePages.push({ id: row.id, mode: row.mode, url: row.shareUrl, htmlHash: sha256(page.body), imageHash: sha256(image.body), htmlBytes: page.body.length, imageBytes: image.body.length });
  }
  const fullDay = created.rows.find((row: any) => row.mode === 'full_day'); assert.ok(fullDay?.revokedUrl);
  stage = 'tls-revoked-page-denied';
  const retired = new URL(fullDay.revokedUrl);
  assert.equal((await tlsRequest(hostPort, ca, retired.pathname)).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, `${retired.pathname}/og-image`)).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, '/')).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, '/api/v1/itinerary-engine/context')).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, '/assets/private.png')).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, `/i/${retired.pathname.split('/')[2]}%2f..%2fapi`)).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, new URL(activePages[0].url).pathname, 'HEAD')).status, 200);
  assert.equal((await tlsRequest(hostPort, ca, new URL(activePages[0].url).pathname, 'POST')).status, 404);
  const forwarded = await tlsRequest(hostPort, ca, new URL(activePages[0].url).pathname, 'GET', { 'X-Forwarded-Host': 'attacker.invalid' });
  assert.ok(forwarded.body.toString('utf8').includes(`https://localhost:${hostPort}/i/`));
  const burstStarted = performance.now();
  const burst = await Promise.all(Array.from({ length: 24 }, (_, index) => tlsRequest(hostPort, ca, new URL(activePages[index % activePages.length].url).pathname)));
  const burstMs = performance.now() - burstStarted; assert.ok(burst.every(response => response.status === 200));
  const peakStats = dockerStats(appA); const dataBytes = await directoryBytes(dataRoot);

  stage = 'stopped-backup-and-restore';
  stage = 'graceful-stop-primary';
  stopPair();
  stage = 'stopped-root-backup-copy';
  await cp(dataRoot, backupRoot, { recursive: true });
  stage = 'compatible-release-copy';
  await cp(release, releaseB, { recursive: true, filter: source => !source.split(path.sep).includes('node_modules') });
  await mkdir(path.join(releaseB, 'node_modules'), { recursive: true });
  stage = 'launch-compatible-release-from-backup';
  const upgradeStartMs = await startPair(appB, caddyB, releaseB, backupRoot, true);
  stage = 'inspect-compatible-release-restore';
  await writeFile(inputPath, JSON.stringify({ action: 'inspect', rows: created.rows, assetId: created.assetId }));
  const afterRestore = (await runRuntimeProbe(appB)).result;
  assert.equal(afterRestore.status, 'passed'); assert.equal(afterRestore.workspaceId, created.workspaceId); assert.equal(afterRestore.agencyName, 'CP028 Linux Guide');
  assert.equal(afterRestore.assetPresent, true); assert.equal(afterRestore.records.length, 6);
  for (let i = 0; i < activePages.length; i++) {
    const original = activePages[i]; const restored = afterRestore.records.find((row: any) => row.id === original.id);
    assert.equal(restored?.shareUrl, original.url); assert.equal(restored?.currentVersionId, created.rows.find((row: any) => row.id === original.id)?.versionId);
    const page = await tlsRequest(hostPort, ca, new URL(original.url).pathname); const image = await tlsRequest(hostPort, ca, `${new URL(original.url).pathname}/og-image`);
    assert.equal(sha256(page.body), original.htmlHash); assert.equal(sha256(image.body), original.imageHash);
  }
  assert.equal((await tlsRequest(hostPort, ca, retired.pathname)).status, 404);
  assert.equal((await tlsRequest(hostPort, ca, `${retired.pathname}/og-image`)).status, 404);
  stopPair();

  stage = 'rollback-to-original-release';
  const rollbackStartMs = await startPair(appA, caddyA, release, dataRoot);
  await writeFile(inputPath, JSON.stringify({ action: 'inspect', rows: created.rows, assetId: created.assetId }));
  const afterRollback = (await runRuntimeProbe(appA)).result;
  assert.equal(afterRollback.status, 'passed'); assert.equal(afterRollback.workspaceId, created.workspaceId); assert.equal(afterRollback.assetPresent, true);
  for (const original of activePages) {
    const page = await tlsRequest(hostPort, ca, new URL(original.url).pathname); assert.equal(sha256(page.body), original.htmlHash);
  }
  assert.equal((await tlsRequest(hostPort, ca, retired.pathname)).status, 404);
  const installedBytes = await directoryBytes(path.join(release, 'node_modules'));
  const summary = {
    status: 'passed', architecture: 'linux/amd64', nodeRange: '>=24 <25', releaseBuildId: releaseManifest.buildId,
    releasePayloadBytes: releaseManifest.totalBytes, runtimeInstallMs, installedRuntimeBytes: installedBytes, runtimeDependencies: releaseManifest.runtimeDependencies,
    publishedHtmlBytesTotal: activePages.reduce((sum, item) => sum + item.htmlBytes, 0), publishedOgBytesTotal: activePages.reduce((sum, item) => sum + item.imageBytes, 0), previewPublishTimingsMs: created.rows.map((row: any) => ({ mode: row.mode, preview: row.previewMs, publish: row.publishMs })),
    coldStartMs: Math.round(coldStartMs), idleDockerStats: firstStats, postBurstDockerStats: peakStats, renderLoadSampledPeakCpuPercent: initialProbe.peakCpuPercent, renderLoadSampledPeakMemoryBytes: initialProbe.peakMemoryBytes, dataRootBytesAfterLoad: dataBytes,
    modes: created.rows.slice(0, 4).map((row: any) => row.mode), stressCases: ['multi_day_14_ja', 'destination_guide_60_zh-Hans'], credentialsMissingManualFlow: true, anonymousLocalTls: true,
    shareOnlyProxy: true, privateApiDenied: true, trustedHostIndependentOgOrigin: true, deepReload: true,
    revokedHtmlAndOgRemainDenied: true, activeHtmlOgHashesPreserved: true, fullRootBackupRestore: true,
    sameBuildReleasePathUpgradeMs: Math.round(upgradeStartMs), rollbackToOriginalReleaseMs: Math.round(rollbackStartMs),
    publicGetBurstCount: burst.length, publicGetBurstMs: Math.round(burstMs), awsCostEstimate: 'unpriced until target/account/region are selected'
  };
  await writeFile(statusPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  stopPair(); try { docker(['volume', 'rm', caddyVolume]); } catch { /* Test-only volume already removed. */ }
  await rm(runRoot, { recursive: true, force: true });
}

try {
  await main();
} catch (error) {
  const errorType = error instanceof Error ? error.name : 'Error';
  const failureLine = error instanceof Error ? Number(error.stack?.split('\n').find(line => line.includes('verify-readiness.ts:'))?.match(/:(\d+):\d+\)?$/)?.[1] || 0) : 0;
  const failureMessage = (error instanceof Error ? error.message : 'Unknown readiness failure')
    .replace(/https?:\/\/[^\s"']+/gi, '[url]').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[opaque]').replace(/[A-Za-z]:\\[^\s]+/g, '[path]').slice(0, 240);
  await mkdir(path.dirname(statusPath), { recursive: true });
  if (activeCaddy) {
    try { caddyDiagnostic = docker(['logs', activeCaddy]).split(/\r?\n/).filter(line => /error|failed|running|config|certificate/i.test(line)).slice(-6).join('\n'); } catch { caddyDiagnostic = null; }
  }
  const keepDebug = process.env.CP028_KEEP_DEBUG === '1';
  await writeFile(statusPath, JSON.stringify({ status: 'failed', stage, errorType, failureLine, failureMessage, dockerFailure, caddyDiagnostic, hostPort, appContainer: activeApp, caddyContainer: activeCaddy, debugStatePreserved: keepDebug, lastHttpStatus, lastContentType, lastServer, lastBodyBytes }, null, 2));
  if (!keepDebug) {
    if (activeCaddy) docker(['rm', '--force', activeCaddy]);
    if (activeApp) docker(['rm', '--force', activeApp]);
    try { docker(['volume', 'rm', caddyVolume]); } catch { /* Test-only volume already removed. */ }
    await rm(runRoot, { recursive: true, force: true });
  }
  throw new Error(`CP028 local readiness failed at ${stage} (${errorType}); safe summary saved to output/web-readiness/readiness-summary.json.`);
}

function sha256(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
