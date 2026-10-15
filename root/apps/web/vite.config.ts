import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // These entries contain only DTOs/constants; the package root initializes the server router.
      '@root/trpc-contract/evaluation': fileURLToPath(new URL('../../packages/trpc-contract/src/evaluation.ts', import.meta.url)),
      '@root/trpc-contract/report': fileURLToPath(new URL('../../packages/trpc-contract/src/report.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: { usePolling: process.env.DOCKER_DEV === 'true' },
    proxy: {
      '/trpc': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
