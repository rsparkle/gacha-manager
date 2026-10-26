import path from 'node:path';
import { defineConfig } from 'vite';
import { projectRoot, rendererConfig } from './vite.renderer.shared.mjs';
import { ASSETS_BASE } from './src/shared/gameData.js';

const assetsOrigin = new URL(ASSETS_BASE).origin;

export default defineConfig({
    ...rendererConfig({
        platform: 'web/index.js',
        imageSources: [assetsOrigin],
        connectSources: [assetsOrigin],
    }),
    base: './',
    build: {
        outDir: path.join(projectRoot, 'dist/web'),
        emptyOutDir: true,
    },
});
