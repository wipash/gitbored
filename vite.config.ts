import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist/client' },
  server: {
    host: '127.0.0.1',
    port: Number(process.env['VITE_PORT'] ?? 3001),
    strictPort: true,
    headers: { 'Referrer-Policy': 'no-referrer' },
    // Preserve backend routing/security semantics for encoded API prefixes in source-mode browser checks.
    proxy: { '^/(?:a|%61)(?:p|%70)(?:i|%69)(?:/|$)': { target: `http://127.0.0.1:${process.env['PORT'] ?? '3002'}`, ws: true } },
  },
});
