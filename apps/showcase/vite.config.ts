import { defineConfig } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './src/routes.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  base: '/polina-russian-site/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: [{
    name: 'known-static-pages',
    writeBundle() {
      const dist = resolve(root, 'dist');
      const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
      for (const route of routes.filter(route => route !== '/')) {
        const directory = resolve(dist, route.slice(1));
        mkdirSync(directory, { recursive: true });
        writeFileSync(resolve(directory, 'index.html'), html);
      }
      writeFileSync(resolve(dist, '404.html'), html);
    },
  }],
});
