import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  plugins: [vue()],
  server: {
    fs: {
      allow: [path.join(__dirname, 'src')],
    },
  },
});