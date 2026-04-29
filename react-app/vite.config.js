import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    assetsDir: 'bundle',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
});

