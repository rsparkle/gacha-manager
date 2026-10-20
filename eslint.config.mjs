import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    { ignores: ['**/.vite/**', 'out/**'] },
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['src/main/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly' },
        },
    },
    {
        files: ['src/renderer/**/*.{js,vue}', 'src/shared/**/*.js'],
        languageOptions: { globals: { ...globals.browser } },
    },
    {
        files: ['forge.config.js'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    },
    {
        files: ['vite.*.mjs'],
        languageOptions: { globals: { ...globals.node } },
    },
    prettier,
];