import { describe, expect, it } from 'vitest';
import {
    CUSTOM_GAME_COLORS,
    computeCustomTask,
    customTaskEnd,
    emptyCustomData,
    isCustomKey,
    isValidCustomData,
    nextCustomGameColor,
    nextCustomGameName,
} from '../../../src/shared/accounts/customData.js';

const task = {
    id: 'custom:task-1',
    label: 'Login event',
    category: 'Events',
    createdAt: '2026-10-25T12:00:00.000Z',
    endsAt: '2026-10-25T22:00:00.000Z',
};

const at = (iso) => new Date(iso);

describe('isCustomKey', () => {
    it.each([
        ['custom:abc', true],
        ['Genshin Impact', false],
        ['', false],
        [null, false],
        [undefined, false],
    ])('%j is %s', (key, expected) => {
        expect(isCustomKey(key)).toBe(expected);
    });
});

describe('nextCustomGameName', () => {
    it('starts plain and counts up', () => {
        expect(nextCustomGameName([])).toBe('My Game');
        expect(nextCustomGameName(['My Game'])).toBe('My Game 2');
        expect(nextCustomGameName(['my game', 'MY GAME 2'])).toBe('My Game 3');
    });

    it('fills gaps', () => {
        expect(nextCustomGameName(['My Game', 'My Game 3'])).toBe('My Game 2');
    });
});

describe('nextCustomGameColor', () => {
    it('takes the first unused color', () => {
        expect(nextCustomGameColor([])).toBe(CUSTOM_GAME_COLORS[0]);
        expect(nextCustomGameColor([CUSTOM_GAME_COLORS[0], CUSTOM_GAME_COLORS[2]])).toBe(CUSTOM_GAME_COLORS[1]);
    });

    it('cycles once every color is used', () => {
        expect(nextCustomGameColor(CUSTOM_GAME_COLORS)).toBe(CUSTOM_GAME_COLORS[0]);
        expect(nextCustomGameColor([...CUSTOM_GAME_COLORS, CUSTOM_GAME_COLORS[0]])).toBe(CUSTOM_GAME_COLORS[1]);
    });
});

describe('customTaskEnd', () => {
    it('adds minutes', () => {
        expect(customTaskEnd(90, at('2026-10-25T12:00:00Z')).toISOString()).toBe('2026-10-25T13:30:00.000Z');
    });
});

describe('computeCustomTask', () => {
    it('counts down while open', () => {
        expect(computeCustomTask(task, null, at('2026-10-25T20:00:00Z'))).toEqual({
            id: 'custom:task-1',
            label: 'Login event',
            type: 'Events',
            custom: true,
            endsAt: task.endsAt,
            last_completed: null,
            ended: false,
            isCompleted: false,
            isDisabled: false,
            duration: 10 * 3_600_000,
            nextReset: 2 * 3_600_000,
        });
    });

    it('completed stays completed after the end', () => {
        const done = computeCustomTask(task, '2026-10-25T13:00:00.000Z', at('2026-10-26T00:00:00Z'));

        expect(done).toMatchObject({ ended: true, isCompleted: true, isDisabled: false, nextReset: 0, duration: 0 });
    });

    it('ends exactly at the deadline', () => {
        expect(computeCustomTask(task, undefined, at(task.endsAt))).toMatchObject({
            ended: true,
            isDisabled: true,
            isCompleted: false,
            last_completed: null,
        });
    });
});

describe('isValidCustomData', () => {
    it('accepts empty data', () => {
        expect(isValidCustomData(emptyCustomData())).toBe(true);
    });

    it('accepts games and tasks', () => {
        expect(
            isValidCustomData({
                games: { 'custom:game': { name: 'Arknights', color: '#7AA2F7' } },
                tasks: { 'custom:game': [task], 'Genshin Impact': [{ ...task, id: 'custom:task-2' }] },
            }),
        ).toBe(true);
    });

    it.each([
        ['missing tasks', { games: {} }],
        ['a name that is too long', { games: { 'custom:g': { name: 'x'.repeat(41), color: '#7aa2f7' } }, tasks: {} }],
        ['a short color', { games: { 'custom:g': { name: 'X', color: '#fff' } }, tasks: {} }],
        ['a category that is too long', { games: {}, tasks: { G: [{ ...task, category: 'x'.repeat(31) }] } }],
        ['a missing start', { games: {}, tasks: { G: [{ ...task, createdAt: undefined }] } }],
    ])('rejects %s', (_, data) => {
        expect(isValidCustomData(data)).toBe(false);
    });
});
