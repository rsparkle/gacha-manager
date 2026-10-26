import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInside } from '../../src/main/safePath.js';

const root = path.resolve('/app/assets');

describe('resolveInside', () => {
    it.each([
        ['characters/alice.webp', path.join(root, 'characters', 'alice.webp')],
        ['/characters/alice.webp', path.join(root, 'characters', 'alice.webp')],
        ['games/../characters/a.webp', path.join(root, 'characters', 'a.webp')],
    ])('allows %s', (relative, expected) => {
        expect(resolveInside(root, relative)).toBe(expected);
    });

    it.each([['../secret.txt'], ['characters/../../secret.txt'], [''], ['.'], ['..']])('blocks %j', (relative) => {
        expect(resolveInside(root, relative)).toBeNull();
    });

    it('blocks a sibling with the same prefix', () => {
        expect(resolveInside(root, '../assets2/x.webp')).toBeNull();
    });
});
