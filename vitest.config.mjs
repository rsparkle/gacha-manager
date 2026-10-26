import { defineConfig } from 'vitest/config';

const GAME_DATA_SOURCES = {
    assets: () => process.env.GAME_DATA_DIR ?? '../gacha-manager-assets',
    remote: () => 'remote',
};

export default defineConfig(({ mode }) => ({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
        testTimeout: 20_000,
        env: {
            GAME_DATA_SOURCE: GAME_DATA_SOURCES[mode]?.() ?? 'fixture',
        },
        coverage: {
            provider: 'v8',
            include: [
                'src/shared/**',
                'src/main/accountsStorage.js',
                'src/main/appVersion.js',
                'src/main/safePath.js',
                'src/renderer/lib/**',
                'src/renderer/platform/web/storage.js',
                'src/renderer/platform/web/images.js',
            ],
        },
    },
}));
