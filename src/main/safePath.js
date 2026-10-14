import path from 'node:path';

export function resolveInside(root, relativePath) {
    const base = path.resolve(root);
    const target = path.resolve(base, String(relativePath).replace(/^[\\/]+/, ''));

    return target.startsWith(base + path.sep) ? target : null;
}
