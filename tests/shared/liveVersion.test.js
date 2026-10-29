import { describe, expect, it } from 'vitest';
import { getLiveVersion } from '../../src/shared/liveVersion.js';
import { makeGame } from '../helpers/builders.js';

const at = (iso) => new Date(iso);

describe('getLiveVersion', () => {
    const game = makeGame();

    it('current until the next patch opens', () => {
        expect(getLiveVersion(game, at('2026-10-25T12:00:00Z'))).toBe('1.1');
        expect(getLiveVersion(game, at('2026-11-17T21:59:59Z'))).toBe('1.1');
        expect(getLiveVersion(game, at('2026-11-18T02:59:59Z'))).toBe('1.1');
    });

    it('next after maintenance ends', () => {
        expect(getLiveVersion(game, at('2026-11-18T03:00:00Z'))).toBe('1.2');
        expect(getLiveVersion(game, at('2026-12-29T12:00:00Z'))).toBe('1.2');
    });

    it('stays on the last dated patch after it ends', () => {
        expect(getLiveVersion(game, at('2026-12-30T03:00:00Z'))).toBe('1.2');
        expect(getLiveVersion(game, at('2027-06-01T00:00:00Z'))).toBe('1.2');
    });

    it('older patches from the archive', () => {
        expect(getLiveVersion(game, at('2026-09-01T00:00:00Z'))).toBe('1.0');
        expect(getLiveVersion(game, at('2026-01-01T00:00:00Z'))).toBe('1.0');
    });

    it('start date only without maintenance', () => {
        expect(getLiveVersion(makeGame({ maintenance: undefined }), at('2026-11-17T16:00:00Z'))).toBe('1.2');
        expect(getLiveVersion(makeGame({ maintenance: undefined }), at('2026-11-17T15:59:59Z'))).toBe('1.1');
    });

    it('uses the global offset of the game', () => {
        const western = makeGame({ global_utc_offset: -5 });

        expect(getLiveVersion(western, at('2026-11-18T15:59:59Z'))).toBe('1.1');
        expect(getLiveVersion(western, at('2026-11-18T16:00:00Z'))).toBe('1.2');
    });
});
