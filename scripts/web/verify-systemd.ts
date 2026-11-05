import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const repo = process.cwd(); const runId = Math.random().toString(36).slice(2, 10);
const runRoot = path.resolve(`output/readiness-runs/systemd-${runId}`); const release = path.resolve('output/releases/standalone');
const buildId = JSON.parse(await readFile(path.join(release, 'release-manifest.json'), 'utf8')).buildId;
const container = `cp028-systemd-${runId}`; const image = `cp028-systemd-test:${runId}`; const dataVolume = `cp028-systemd-data-${runId}`;
const statusPath = path.resolve('output/web-readiness/systemd-summary.json');
let stage = 'prepare'; let mainPid = ''; let serviceProperties = ''; let healthStatus = '';
function docker(args: string[]) { return execFileSync('docker', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function waitActive() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try { if (docker(['exec', container, 'systemctl', 'is-active', 'itinerary-engine.service']) === 'active') return; } catch { /* unit still starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('systemd service did not become active');
}
async function waitHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const result = docker(['exec', container, 'node', '--input-type=module', '-e', "const r=await fetch('http://127.0.0.1:3000/api/health');if(!r.ok)process.exit(1);console.log(r.status)"]);
      if (result === '200') return result;
    } catch { /* systemd has activated the unit but Fastify may still be starting */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('systemd-managed runtime health timeout');
}

try {
  await mkdir(runRoot, { recursive: true }); await mkdir(path.dirname(statusPath), { recursive: true });
  const port = await availablePort();
  stage = 'install-runtime-dependencies-for-systemd';
  docker(['run', '--rm', '--platform', 'linux/amd64', '--volume', `${release}:/opt/app`, '--workdir', '/opt/app', 'node:24-bookworm-slim', 'npm', 'ci', '--omit=dev']);
  const dockerfile = 'FROM node:24-bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv dbus && rm -rf /var/lib/apt/lists/*\nSTOPSIGNAL SIGRTMIN+3\nCMD ["/sbin/init"]\n';
  const dockerfilePath = path.join(runRoot, 'Dockerfile'); await writeFile(dockerfilePath, dockerfile);
  stage = 'build-systemd-reference-image';
  docker(['build', '--platform', 'linux/amd64', '--tag', image, '--file', dockerfilePath, runRoot]);
  stage = 'start-systemd-container';
  docker(['run', '--detach', '--privileged', '--cgroupns=host', '--name', container, '--publish', `127.0.0.1:${port}:8443`, '--tmpfs', '/run', '--tmpfs', '/run/lock', '--volume', '/sys/fs/cgroup:/sys/fs/cgroup:rw', '--volume', `${release}:/opt/itinerary-engine/releases/${buildId}:ro`, '--volume', `${dataVolume}:/var/lib/itinerary-engine`, image]);
  const setup = `set -eu
    getent group itinerary-engine >/dev/null || groupadd --system itinerary-engine
    id -u itinerary-engine >/dev/null 2>&1 || useradd --system --gid itinerary-engine --home-dir /nonexistent --shell /usr/sbin/nologin itinerary-engine
    mkdir -p /opt/itinerary-engine /etc/itinerary-engine /var/lib/itinerary-engine
    ln -sfn /opt/itinerary-engine/releases/${buildId} /opt/itinerary-engine/current
    chown -R itinerary-engine:itinerary-engine /var/lib/itinerary-engine
    systemctl daemon-reload`;
  docker(['exec', container, 'sh', '-lc', setup]);
  const envFile = path.join(runRoot, 'runtime.env');
  await writeFile(envFile, `HOST=127.0.0.1\nPORT=3000\nPUBLIC_ORIGIN=http://127.0.0.1:3000\nSHARE_ORIGIN=https://localhost:${port}\nENGINE_DATA_DIR=/var/lib/itinerary-engine\nENGINE_RENDER_CSS=/opt/itinerary-engine/current/runtime/brochure.css\nOPENROUTER_LIVE_TEST=0\n`);
  docker(['cp', envFile, `${container}:/etc/itinerary-engine/runtime.env`]);
  docker(['cp', path.join(release, 'itinerary-engine.service'), `${container}:/etc/systemd/system/itinerary-engine.service`]);
  docker(['exec', container, 'chmod', '600', '/etc/itinerary-engine/runtime.env']);
  stage = 'systemd-start-service';
  const start = performance.now(); docker(['exec', container, 'systemctl', 'enable', '--now', 'itinerary-engine.service']); await waitActive();
  const startMs = Math.round(performance.now() - start);
  stage = 'systemd-inspect-main-pid';
  serviceProperties = docker(['exec', container, 'systemctl', 'show', '-p', 'MainPID', '-p', 'User', 'itinerary-engine.service']);
  mainPid = serviceProperties.match(/MainPID=(\d+)/)?.[1] || '';
  assert.ok(Number(mainPid) > 1); assert.match(serviceProperties, /User=itinerary-engine/);
  stage = 'systemd-health';
   healthStatus = await waitHealth();
  stage = 'systemd-stop-start';
  const stop = performance.now(); docker(['exec', container, 'systemctl', 'stop', 'itinerary-engine.service']);
  assert.equal(docker(['exec', container, 'systemctl', 'show', '-p', 'ActiveState', '--value', 'itinerary-engine.service']).trim(), 'inactive');
  docker(['exec', container, 'systemctl', 'start', 'itinerary-engine.service']); await waitActive();
   const restartHealth = await waitHealth();
  assert.equal(restartHealth, '200');
  const summary = { status: 'passed', systemdVersion: docker(['exec', container, 'systemctl', '--version']).split('\n')[0], mainPid: Number(mainPid), serviceUser: 'itinerary-engine', loopbackHealth: true, startMs, stopAndRestartMs: Math.round(performance.now() - stop), dataRoot: 'dedicated temporary Docker volume' };
  await writeFile(statusPath, JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
} catch (error) {
  const errorType = error instanceof Error ? error.name : 'Error';
  const keepDebug = process.env.CP028_KEEP_SYSTEMD === '1';
  let serviceStatus = ''; let containerLogs = '';
  try { serviceStatus = docker(['exec', container, 'systemctl', 'status', 'itinerary-engine.service', '--no-pager']).slice(-3000); } catch {}
  try { containerLogs = docker(['logs', container]).split(/\r?\n/).slice(-20).join('\n'); } catch {}
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(statusPath, JSON.stringify({ status: 'failed', stage, errorType, mainPid: Number(mainPid) || null, serviceProperties, healthStatus, serviceStatus, containerLogs, debugStatePreserved: keepDebug, container: keepDebug ? container : undefined }, null, 2));
  throw new Error(`CP028 systemd test failed at ${stage} (${errorType}); safe summary saved to output/web-readiness/systemd-summary.json.`);
} finally {
  if (process.env.CP028_KEEP_SYSTEMD !== '1') {
    try { docker(['rm', '--force', container]); } catch {}
    try { docker(['volume', 'rm', dataVolume]); } catch {}
    try { docker(['image', 'rm', '--force', image]); } catch {}
    await rm(runRoot, { recursive: true, force: true });
  }
}
