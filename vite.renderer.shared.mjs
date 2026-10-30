import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { REPORT_ORIGINS } from './src/shared/remote.js';

export const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const { version } = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function contentSecurityPolicy(directives) {
    const content = Object.entries(directives)
        .map(([name, sources]) => `${name} ${sources.join(' ')}`)
        .join('; ');

    return {
        name: 'content-security-policy',
        transformIndexHtml: {
            order: 'pre',
            handler: (html) => html.replace('__CONTENT_SECURITY_POLICY__', content),
        },
    };
}

export function rendererConfig({ platform, imageSources = [], connectSources = [] }) {
    return {
        root: path.join(projectRoot, 'src/renderer'),
        define: {
            __APP_VERSION__: JSON.stringify(version),
        },
        plugins: [
            vue(),
            contentSecurityPolicy({
                'default-src': ["'self'"],
                'img-src': ["'self'", 'data:', ...imageSources],
                'connect-src': ["'self'", ...connectSources, ...REPORT_ORIGINS],
                'script-src': ["'self'"],
                'style-src': ["'self'", "'unsafe-inline'"],
            }),
        ],
        resolve: {
            alias: {
                '#platform': path.join(projectRoot, 'src/renderer/platform', platform),
            },
        },
        server: {
            fs: {
                allow: [path.join(projectRoot, 'src')],
            },
        },
    };
}
