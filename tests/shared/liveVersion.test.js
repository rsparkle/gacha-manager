import { describe, expect, it } from 'vitest';
import { getLiveVersion } from '../../src/shared/liveVersion.js';
import { makeGame } from '../helpers/builders.js';

const at = (iso) => new Date(iso);

describe('getLiveVersion', () => {
    const game = makeGame();

    it('current until the next patch opens', () => {
        expect(getLiveVersion(game, at('2026-10-25T12:00:00Z'))).toBe('1.1');
        expect(getLiveVersion(game, at('2026-11-18T02:59:59Z'))).toBe('1.1');
    });

    it('next after maintenance ends', () => {
        expect(getLiveVersion(game, at('2026-11-18T03:00:00Z'))).toBe('1.2');
        expect(getLiveVersion(game, at('2026-12-29T12:00:00Z'))).toBe('1.2');
    });

    it('future version when data is 2 patches behind', () => {
        expect(getLiveVersion(game, at('2026-12-30T03:00:00Z'))).toBe('1.3');
    });

    it('next version when future has no duration', () => {
        const noDuration = makeGame({ next: { version_duration: undefined } });

        expect(getLiveVersion(noDuration, at('2027-06-01T00:00:00Z'))).toBe('1.2');
    });

    it('current version when data is incomplete', () => {
        expect(getLiveVersion(makeGame({ next: { version: undefined } }), at('2027-01-01T00:00:00Z'))).toBe('1.1');
        expect(getLiveVersion(makeGame({ maintenance: undefined }), at('2027-01-01T00:00:00Z'))).toBe('1.1');
    });

    it('uses the global offset of the game', () => {
        const western = makeGame({ global_utc_offset: -5 });

        expect(getLiveVersion(western, at('2026-11-18T15:59:59Z'))).toBe('1.1');
        expect(getLiveVersion(western, at('2026-11-18T16:00:00Z'))).toBe('1.2');
    });
});
