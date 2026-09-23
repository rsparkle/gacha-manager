import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'electron-store'],
    },
  },
  resolve: {
    browserField: false,
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});