import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const executable = process.env.CHROMIUM_EXECUTABLE_PATH;
if (!executable || !fs.existsSync(executable)) {
  console.log(JSON.stringify({ browserState: 'unavailable' }));
  process.exitCode = 1;
} else {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'itinerary-chromium-probe-'));
  try {
    const result = spawnSync(executable, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-background-mode',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--disable-extensions',
      '--disable-sync',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      '--dump-dom',
      'about:blank'
    ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    const passed = result.status === 0 && /<html/i.test(result.stdout || '');
    console.log(JSON.stringify({
      browserState: passed ? 'launchable' : 'launch_failed',
      exitCode: result.status,
      spawnErrorCode: result.error?.code || null
    }));
    if (!passed) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ browserState: 'launch_failed' }));
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let cleaned = false;
    for (let attempt = 0; attempt < 3 && !cleaned; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
        cleaned = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!cleaned) {
      const cleanup = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Remove-Item -LiteralPath '${profile}' -Recurse -Force`], { encoding: 'utf8', timeout: 15000, windowsHide: true });
      const remains = fs.existsSync(profile);
      if (remains) {
        console.log(JSON.stringify({ profileCleanup: 'failed', processStatus: cleanup.status, processError: cleanup.error?.code || null }));
        process.exitCode = 1;
      }
    }
  }
}
