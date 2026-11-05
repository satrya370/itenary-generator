import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import palettes from '../../config/palettes.json' with { type: 'json' };
import { renderSavedDraftPreview, type PreviewStore } from './preview.js';
import type { ItineraryRecord } from './store.js';

type Store = PreviewStore & { db: any; workspaceId: string; getItinerary(id: string): ItineraryRecord | null };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const tokenUrl = (origin: string, token: string) => `${origin}/i/${encodeURIComponent(token)}`;

function transact(db: any, work: () => void) {
  db.exec('BEGIN IMMEDIATE');
  try { work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function readState(store: Store, itineraryId: string) {
  return store.db.prepare('SELECT * FROM publication_state WHERE workspace_id=? AND itinerary_id=?').get(store.workspaceId, itineraryId) as any || null;
}

function activeLink(store: Store, itineraryId: string, origin: string) {
  const state = readState(store, itineraryId);
  if (!state?.active_token_id) return null;
  const row = store.db.prepare('SELECT token_value FROM share_tokens WHERE workspace_id=? AND itinerary_id=? AND id=? AND revoked_at IS NULL').get(store.workspaceId, itineraryId, state.active_token_id) as { token_value: string } | undefined;
  return row ? tokenUrl(origin, row.token_value) : null;
}

async function ogImage(content: any, store: Store, dataDir: string) {
  if (!content.hero.gradientOnly && content.hero.assetId) {
    const asset = store.getAsset(content.hero.assetId);
    if (!asset || path.basename(asset.storage_key) !== asset.storage_key) throw new Error('OG_ASSET_INVALID');
    const bytes = await readFile(path.join(dataDir, 'assets', asset.storage_key));
    return sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' }).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }
  const paletteRows = (palettes as any).palettes;
  const palette = paletteRows[content.brochure.destinationType] || paletteRows.mixed;
  const stops: string[] = palette.gradientStops;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">${stops.map((color, index) => `<stop offset="${Math.round(index * 100 / Math.max(1, stops.length - 1))}%" stop-color="${/^#[0-9a-f]{6}$/i.test(color) ? color : '#172B4D'}"/>`).join('')}</linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

function withOpenGraph(html: string, content: any, pageUrl: string, imageUrl: string) {
  const title = content.brochure.tripTitle || content.brochure.destination;
  const description = (content.overview.summary || [content.brochure.destination, content.brochure.region, content.brochure.country].filter(Boolean).join(' · ')).trim();
  const safeDescription = Array.from(description).slice(0, 240).join('');
  const tags = `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(safeDescription)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(pageUrl)}"><meta property="og:image" content="${escape(imageUrl)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
  return html.replace('</head>', `${tags}</head>`);
}

export async function recoverPublication(store: Store, dataDir: string) {
  const pending = store.db.prepare("SELECT id,workspace_id FROM publish_operations WHERE status='pending'").all() as Array<{ id: string; workspace_id: string }>;
  if (pending.length) {
    const update = store.db.prepare("UPDATE publish_operations SET status='failed',error_code='SERVER_RESTARTED',updated_at=? WHERE workspace_id=? AND id=? AND status='pending'");
    for (const { id, workspace_id } of pending) update.run(now(), workspace_id, id);
  }
  const root = path.join(dataDir, 'published');
  await mkdir(root, { recursive: true });
  const referenced = new Set<string>((store.db.prepare('SELECT html_key AS key FROM published_versions UNION SELECT og_image_key AS key FROM published_versions').all() as Array<{ key: string }>).map(row => row.key));
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && /^[0-9a-f-]+\.(?:html|jpg)$/i.test(entry.name) && !referenced.has(entry.name)) await rm(path.join(root, entry.name), { force: true });
  }
  const temp = path.join(dataDir, 'tmp');
  await mkdir(temp, { recursive: true });
  for (const entry of await readdir(temp, { withFileTypes: true })) if (entry.isFile() && /^[0-9a-f-]+\.(?:html|jpg)\.stage$/i.test(entry.name)) await rm(path.join(temp, entry.name), { force: true });
}

export function publicationStatus(store: Store, itineraryId: string, origin: string) {
  const record = store.getItinerary(itineraryId);
  if (!record) return null;
  const state = readState(store, itineraryId);
  const row = state?.current_version_id ? store.db.prepare('SELECT id,source_revision,created_at FROM published_versions WHERE workspace_id=? AND itinerary_id=? AND id=?').get(store.workspaceId, itineraryId, state.current_version_id) as any : null;
  return { itineraryId, active: Boolean(activeLink(store, itineraryId, origin)), epoch: Number(state?.epoch || 0), currentVersion: row ? { id: row.id, sourceRevision: Number(row.source_revision), createdAt: row.created_at } : null, shareUrl: activeLink(store, itineraryId, origin), draftRevision: record.revision, draftDiffers: Boolean(row && Number(row.source_revision) !== record.revision) };
}

export function listPublishedVersions(store: Store, itineraryId: string, cursor: string | null, limit: number) {
  if (!store.getItinerary(itineraryId)) return null;
  const rows = cursor
    ? store.db.prepare('SELECT id,source_revision,created_at FROM published_versions WHERE workspace_id=? AND itinerary_id=? AND id<? ORDER BY id DESC LIMIT ?').all(store.workspaceId, itineraryId, cursor, limit)
    : store.db.prepare('SELECT id,source_revision,created_at FROM published_versions WHERE workspace_id=? AND itinerary_id=? ORDER BY id DESC LIMIT ?').all(store.workspaceId, itineraryId, limit);
  const items = (rows as any[]).map(row => ({ id: String(row.id), sourceRevision: Number(row.source_revision), createdAt: String(row.created_at) }));
  return { items, nextCursor: items.length === limit ? items.at(-1)?.id || null : null };
}

export function revokePublication(store: Store, itineraryId: string, expectedEpoch: number) {
  if (!store.getItinerary(itineraryId)) return { kind: 'missing' as const };
  const state = readState(store, itineraryId);
  const epoch = Number(state?.epoch || 0);
  if (expectedEpoch !== epoch) return { kind: 'conflict' as const, epoch };
  if (!state?.active_token_id) return { kind: 'ok' as const, epoch, active: false };
  const timestamp = now();
  transact(store.db, () => {
    store.db.prepare('UPDATE share_tokens SET revoked_at=? WHERE workspace_id=? AND itinerary_id=? AND id=? AND revoked_at IS NULL').run(timestamp, store.workspaceId, itineraryId, state.active_token_id);
    store.db.prepare('UPDATE publication_state SET active_token_id=NULL,epoch=epoch+1,updated_at=? WHERE workspace_id=? AND itinerary_id=? AND epoch=?').run(timestamp, store.workspaceId, itineraryId, epoch);
  });
  return { kind: 'ok' as const, epoch: epoch + 1, active: false };
}

export async function publishSavedRevision(input: {
  store: Store; itineraryId: string; expectedRevision: number; operationId: string; dataDir: string; stylesheetPath?: string; shareOrigin: string; afterPromote?: () => Promise<void>;
}) {
  const { store, itineraryId, expectedRevision, operationId, dataDir, stylesheetPath, shareOrigin } = input;
  const record = store.getItinerary(itineraryId);
  if (!record) return { kind: 'missing' as const };
  if (record.revision !== expectedRevision) return { kind: 'stale' as const, revision: record.revision };
  const state = readState(store, itineraryId);
  const epoch = Number(state?.epoch || 0);
  const activeTokenId = state?.active_token_id ? String(state.active_token_id) : null;
  const fingerprint = hash(`${store.workspaceId}:${itineraryId}:${expectedRevision}:${epoch}`);
  const prior = store.db.prepare('SELECT fingerprint,status,version_id,token_id,error_code FROM publish_operations WHERE workspace_id=? AND id=?').get(store.workspaceId, operationId) as any;
  if (prior) {
    if (prior.fingerprint !== fingerprint) return { kind: 'operation_conflict' as const };
    if (prior.status === 'pending') return { kind: 'pending' as const };
    if (prior.status !== 'completed') return { kind: 'failed' as const, code: prior.error_code || 'PUBLISH_FAILED' };
    const version = store.db.prepare('SELECT id,source_revision,created_at FROM published_versions WHERE workspace_id=? AND itinerary_id=? AND id=?').get(store.workspaceId, itineraryId, prior.version_id) as any;
    return { kind: 'published' as const, versionId: version?.id, sourceRevision: Number(version?.source_revision), createdAt: version?.created_at, shareUrl: prior.token_id === readState(store, itineraryId)?.active_token_id ? activeLink(store, itineraryId, shareOrigin) : null, replayed: true };
  }
  if (activeTokenId && state?.current_version_id) {
    const current = store.db.prepare('SELECT id,source_revision,created_at FROM published_versions WHERE workspace_id=? AND itinerary_id=? AND id=?').get(store.workspaceId, itineraryId, state.current_version_id) as any;
    if (current && Number(current.source_revision) === record.revision) {
      const timestamp = now();
      let reused = false;
      transact(store.db, () => {
        const latest = readState(store, itineraryId);
        reused = Number(latest?.epoch || 0) === epoch && latest?.active_token_id === activeTokenId && latest?.current_version_id === state.current_version_id;
        store.db.prepare(`INSERT INTO publish_operations(id,workspace_id,itinerary_id,fingerprint,status,version_id,token_id,error_code,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).run(operationId, store.workspaceId, itineraryId, fingerprint, reused ? 'completed' : 'failed', current.id, activeTokenId, reused ? null : 'PUBLICATION_CONFLICT', timestamp, timestamp);
      });
      if (!reused) return { kind: 'failed' as const, code: 'PUBLICATION_CONFLICT' };
      return { kind: 'published' as const, versionId: current.id, sourceRevision: Number(current.source_revision), createdAt: current.created_at, shareUrl: activeLink(store, itineraryId, shareOrigin), replayed: false };
    }
  }
  const operationTime = now();
  store.db.prepare("INSERT INTO publish_operations(id,workspace_id,itinerary_id,fingerprint,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)").run(operationId, store.workspaceId, itineraryId, fingerprint, operationTime, operationTime);
  const tokenId = activeTokenId || randomUUID();
  const tokenValue = activeTokenId
    ? String((store.db.prepare('SELECT token_value FROM share_tokens WHERE workspace_id=? AND itinerary_id=? AND id=? AND revoked_at IS NULL').get(store.workspaceId, itineraryId, activeTokenId) as any)?.token_value || '')
    : randomBytes(32).toString('base64url');
  if (!tokenValue) {
    store.db.prepare("UPDATE publish_operations SET status='failed',error_code='TOKEN_UNAVAILABLE',updated_at=? WHERE workspace_id=? AND id=?").run(now(), store.workspaceId, operationId);
    return { kind: 'failed' as const, code: 'TOKEN_UNAVAILABLE' };
  }
  let rendered: Awaited<ReturnType<typeof renderSavedDraftPreview>>;
  let html: string;
  let image: Buffer;
  try {
    rendered = await renderSavedDraftPreview(record, store, dataDir, stylesheetPath);
    if (!rendered.ok || !rendered.publishReady) {
      store.db.prepare("UPDATE publish_operations SET status='failed',error_code='PUBLISH_VALIDATION_FAILED',updated_at=? WHERE workspace_id=? AND id=?").run(now(), store.workspaceId, operationId);
      return { kind: 'invalid' as const, errors: rendered.errors, warnings: rendered.warnings, status: rendered.ok ? 422 : rendered.status };
    }
    html = withOpenGraph(rendered.html, record.draftContent, tokenUrl(shareOrigin, tokenValue), `${tokenUrl(shareOrigin, tokenValue)}/og-image`);
    image = await ogImage(record.draftContent, store, dataDir);
  } catch {
    store.db.prepare("UPDATE publish_operations SET status='failed',error_code='PUBLISH_RENDER_FAILED',updated_at=? WHERE workspace_id=? AND id=? AND status='pending'").run(now(), store.workspaceId, operationId);
    return { kind: 'failed' as const, code: 'PUBLISH_RENDER_FAILED' };
  }
  const versionId = randomUUID();
  const htmlKey = `${versionId}.html`; const imageKey = `${versionId}.jpg`;
  const finalDir = path.join(dataDir, 'published'); const tempDir = path.join(dataDir, 'tmp');
  const stagedHtml = path.join(tempDir, `${operationId}.html.stage`); const stagedImage = path.join(tempDir, `${operationId}.jpg.stage`);
  const finalHtml = path.join(finalDir, htmlKey); const finalImage = path.join(finalDir, imageKey);
  await mkdir(finalDir, { recursive: true }); await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(stagedHtml, html, { flag: 'wx' }); await writeFile(stagedImage, image, { flag: 'wx' });
    await rename(stagedHtml, finalHtml); await rename(stagedImage, finalImage);
    await input.afterPromote?.();
    if (store.getItinerary(itineraryId)?.revision !== expectedRevision) throw Object.assign(new Error('stale revision'), { code: 'REVISION_CONFLICT' });
    const completedAt = now();
    transact(store.db, () => {
      const currentState = readState(store, itineraryId);
      if (Number(currentState?.epoch || 0) !== epoch || (currentState?.active_token_id || null) !== activeTokenId || (currentState?.current_version_id || null) !== (state?.current_version_id || null)) throw Object.assign(new Error('publication state changed'), { code: 'PUBLICATION_CONFLICT' });
      if (store.getItinerary(itineraryId)?.revision !== expectedRevision) throw Object.assign(new Error('stale revision'), { code: 'REVISION_CONFLICT' });
      if (!activeTokenId) store.db.prepare('INSERT INTO share_tokens(id,workspace_id,itinerary_id,token_value,token_sha256,created_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)').run(tokenId, store.workspaceId, itineraryId, tokenValue, hash(tokenValue), completedAt);
      store.db.prepare('INSERT INTO published_versions(id,workspace_id,itinerary_id,source_revision,snapshot_json,schema_version,html_key,html_sha256,og_image_key,og_image_sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(versionId, store.workspaceId, itineraryId, expectedRevision, JSON.stringify(record.draftContent), 'web-1.0.0', htmlKey, hash(html), imageKey, hash(image), completedAt);
      store.db.prepare(`INSERT INTO publication_state(workspace_id,itinerary_id,current_version_id,active_token_id,epoch,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(workspace_id,itinerary_id) DO UPDATE SET current_version_id=excluded.current_version_id,active_token_id=excluded.active_token_id,updated_at=excluded.updated_at`)
        .run(store.workspaceId, itineraryId, versionId, tokenId, epoch, completedAt);
      store.db.prepare("UPDATE publish_operations SET status='completed',version_id=?,token_id=?,updated_at=? WHERE workspace_id=? AND id=? AND status='pending'").run(versionId, tokenId, completedAt, store.workspaceId, operationId);
    });
    return { kind: 'published' as const, versionId, sourceRevision: expectedRevision, createdAt: completedAt, shareUrl: tokenUrl(shareOrigin, tokenValue), replayed: false };
  } catch (cause) {
    await rm(stagedHtml, { force: true }); await rm(stagedImage, { force: true }); await rm(finalHtml, { force: true }); await rm(finalImage, { force: true });
    const code = (cause as any)?.code === 'REVISION_CONFLICT' || (cause as any)?.code === 'PUBLICATION_CONFLICT' ? (cause as any).code : 'PUBLISH_STORAGE_FAILED';
    store.db.prepare("UPDATE publish_operations SET status='failed',error_code=?,updated_at=? WHERE workspace_id=? AND id=? AND status='pending'").run(code, now(), store.workspaceId, operationId);
    return { kind: 'failed' as const, code };
  }
}

export async function readPublicPage(store: Store, dataDir: string, token: string, afterRead?: () => Promise<void>) {
  const row = store.db.prepare(`SELECT v.id,v.html_key,v.html_sha256 FROM share_tokens t JOIN publication_state s ON s.workspace_id=t.workspace_id AND s.itinerary_id=t.itinerary_id AND s.active_token_id=t.id
    JOIN published_versions v ON v.workspace_id=s.workspace_id AND v.itinerary_id=s.itinerary_id AND v.id=s.current_version_id
    WHERE t.token_value=? AND t.revoked_at IS NULL`).get(token) as { id: string; html_key: string; html_sha256: string } | undefined;
  if (!row || path.basename(row.html_key) !== row.html_key || !/^[0-9a-f-]+\.html$/i.test(row.html_key)) return null;
  try {
    const bytes = await readFile(path.join(dataDir, 'published', row.html_key));
    if (hash(bytes) !== row.html_sha256) return null;
    await afterRead?.();
    const current = store.db.prepare(`SELECT v.id,v.html_key,v.html_sha256 FROM share_tokens t JOIN publication_state s ON s.workspace_id=t.workspace_id AND s.itinerary_id=t.itinerary_id AND s.active_token_id=t.id
      JOIN published_versions v ON v.workspace_id=s.workspace_id AND v.itinerary_id=s.itinerary_id AND v.id=s.current_version_id
      WHERE t.token_value=? AND t.revoked_at IS NULL`).get(token) as { id: string; html_key: string; html_sha256: string } | undefined;
    return current?.id === row.id && current.html_key === row.html_key && current.html_sha256 === row.html_sha256 ? bytes : null;
  } catch { return null; }
}

export async function readPublicOgImage(store: Store, dataDir: string, token: string, afterRead?: () => Promise<void>) {
  const row = store.db.prepare(`SELECT v.id,v.og_image_key,v.og_image_sha256 FROM share_tokens t JOIN publication_state s ON s.workspace_id=t.workspace_id AND s.itinerary_id=t.itinerary_id AND s.active_token_id=t.id
    JOIN published_versions v ON v.workspace_id=s.workspace_id AND v.itinerary_id=s.itinerary_id AND v.id=s.current_version_id
    WHERE t.token_value=? AND t.revoked_at IS NULL`).get(token) as { id: string; og_image_key: string; og_image_sha256: string } | undefined;
  if (!row || path.basename(row.og_image_key) !== row.og_image_key || !/^[0-9a-f-]+\.jpg$/i.test(row.og_image_key)) return null;
  try {
    const bytes = await readFile(path.join(dataDir, 'published', row.og_image_key));
    if (hash(bytes) !== row.og_image_sha256) return null;
    await afterRead?.();
    const current = store.db.prepare(`SELECT v.id,v.og_image_key,v.og_image_sha256 FROM share_tokens t JOIN publication_state s ON s.workspace_id=t.workspace_id AND s.itinerary_id=t.itinerary_id AND s.active_token_id=t.id
      JOIN published_versions v ON v.workspace_id=s.workspace_id AND v.itinerary_id=s.itinerary_id AND v.id=s.current_version_id
      WHERE t.token_value=? AND t.revoked_at IS NULL`).get(token) as { id: string; og_image_key: string; og_image_sha256: string } | undefined;
    return current?.id === row.id && current.og_image_key === row.og_image_key && current.og_image_sha256 === row.og_image_sha256 ? bytes : null;
  } catch { return null; }
}
