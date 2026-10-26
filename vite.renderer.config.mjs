import { defineConfig } from 'vite';
import { rendererConfig } from './vite.renderer.shared.mjs';

export default defineConfig(
    rendererConfig({
        platform: 'electron.js',
        imageSources: ['asset:'],
    }),
);
