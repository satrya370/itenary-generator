import { existsSync } from 'node:fs';
import { createApp } from './app.js';

if (existsSync('.env.web')) process.loadEnvFile('.env.web');

const host = process.env.HOST || '127.0.0.1';
if (host !== '127.0.0.1' && host !== '::1') throw new Error('The standalone editor server may bind only to loopback.');
const app = await createApp();
await app.listen({ host, port: Number(process.env.PORT || 3000) });
const shutdown = async () => { await app.close(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
