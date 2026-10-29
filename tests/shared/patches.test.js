import { describe, expect, it } from 'vitest';
import {
    currentPatch,
    currentPatchIndex,
    earliestPatchStart,
    patchEndDate,
    patchSecondPhaseDate,
    validatePatches,
} from '../../src/shared/patches.js';
import { makeGame, patch } from '../helpers/builders.js';

const at = (iso) => new Date(iso);

describe('currentPatchIndex', () => {
    const game = makeGame();

    it.each([
        ['2026-08-01T00:00:00Z', '1.0'],
        ['2026-10-06T21:59:59Z', '1.0'],
        ['2026-10-06T22:00:00Z', '1.1'],
        ['2026-11-17T21:59:59Z', '1.1'],
        ['2026-11-17T22:00:00Z', '1.2'],
        ['2027-06-01T00:00:00Z', '1.2'],
    ])('at %s is %s', (iso, version) => {
        expect(currentPatch(game, at(iso)).version).toBe(version);
    });

    it('never picks a version-only row', () => {
        expect(currentPatchIndex(game, at('2030-01-01T00:00:00Z'))).toBe(2);
    });
});

describe('patch dates', () => {
    it('second phase and end', () => {
        const entry = patch('1.0', '2026-10-07', { version_duration: 44, second_phase_offset: 1 });

        expect(patchSecondPhaseDate(entry)).toBe('2026-10-30');
        expect(patchEndDate(entry)).toBe('2026-11-20');
    });

    it('earliest start', () => {
        expect(earliestPatchStart(makeGame())).toBe('2026-08-26');
        expect(earliestPatchStart({ patches: [{ version: '1.0' }] })).toBeNull();
    });
});

describe('validatePatches', () => {
    const check = (patches) => () => validatePatches('Test', { patches });

    it('accepts the base game', () => {
        expect(check(makeGame().patches)).not.toThrow();
    });

    it.each([
        ['no patches', undefined, 'Test: missing patches'],
        ['empty list', [], 'Test: missing patches'],
        ['no version', [{ version_start: '2026-10-07' }], 'patches[0] needs a version'],
        ['only version rows', [{ version: '1.0' }], 'needs at least one dated patch'],
        [
            'dated after a version row',
            [{ version: '1.0' }, patch('1.1', '2026-10-07')],
            'dated but comes after a version-only row',
        ],
        ['bad start', [patch('1.0', '2026-13-01')], 'version_start must be YYYY-MM-DD'],
        ['bad duration', [patch('1.0', '2026-10-07', { version_duration: 0 })], 'version_duration must be'],
        [
            'overlapping patches',
            [patch('1.0', '2026-10-07'), patch('1.1', '2026-11-01')],
            'starts before the previous patch ends',
        ],
    ])('%s', (_, patches, message) => {
        expect(check(patches)).toThrow(message);
    });
});
