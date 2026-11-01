import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { TDesignResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    // 按需引入 TDesign 组件与样式（不注册全量组件，包体积从 1.4MB 降到 ~700KB）
    Components({
      dts: false,
      resolvers: [TDesignResolver({ library: 'vue-next', importStyle: 'css' })],
    }),
  ],
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
