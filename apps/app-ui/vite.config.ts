import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  publicDir: resolve(import.meta.dirname, '../../desktop-shell/public'),
  build: { outDir: resolve(import.meta.dirname, '../../dist-vnext'), emptyOutDir: true },
  server: { strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: [resolve(import.meta.dirname, './src/setupTests.ts')],
  },
});
