import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          tdesign: ['tdesign-vue-next', 'tdesign-icons-vue-next'],
          vue: ['vue', 'vue-router'],
        },
      },
    },
  },
  server: {
    port: 5577,
    proxy: {
      '/api': 'http://127.0.0.1:7788',
    },
  },
});
