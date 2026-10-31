import { describe, expect, it } from 'vitest';
import {
    CUSTOM_GAME_COLORS,
    computeCustomTask,
    customCycleLength,
    customTaskEnd,
    emptyCustomData,
    isCustomKey,
    isValidCustomData,
    nextCustomGameColor,
    normalizeCustomData,
    nextCustomGameName,
    normalizeCustomReset,
    resetKindForCategory,
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

describe('computeCustomTask with a reset rule', () => {
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const withReset = (reset) => ({ id: 'custom:task-2', label: 'Login', category: 'Daily', reset });

    it('daily resets at the chosen local time, across DST', () => {
        const daily = withReset({ kind: 'daily', zone: 'Europe/Lisbon', time: '04:00' });

        expect(computeCustomTask(daily, null, at('2026-10-25T00:30:00Z'))).toEqual({
            id: 'custom:task-2',
            label: 'Login',
            type: 'Daily',
            custom: true,
            reset: { kind: 'daily', zone: 'Europe/Lisbon', time: '04:00' },
            last_completed: null,
            ended: false,
            startsIn: null,
            isDisabled: false,
            isCompleted: false,
            duration: 25 * HOUR,
            nextReset: 3.5 * HOUR,
        });
        expect(computeCustomTask(daily, null, at('2026-10-26T00:00:00Z'))).toMatchObject({
            duration: DAY,
            nextReset: 4 * HOUR,
        });
    });

    it('weekly resets every x weeks from the first reset', () => {
        const weekly = withReset({
            kind: 'weekly',
            zone: 'Asia/Tokyo',
            anchor: '2026-11-02T04:00:00.000Z',
            everyWeeks: 2,
        });

        expect(computeCustomTask(weekly, null, at('2026-10-26T04:00:00Z'))).toMatchObject({
            duration: 14 * DAY,
            nextReset: 7 * DAY,
        });
        expect(computeCustomTask(weekly, null, at('2026-11-20T04:00:00Z'))).toMatchObject({
            duration: 14 * DAY,
            nextReset: 10 * DAY,
        });
    });

    it('monthly resets on the chosen days and clamps to short months', () => {
        const monthly = withReset({ kind: 'monthly', zone: 'Europe/Lisbon', time: '04:00', monthDays: [1, 15] });

        expect(computeCustomTask(monthly, null, at('2026-11-20T04:00:00Z'))).toMatchObject({
            duration: 16 * DAY,
            nextReset: 11 * DAY,
        });

        const endOfMonth = withReset({ kind: 'monthly', zone: 'Europe/Lisbon', time: '04:00', monthDays: [31] });

        expect(computeCustomTask(endOfMonth, null, at('2027-02-10T04:00:00Z'))).toMatchObject({
            duration: 28 * DAY,
            nextReset: 18 * DAY,
        });
    });

    it('only counts completions inside the current window', () => {
        const daily = withReset({ kind: 'daily', zone: 'UTC', time: '09:00' });
        const now = at('2026-11-12T12:00:00Z');

        expect(computeCustomTask(daily, '2026-11-12T10:00:00.000Z', now)).toMatchObject({ isCompleted: true });
        expect(computeCustomTask(daily, '2026-11-12T08:00:00.000Z', now)).toMatchObject({ isCompleted: false });
    });

    it('never ends', () => {
        const daily = withReset({ kind: 'daily', zone: 'UTC', time: '00:00' });

        expect(computeCustomTask(daily, null, at('2027-06-01T12:00:00Z'))).toMatchObject({
            ended: false,
            isDisabled: false,
            nextReset: 12 * HOUR,
        });
    });
});

describe('computeCustomTask with a cycle', () => {
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const cycleTask = (startsAt, endsAt, zone = 'UTC') => ({
        id: 'custom:task-3',
        label: 'Raid',
        category: 'Endgame',
        reset: { kind: 'cycle', zone, startsAt, endsAt },
    });

    it('repeats the start-to-end span, keeping the local time across DST', () => {
        const abyss = cycleTask('2026-10-19T03:00:00.000Z', '2026-11-02T04:00:00.000Z', 'Europe/Lisbon');

        expect(computeCustomTask(abyss, null, at('2026-10-20T04:00:00Z'))).toMatchObject({
            ended: false,
            isDisabled: false,
            duration: 14 * DAY + HOUR,
            nextReset: 13 * DAY,
        });
        expect(computeCustomTask(abyss, null, at('2026-11-10T12:00:00Z'))).toMatchObject({
            duration: 14 * DAY,
            nextReset: 5 * DAY + 16 * HOUR,
        });
    });

    it('starts a new cycle exactly at the end', () => {
        const cycle = cycleTask('2026-11-01T04:00:00.000Z', '2026-11-08T04:00:00.000Z');

        expect(computeCustomTask(cycle, null, at('2026-11-08T04:00:00Z'))).toMatchObject({ nextReset: 7 * DAY });
    });

    it('keeps odd lengths exact', () => {
        const cycle = cycleTask('2026-11-01T10:00:00.000Z', '2026-11-01T22:30:00.000Z');

        expect(computeCustomTask(cycle, null, at('2026-11-02T12:00:00Z'))).toMatchObject({
            duration: 12.5 * HOUR,
            nextReset: 11.5 * HOUR,
        });
    });

    it('is inactive before the start', () => {
        const cycle = cycleTask('2026-11-20T04:00:00.000Z', '2026-12-04T04:00:00.000Z');

        expect(computeCustomTask(cycle, '2026-11-10T12:00:00.000Z', at('2026-11-15T00:00:00Z'))).toMatchObject({
            ended: false,
            startsIn: 5 * DAY + 4 * HOUR,
            isDisabled: true,
            isCompleted: false,
            duration: 0,
            nextReset: 0,
        });
    });

    it('has no start countdown once running', () => {
        const cycle = cycleTask('2026-11-01T04:00:00.000Z', '2026-11-08T04:00:00.000Z');

        expect(computeCustomTask(cycle, null, at('2026-11-10T12:00:00Z')).startsIn).toBeNull();
    });

    it('only counts completions inside the current cycle', () => {
        const cycle = cycleTask('2026-11-01T04:00:00.000Z', '2026-11-08T04:00:00.000Z');
        const now = at('2026-11-10T12:00:00Z');

        expect(computeCustomTask(cycle, '2026-11-09T12:00:00.000Z', now)).toMatchObject({ isCompleted: true });
        expect(computeCustomTask(cycle, '2026-11-07T12:00:00.000Z', now)).toMatchObject({ isCompleted: false });
    });
});

describe('customCycleLength', () => {
    const DAY = 86_400_000;
    const cycle = (startsAt, endsAt) => ({ kind: 'cycle', zone: 'Europe/Lisbon', startsAt, endsAt });

    it('counts calendar days when start and end share a local time', () => {
        expect(customCycleLength(cycle('2026-10-09T23:00:00.000Z', '2026-11-07T00:00:00.000Z'))).toBe(28 * DAY);
    });

    it('uses the exact length otherwise', () => {
        expect(customCycleLength(cycle('2026-11-01T10:00:00.000Z', '2026-11-01T22:30:00.000Z'))).toBe(12.5 * 3_600_000);
    });
});

describe('normalizeCustomReset', () => {
    const zone = 'Europe/Lisbon';

    it('keeps only the fields each rule uses', () => {
        expect(normalizeCustomReset({ kind: 'daily', zone, time: '04:00', extra: 1 })).toEqual({
            kind: 'daily',
            zone,
            time: '04:00',
        });
        expect(normalizeCustomReset({ kind: 'weekly', zone, anchor: '2026-11-02T04:00Z', everyWeeks: '3' })).toEqual({
            kind: 'weekly',
            zone,
            anchor: '2026-11-02T04:00:00.000Z',
            everyWeeks: 3,
        });
        expect(normalizeCustomReset({ kind: 'monthly', zone, time: '04:00', monthDays: [15, '1', 15] })).toEqual({
            kind: 'monthly',
            zone,
            time: '04:00',
            monthDays: [1, 15],
        });
        expect(
            normalizeCustomReset({ kind: 'cycle', zone, startsAt: '2026-11-01T04:00Z', endsAt: '2026-11-15T04:00Z' }),
        ).toEqual({ kind: 'cycle', zone, startsAt: '2026-11-01T04:00:00.000Z', endsAt: '2026-11-15T04:00:00.000Z' });
    });

    it.each([
        [undefined, 'Unknown reset rule'],
        ['daily', 'Unknown reset rule'],
        [{ kind: 'yearly', zone }, 'Unknown reset rule'],
        [{ kind: 'daily', time: '04:00' }, 'Unknown time zone'],
        [{ kind: 'daily', zone: 'Mars/Olympus', time: '04:00' }, 'Unknown time zone'],
        [{ kind: 'daily', zone }, 'Set a reset time'],
        [{ kind: 'daily', zone, time: '24:00' }, 'Set a reset time'],
        [{ kind: 'daily', zone, time: '4pm' }, 'Set a reset time'],
        [{ kind: 'weekly', zone, everyWeeks: 1 }, 'Set the first reset'],
        [{ kind: 'weekly', zone, anchor: '2026-11-02T04:00Z', everyWeeks: 0 }, 'Reset every 1 to 52 weeks'],
        [{ kind: 'weekly', zone, anchor: '2026-11-02T04:00Z', everyWeeks: 53 }, 'Reset every 1 to 52 weeks'],
        [{ kind: 'weekly', zone, anchor: '2026-11-02T04:00Z', everyWeeks: 1.5 }, 'Reset every 1 to 52 weeks'],
        [{ kind: 'monthly', zone, time: '04:00', monthDays: [] }, 'Pick at least one day'],
        [{ kind: 'monthly', zone, time: '04:00' }, 'Pick at least one day'],
        [{ kind: 'monthly', zone, time: '04:00', monthDays: [0] }, 'from 1 to 31'],
        [{ kind: 'monthly', zone, time: '04:00', monthDays: [32] }, 'from 1 to 31'],
        [{ kind: 'monthly', zone, monthDays: [1] }, 'Set a reset time'],
        [{ kind: 'cycle', zone }, 'Set a start and an end'],
        [{ kind: 'cycle', zone, startsAt: '2026-11-01T04:00:00Z', endsAt: 'soon' }, 'Set a start and an end'],
        [{ kind: 'cycle', zone, startsAt: '2026-11-08T04:00:00Z', endsAt: '2026-11-01T04:00:00Z' }, 'after the start'],
        [{ kind: 'cycle', zone, startsAt: '2026-11-01T04:00:00Z', endsAt: '2026-11-01T04:00:00Z' }, 'after the start'],
        [{ kind: 'cycle', zone, startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-03T00:00:00Z' }, 'at most 366 days'],
    ])('rejects %j', (reset, message) => {
        expect(() => normalizeCustomReset(reset)).toThrow(message);
    });
});

describe('resetKindForCategory', () => {
    it.each([
        ['Daily', 'daily'],
        [' daily ', 'daily'],
        ['WEEKLY', 'weekly'],
        ['Monthly', 'monthly'],
        ['Endgame', 'cycle'],
        ['Dailies', null],
        ['Weekend login', null],
        ['Monthly sub', null],
        ['Event', null],
        ['', null],
        [undefined, null],
    ])('%j → %j', (category, kind) => {
        expect(resetKindForCategory(category)).toBe(kind);
    });
});

describe('custom data with reset rules', () => {
    const daily = {
        id: 'custom:task-2',
        label: 'Login',
        category: 'Daily',
        reset: { kind: 'daily', zone: 'UTC', time: '04:00' },
    };
    const withTask = (overrides) => ({ games: {}, tasks: { 'custom:game-1': [{ ...daily, ...overrides }] } });

    it('accepts every rule without a deadline', () => {
        for (const reset of [
            { kind: 'daily', zone: 'UTC', time: '04:00' },
            { kind: 'weekly', zone: 'UTC', anchor: '2026-11-02T04:00:00.000Z', everyWeeks: 2 },
            { kind: 'monthly', zone: 'UTC', time: '04:00', monthDays: [1, 31] },
            { kind: 'cycle', zone: 'UTC', startsAt: task.createdAt, endsAt: task.endsAt },
        ]) {
            expect(isValidCustomData(withTask({ reset }))).toBe(true);
        }
    });

    it.each([
        ['a rule without a zone', { kind: 'daily', time: '04:00' }],
        ['an unknown kind', { kind: 'yearly', zone: 'UTC' }],
        ['a daily rule without a time', { kind: 'daily', zone: 'UTC' }],
        ['zero weeks', { kind: 'weekly', zone: 'UTC', anchor: task.endsAt, everyWeeks: 0 }],
        ['no month days', { kind: 'monthly', zone: 'UTC', time: '04:00', monthDays: [] }],
        [
            'a cycle that ends before it starts',
            { kind: 'cycle', zone: 'UTC', startsAt: task.endsAt, endsAt: task.createdAt },
        ],
    ])('rejects %s', (_, reset) => {
        expect(isValidCustomData(withTask({ reset }))).toBe(false);
    });

    it('rejects a one-off task without a deadline', () => {
        expect(isValidCustomData(withTask({ reset: undefined }))).toBe(false);
    });

    it('normalizes rules on load', () => {
        const loose = withTask({
            reset: { kind: 'monthly', zone: 'UTC', time: '04:00', monthDays: [15, 1], extra: true },
        });

        expect(normalizeCustomData(loose).tasks['custom:game-1'][0].reset).toEqual({
            kind: 'monthly',
            zone: 'UTC',
            time: '04:00',
            monthDays: [1, 15],
        });
    });
});
