import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'local-vision-runtime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = (req.url || '').split('?')[0];
        if (!/^\/(ort|vision-wasm)\/[a-z0-9_.-]+$/.test(route)) return next();
        const file = path.resolve(__dirname, 'public', route.slice(1));
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        fs.createReadStream(file).pipe(res);
      });
    },
  }],
  server: {
    host: true, // Listen on all local IP addresses (0.0.0.0) so smartphone on Wi-Fi can connect
    allowedHosts: true, // Allow external public tunnel domains
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
