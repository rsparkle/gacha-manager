import { describe, expect, it } from 'vitest';
import { isOlderVersion } from '../../src/main/appVersion.js';
import packageJson from '../../package.json' with { type: 'json' };

describe('isOlderVersion', () => {
    it.each([
        ['1.1.6', '1.1.7', true],
        ['1.1.7', '1.1.7', false],
        ['1.1.8', '1.1.7', false],
        ['1.1.9', '1.1.10', true],
        ['1.1.10', '1.1.9', false],
        ['1.9.9', '2.0.0', true],
        ['2.0.0', '1.99.99', false],
        ['1.2', '1.2.0', false],
        ['1.2', '1.2.1', true],
        ['1.2.0', '1.2', false],
    ])('%s older than %s: %s', (current, minimum, expected) => {
        expect(isOlderVersion(current, minimum)).toBe(expected);
    });

    it('package.json version is x.y.z', () => {
        expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});
