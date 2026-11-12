import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'output/releases/standalone');
const runtimePackages = ['@fastify/multipart', '@fastify/static', 'ajv', 'ajv-formats', 'fastify', 'franc', 'sharp', 'unpdf', '@fontsource-variable/noto-sans', '@fontsource-variable/noto-sans-jp', '@fontsource-variable/noto-sans-sc'];
const sourceLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lockPackages = sourceLock.packages;
const runtimeDependencies = Object.fromEntries(runtimePackages.map(name => {
  const entry = lockPackages[`node_modules/${name}`];
  if (!entry?.version) throw new Error(`Runtime dependency missing from source lock: ${name}`);
  return [name, entry.version];
}));

function resolveLockedPackage(fromKey, name) {
  let cursor = fromKey;
  while (cursor) {
    const candidate = `${cursor}/node_modules/${name}`;
    if (lockPackages[candidate]) return candidate;
    const slash = cursor.lastIndexOf('/');
    cursor = slash < 0 ? '' : cursor.slice(0, slash);
  }
  const rootCandidate = `node_modules/${name}`;
  return lockPackages[rootCandidate] ? rootCandidate : null;
}

const included = new Set(); const queue = runtimePackages.map(name => `node_modules/${name}`);
while (queue.length) {
  const key = queue.pop();
  if (included.has(key)) continue;
  const entry = lockPackages[key];
  if (!entry) throw new Error(`Transitive runtime dependency missing from source lock: ${key}`);
  included.add(key);
  for (const name of new Set([...Object.keys(entry.dependencies || {}), ...Object.keys(entry.optionalDependencies || {}), ...Object.keys(entry.peerDependencies || {})])) {
    const peerOptional = entry.peerDependenciesMeta?.[name]?.optional === true;
    if (peerOptional) continue;
    const resolved = resolveLockedPackage(key, name);
    if (resolved) queue.push(resolved);
    else if (!entry.optionalDependencies?.[name]) throw new Error(`Could not resolve ${name} from ${key}`);
  }
}

const selectedPackages = { '': { name: 'itinerary-engine-runtime', version: sourcePackage.version, dependencies: runtimeDependencies } };
for (const key of [...included].sort()) {
  const entry = { ...lockPackages[key] };
  delete entry.dev; delete entry.devOptional;
  selectedPackages[key] = entry;
}
const releasePackage = {
  name: 'itinerary-engine-runtime', version: sourcePackage.version, private: true, type: 'module',
  engines: { node: '>=24 <25' }, scripts: { start: 'node server/server/main.js' }, dependencies: runtimeDependencies
};
const releaseLock = { name: releasePackage.name, version: releasePackage.version, lockfileVersion: 3, requires: true, packages: selectedPackages };

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'output/releases/.build-runtime/src'), path.join(output, 'server'), { recursive: true });
await cp(path.join(root, 'output/releases/.build-runtime/config'), path.join(output, 'config'), { recursive: true });
await cp(path.join(root, 'dist'), path.join(output, 'dist'), { recursive: true });
await cp(path.join(root, 'config/palettes.json'), path.join(output, 'config/palettes.json'));
await cp(path.join(root, 'config/web'), path.join(output, 'config/web'), { recursive: true });
await mkdir(path.join(output, 'runtime'), { recursive: true });
await cp(path.join(root, '.runtime/web-render/brochure.css'), path.join(output, 'runtime/brochure.css'));
await cp(path.join(root, 'deploy/runtime.env.example'), path.join(output, 'runtime.env.example'));
await cp(path.join(root, 'deploy/itinerary-engine.service'), path.join(output, 'itinerary-engine.service'));
await cp(path.join(root, 'deploy/Caddyfile.example'), path.join(output, 'Caddyfile.example'));
await writeFile(path.join(output, 'package.json'), `${JSON.stringify(releasePackage, null, 2)}\n`);
await writeFile(path.join(output, 'package-lock.json'), `${JSON.stringify(releaseLock, null, 2)}\n`);

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}
const fileEntries = [];
for (const relative of (await listFiles(output)).sort()) {
  if (relative === 'release-manifest.json') continue;
  const bytes = await readFile(path.join(output, relative));
  fileEntries.push({ path: relative, bytes: (await stat(path.join(output, relative))).size, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const buildId = createHash('sha256').update(fileEntries.map(file => `${file.path}:${file.sha256}`).join('\n')).digest('hex').slice(0, 12);
const manifest = { format: 1, buildId, applicationVersion: sourcePackage.version, nodeRange: releasePackage.engines.node, runtimeDependencies, fileCount: fileEntries.length, totalBytes: fileEntries.reduce((sum, file) => sum + file.bytes, 0), files: fileEntries };
await writeFile(path.join(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), buildId, fileCount: manifest.fileCount, bytes: manifest.totalBytes, dependencies: Object.keys(runtimeDependencies) }));
