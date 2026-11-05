import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist/client' },
  server: {
    host: '127.0.0.1',
    port: Number(process.env['VITE_PORT'] ?? 3001),
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env['PORT'] ?? '3002'}` } },
  },
});
