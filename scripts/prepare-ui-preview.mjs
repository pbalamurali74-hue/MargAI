import { cp, mkdir, rm } from 'node:fs/promises';
// Static presentation build only. The Google Cloud API and vision service remain separate.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await cp(new URL('../apps/web/dist/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true });
console.log('Prepared dist/ from the verified web build. Backend origin configuration is preserved.');
