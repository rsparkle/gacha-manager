import { describe, expect, it } from 'vitest';
import { anchoredWindow, applyResetWindow, dailyWindow, getLastDailyReset } from '../../src/shared/resetWindows.js';

const at = (iso) => new Date(iso);
const iso = (window) => ({ last: window.last.toISOString(), next: window.next.toISOString() });

describe('getLastDailyReset', () => {
    const server = { zone: 'Europe/Lisbon', resetMinutes: 4 * 60 };

    it('today once the reset has passed', () => {
        expect(getLastDailyReset(at('2026-11-10T12:00:00Z'), server).toISOString()).toBe('2026-11-10T04:00:00.000Z');
    });

    it('yesterday before the reset', () => {
        expect(getLastDailyReset(at('2026-11-10T03:59:00Z'), server).toISOString()).toBe('2026-11-09T04:00:00.000Z');
    });

    it('accepts fixed offsets', () => {
        expect(getLastDailyReset(at('2026-11-10T12:00:00Z'), { zone: 8, resetMinutes: 4 * 60 }).toISOString()).toBe(
            '2026-11-09T20:00:00.000Z',
        );
    });
});

describe('dailyWindow', () => {
    it('keeps the local hour across DST', () => {
        const server = { zone: 'Europe/Lisbon', resetMinutes: 4 * 60 };
        const now = at('2026-10-25T00:30:00Z');

        expect(iso(dailyWindow({ server, lastDailyReset: getLastDailyReset(now, server) }))).toEqual({
            last: '2026-10-24T03:00:00.000Z',
            next: '2026-10-25T04:00:00.000Z',
        });
    });
});

describe('anchoredWindow', () => {
    const anchor = at('2026-11-02T04:00:00Z');
    const window = (now) => iso(anchoredWindow({ now: at(now), anchor, intervalDays: 14, zone: 'UTC' }));

    it('steps back before the anchor', () => {
        expect(window('2026-10-26T00:00:00Z')).toEqual({
            last: '2026-10-19T04:00:00.000Z',
            next: '2026-11-02T04:00:00.000Z',
        });
    });

    it('starts a new cycle exactly at a boundary', () => {
        expect(window('2026-11-16T04:00:00Z')).toEqual({
            last: '2026-11-16T04:00:00.000Z',
            next: '2026-11-30T04:00:00.000Z',
        });
    });

    it('keeps the local hour across DST', () => {
        const result = anchoredWindow({
            now: at('2026-11-01T00:00:00Z'),
            anchor: at('2026-10-18T03:00:00Z'),
            intervalDays: 7,
            zone: 'Europe/Lisbon',
        });

        expect(iso(result)).toEqual({ last: '2026-10-25T04:00:00.000Z', next: '2026-11-01T04:00:00.000Z' });
    });
});

describe('applyResetWindow', () => {
    const last = at('2026-11-10T04:00:00Z');
    const next = at('2026-11-11T04:00:00Z');
    const now = at('2026-11-10T16:00:00Z');
    const apply = (lastCompleted, window = { last, next }) => {
        const task = { last_completed: lastCompleted };

        applyResetWindow(task, window, now);

        return task;
    };

    it('fills timing for an open window', () => {
        expect(apply(null)).toEqual({
            last_completed: null,
            isDisabled: false,
            duration: 24 * 3_600_000,
            nextReset: 12 * 3_600_000,
            isCompleted: false,
        });
    });

    it('counts completions only inside the window', () => {
        expect(apply('2026-11-10T05:00:00.000Z').isCompleted).toBe(true);
        expect(apply('2026-11-10T03:00:00.000Z').isCompleted).toBe(false);
        expect(apply('2026-11-10T17:00:00.000Z').isCompleted).toBe(false);
    });

    it('disabled windows have no timing and are never completed', () => {
        expect(apply('2026-11-10T05:00:00.000Z', { last, next, isDisabled: true })).toMatchObject({
            isDisabled: true,
            duration: 0,
            nextReset: 0,
            isCompleted: false,
        });
    });

    it('open-ended windows have no countdown', () => {
        expect(apply(null, { last, next: null })).toMatchObject({ duration: null, nextReset: null });
    });
});
