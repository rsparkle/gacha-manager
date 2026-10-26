import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResetProcessor } from '../../src/shared/resetProcessor.js';
import { DAY, HOUR } from '../../src/shared/serverTime.js';
import { DST_SERVERS, makeAccount, makeConfig, makeTask, makeTasks, taskById } from '../helpers/builders.js';

function setup(gameOverrides, tasks) {
    const config = makeConfig({ Test: gameOverrides });
    const gameTasks = makeTasks({ Test: tasks });

    return { processor: createResetProcessor(config, gameTasks), gameTasks };
}

function evaluate({ processor, gameTasks }, taskId, now, { server = 'Asia', completed } = {}) {
    const nowMs = Date.parse(now);
    const account = makeAccount(gameTasks.Test, { server, completed });

    processor.computeSingleAccountResetData(account, 'Test', new Date(nowMs));

    const task = taskById(account, taskId);
    const open = task.nextReset === null;

    return {
        isDisabled: task.isDisabled,
        isCompleted: task.isCompleted,
        duration: task.duration,
        last: task.isDisabled || open ? null : new Date(nowMs + task.nextReset - task.duration).toISOString(),
        next: task.isDisabled || open ? null : new Date(nowMs + task.nextReset).toISOString(),
    };
}

function single(reset, gameOverrides = {}) {
    return setup(gameOverrides, [makeTask('task', reset)]);
}

let errorSpy;

beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
});

describe('daily', () => {
    const daily = () => single({ kind: 'daily' });

    it.each([
        ['Asia', '2026-10-25T12:00:00Z', '2026-10-24T20:00:00.000Z', '2026-10-25T20:00:00.000Z'],
        ['Europe', '2026-10-25T12:00:00Z', '2026-10-25T03:00:00.000Z', '2026-10-26T03:00:00.000Z'],
        ['America', '2026-10-25T12:00:00Z', '2026-10-25T09:00:00.000Z', '2026-10-26T09:00:00.000Z'],
        ['America', '2026-10-25T08:59:59Z', '2026-10-24T09:00:00.000Z', '2026-10-25T09:00:00.000Z'],
    ])('%s at %s', (server, now, last, next) => {
        expect(evaluate(daily(), 'task', now, { server })).toMatchObject({ last, next, duration: DAY });
    });

    it('new day starts exactly at reset', () => {
        expect(evaluate(daily(), 'task', '2026-10-25T20:00:00Z')).toMatchObject({
            last: '2026-10-25T20:00:00.000Z',
            next: '2026-10-26T20:00:00.000Z',
        });
        expect(evaluate(daily(), 'task', '2026-10-25T19:59:59.999Z')).toMatchObject({
            last: '2026-10-24T20:00:00.000Z',
        });
    });

    it('per-server daily_reset', () => {
        const ctx = single({ kind: 'daily' }, { servers: { America: { daily_reset: '05:00' } } });

        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z', { server: 'America' }).next).toBe(
            '2026-10-26T10:00:00.000Z',
        );
    });
});

describe('daylight saving time servers', () => {
    const dst = (reset) => single(reset, { daily_reset: '05:00', servers: DST_SERVERS });

    it('daily: US fall-back', () => {
        const ctx = dst({ kind: 'daily' });

        expect(evaluate(ctx, 'task', '2026-10-31T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-31T09:00:00.000Z',
            next: '2026-11-01T10:00:00.000Z',
            duration: 25 * HOUR,
        });
        expect(evaluate(ctx, 'task', '2026-11-01T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-11-01T10:00:00.000Z',
            next: '2026-11-02T10:00:00.000Z',
            duration: DAY,
        });
    });

    it('daily: US spring-forward', () => {
        expect(evaluate(dst({ kind: 'daily' }), 'task', '2027-03-13T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2027-03-13T10:00:00.000Z',
            next: '2027-03-14T09:00:00.000Z',
            duration: 23 * HOUR,
        });
    });

    it('daily: EU fall-back', () => {
        expect(evaluate(dst({ kind: 'daily' }), 'task', '2026-10-24T12:00:00Z', { server: 'Europe' })).toMatchObject({
            last: '2026-10-24T03:00:00.000Z',
            next: '2026-10-25T04:00:00.000Z',
            duration: 25 * HOUR,
        });
    });

    it('weekly: week with a DST change', () => {
        expect(evaluate(dst({ kind: 'weekly' }), 'task', '2026-10-30T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-26T09:00:00.000Z',
            next: '2026-11-02T10:00:00.000Z',
            duration: 7 * DAY + HOUR,
        });
    });

    it('monthly: uses the offset of the reset day', () => {
        expect(
            evaluate(dst({ kind: 'monthly', monthDays: [1] }), 'task', '2026-10-15T12:00:00Z', { server: 'America' }),
        ).toMatchObject({
            last: '2026-10-01T09:00:00.000Z',
            next: '2026-11-01T10:00:00.000Z',
        });
    });

    it('interval: keeps local time', () => {
        const ctx = dst({ kind: 'interval', anchor: '2026-10-26', intervalDays: 14 });

        expect(evaluate(ctx, 'task', '2026-11-05T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-26T09:00:00.000Z',
            next: '2026-11-09T10:00:00.000Z',
        });
    });

    it('interval: rolls over right after DST', () => {
        const fallBack = dst({ kind: 'interval', anchor: '2026-10-26', intervalDays: 14 });
        const springForward = dst({ kind: 'interval', anchor: '2027-03-01', intervalDays: 14 });

        expect(evaluate(fallBack, 'task', '2026-11-09T09:30:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-26T09:00:00.000Z',
            next: '2026-11-09T10:00:00.000Z',
        });
        expect(evaluate(springForward, 'task', '2027-03-15T09:30:00Z', { server: 'America' })).toMatchObject({
            last: '2027-03-15T09:00:00.000Z',
            next: '2027-03-29T09:00:00.000Z',
        });
    });

    it('fixed-offset servers unaffected', () => {
        expect(evaluate(dst({ kind: 'daily' }), 'task', '2026-10-31T12:00:00Z', { server: 'Asia' })).toMatchObject({
            last: '2026-10-30T21:00:00.000Z',
            next: '2026-10-31T21:00:00.000Z',
            duration: DAY,
        });
    });
});

describe('weekly', () => {
    it('uses weekly_reset_weekday', () => {
        expect(evaluate(single({ kind: 'weekly' }), 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            last: '2026-10-18T20:00:00.000Z',
            next: '2026-10-25T20:00:00.000Z',
            duration: 7 * DAY,
        });
    });

    it('weekday in server time', () => {
        expect(evaluate(single({ kind: 'weekly' }), 'task', '2026-10-25T20:30:00Z')).toMatchObject({
            last: '2026-10-25T20:00:00.000Z',
        });
        expect(
            evaluate(single({ kind: 'weekly' }), 'task', '2026-10-26T08:00:00Z', { server: 'America' }),
        ).toMatchObject({
            last: '2026-10-19T09:00:00.000Z',
            next: '2026-10-26T09:00:00.000Z',
        });
    });

    it('task weekday override', () => {
        expect(evaluate(single({ kind: 'weekly', weekday: 3 }), 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            last: '2026-10-20T20:00:00.000Z',
            next: '2026-10-27T20:00:00.000Z',
        });
    });

    it('Sunday is 0', () => {
        expect(evaluate(single({ kind: 'weekly', weekday: 0 }), 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            last: '2026-10-24T20:00:00.000Z',
        });
    });
});

describe('monthly', () => {
    it.each([
        [[16], '2026-10-25T12:00:00Z', '2026-10-15T20:00:00.000Z', '2026-11-15T20:00:00.000Z'],
        [[1, 16], '2026-10-25T12:00:00Z', '2026-10-15T20:00:00.000Z', '2026-10-31T20:00:00.000Z'],
        [[16, 1], '2026-10-10T12:00:00Z', '2026-09-30T20:00:00.000Z', '2026-10-15T20:00:00.000Z'],
        [[1], '2026-12-31T21:00:00Z', '2026-12-31T20:00:00.000Z', '2027-01-31T20:00:00.000Z'],
        [[1], '2026-12-31T19:00:00Z', '2026-11-30T20:00:00.000Z', '2026-12-31T20:00:00.000Z'],
        [[31], '2027-02-15T12:00:00Z', '2027-01-30T20:00:00.000Z', '2027-02-27T20:00:00.000Z'],
        [[30], '2028-02-15T12:00:00Z', '2028-01-29T20:00:00.000Z', '2028-02-28T20:00:00.000Z'],
    ])('days %j at %s', (monthDays, now, last, next) => {
        expect(evaluate(single({ kind: 'monthly', monthDays }), 'task', now)).toMatchObject({ last, next });
    });
});

describe('interval', () => {
    it('repeats from the anchor', () => {
        expect(
            evaluate(
                single({ kind: 'interval', anchor: '2026-02-09', intervalDays: 14 }),
                'task',
                '2026-10-25T12:00:00Z',
            ),
        ).toMatchObject({
            last: '2026-10-18T20:00:00.000Z',
            next: '2026-11-01T20:00:00.000Z',
            duration: 14 * DAY,
        });
    });

    it('before the anchor', () => {
        expect(
            evaluate(
                single({ kind: 'interval', anchor: '2026-12-01', intervalDays: 14 }),
                'task',
                '2026-10-25T12:00:00Z',
            ),
        ).toMatchObject({
            last: '2026-10-19T20:00:00.000Z',
            next: '2026-11-02T20:00:00.000Z',
        });
    });

    it('rolls over at the boundary', () => {
        const ctx = single({ kind: 'interval', anchor: '2026-10-19', intervalDays: 7 });

        expect(evaluate(ctx, 'task', '2026-10-25T20:00:00Z')).toMatchObject({ last: '2026-10-25T20:00:00.000Z' });
        expect(evaluate(ctx, 'task', '2026-10-25T19:59:59Z')).toMatchObject({ last: '2026-10-18T20:00:00.000Z' });
    });

    it('literal global start time', () => {
        const ctx = single({ kind: 'interval', anchor: '2026-10-22', intervalDays: 14, startTime: '05:00@global' });

        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-21T21:00:00.000Z',
            next: '2026-11-04T21:00:00.000Z',
        });
    });

    it('patchCollision: ends at maintenance', () => {
        const ctx = single({ kind: 'interval', anchor: '2026-10-07', intervalDays: 42, patchCollision: true });

        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            last: '2026-10-06T20:00:00.000Z',
            next: '2026-11-17T22:00:00.000Z',
        });
    });

    it('patchCollision: ignored if over a day away', () => {
        const ctx = single({ kind: 'interval', anchor: '2026-10-05', intervalDays: 42, patchCollision: true });

        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            next: '2026-11-15T20:00:00.000Z',
        });
    });

    it('patchCollision: disabled after early maintenance', () => {
        const ctx = single(
            { kind: 'interval', anchor: '2026-10-07', intervalDays: 42, patchCollision: true },
            { maintenance: { first_phase: { start: '02:00', duration: '05:00' } } },
        );

        expect(evaluate(ctx, 'task', '2026-11-17T19:00:00Z')).toMatchObject({ isDisabled: true });
        expect(evaluate(ctx, 'task', '2026-11-17T21:00:00Z')).toMatchObject({
            isDisabled: false,
            last: '2026-11-17T20:00:00.000Z',
        });
    });
});

describe('window', () => {
    it('defaults to event_start / event_end', () => {
        const ctx = single({ kind: 'window', startDate: '2026-10-21', endDate: '2026-11-02' });

        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z')).toMatchObject({
            isDisabled: false,
            last: '2026-10-21T02:00:00.000Z',
            next: '2026-11-01T19:59:00.000Z',
        });
        expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z', { server: 'America' })).toMatchObject({
            last: '2026-10-21T15:00:00.000Z',
            next: '2026-11-02T08:59:00.000Z',
        });
    });

    it('global event times match on every server', () => {
        const ctx = single(
            { kind: 'window', startDate: '2026-10-21', endDate: '2026-11-02' },
            { event_start: { scope: 'global' }, event_end: { scope: 'global' } },
        );

        for (const server of ['America', 'Europe', 'Asia']) {
            expect(evaluate(ctx, 'task', '2026-10-25T12:00:00Z', { server })).toMatchObject({
                last: '2026-10-21T02:00:00.000Z',
                next: '2026-11-01T19:59:00.000Z',
            });
        }
    });

    it('disabled outside the window', () => {
        const ctx = single({ kind: 'window', startDate: '2026-10-21', endDate: '2026-11-02' });

        expect(evaluate(ctx, 'task', '2026-10-21T01:59:59Z')).toMatchObject({ isDisabled: true, duration: 0 });
        expect(evaluate(ctx, 'task', '2026-10-21T02:00:00Z')).toMatchObject({ isDisabled: false });
        expect(evaluate(ctx, 'task', '2026-11-01T19:58:59Z')).toMatchObject({ isDisabled: false });
        expect(evaluate(ctx, 'task', '2026-11-01T19:59:00Z')).toMatchObject({ isDisabled: true, duration: 0 });
    });

    it.each([
        [
            'patchStart+7 / patchEnd-1 at daily reset',
            { startDate: 'patchStart+7', endDate: 'patchEnd-1', startTime: 'dailyReset', endTime: 'dailyReset' },
            '2026-10-13T20:00:00.000Z',
            '2026-11-16T20:00:00.000Z',
        ],
        [
            'patchStart / patchEnd at maintenance',
            { startDate: 'patchStart', endDate: 'patchEnd', startTime: 'maintenanceEnd', endTime: 'maintenanceStart' },
            '2026-10-07T03:00:00.000Z',
            '2026-11-17T22:00:00.000Z',
        ],
        [
            'secondPhase start time on the second phase day',
            { startDate: 'secondPhase', endDate: 'patchEnd', startTime: 'secondPhase' },
            '2026-10-27T10:00:00.000Z',
            '2026-11-17T19:59:00.000Z',
        ],
        [
            'literal times',
            { startDate: '2026-10-12', endDate: '2026-10-30', startTime: '10:00@global', endTime: '09:59@server' },
            '2026-10-12T02:00:00.000Z',
            '2026-10-30T01:59:00.000Z',
        ],
        [
            'patchStart-2 before the patch',
            { startDate: 'patchStart-2', endDate: 'patchEnd+3', startTime: 'dailyReset', endTime: 'dailyReset' },
            '2026-10-04T20:00:00.000Z',
            '2026-11-20T20:00:00.000Z',
        ],
    ])('%s', (_, reset, last, next) => {
        expect(evaluate(single({ kind: 'window', ...reset }), 'task', '2026-10-28T12:00:00Z')).toMatchObject({
            isDisabled: false,
            last,
            next,
        });
    });

    it('no end date', () => {
        const ctx = single({ kind: 'window', startDate: '2026-03-24', endDate: null, startTime: 'maintenanceEnd' });

        expect(evaluate(ctx, 'task', '2030-01-01T00:00:00Z')).toMatchObject({
            isDisabled: false,
            duration: null,
            next: null,
        });
        expect(evaluate(ctx, 'task', '2026-03-24T02:59:00Z')).toMatchObject({ isDisabled: true });
    });

    it('maintenance second phase', () => {
        const ctx = single(
            { kind: 'window', startDate: 'secondPhase', endDate: 'patchEnd', startTime: 'secondPhase' },
            { second_phase: undefined, maintenance: { second_phase: { start: '10:00', duration: '01:00' } } },
        );

        expect(evaluate(ctx, 'task', '2026-10-28T12:00:00Z', { server: 'America' }).last).toBe(
            '2026-10-27T03:00:00.000Z',
        );
    });
});

describe('completion', () => {
    const daily = () => single({ kind: 'daily' });
    const now = '2026-10-25T12:00:00Z';

    it.each([
        ['inside the current window', '2026-10-25T10:00:00.000Z', true],
        ['exactly at the window start', '2026-10-24T20:00:00.000Z', true],
        ['before the window', '2026-10-24T19:59:59.999Z', false],
        ['in the future', '2026-10-25T13:00:00.000Z', false],
        ['an invalid date', 'not a date', false],
    ])('completed %s', (_, completedAt, expected) => {
        expect(evaluate(daily(), 'task', now, { completed: { task: completedAt } }).isCompleted).toBe(expected);
    });

    it('never completed while disabled', () => {
        const ctx = single({ kind: 'window', startDate: '2026-10-01', endDate: '2026-10-10' });

        expect(
            evaluate(ctx, 'task', '2026-10-25T12:00:00Z', { completed: { task: '2026-10-05T12:00:00Z' } }),
        ).toMatchObject({ isDisabled: true, isCompleted: false });
    });

    it('open window stays completed', () => {
        const ctx = single({ kind: 'window', startDate: '2026-03-24', endDate: null });

        expect(
            evaluate(ctx, 'task', '2027-01-01T00:00:00Z', { completed: { task: '2026-04-01T00:00:00Z' } }).isCompleted,
        ).toBe(true);
    });
});

describe('runtime errors', () => {
    it('unknown server disables all tasks', () => {
        const { processor, gameTasks } = setup({}, [
            makeTask('a', { kind: 'daily' }),
            makeTask('b', { kind: 'weekly' }),
        ]);
        const account = makeAccount(gameTasks.Test, { server: 'Mars' });

        processor.computeSingleAccountResetData(account, 'Test', new Date('2026-10-25T12:00:00Z'));

        expect(Object.values(account.tasks).flat()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'a', isDisabled: true, duration: 0, nextReset: 0, isCompleted: false }),
                expect.objectContaining({ id: 'b', isDisabled: true }),
            ]),
        );
        expect(errorSpy).toHaveBeenCalledWith('Unknown server for Test / Mars');
        errorSpy.mockClear();
    });

    it('removed task is disabled', () => {
        const { processor, gameTasks } = setup({}, [makeTask('a', { kind: 'daily' })]);
        const account = makeAccount(gameTasks.Test);
        account.tasks.Daily.push({ id: 'removed', type: 'Daily', last_completed: null });

        processor.computeSingleAccountResetData(account, 'Test', new Date('2026-10-25T12:00:00Z'));

        expect(taskById(account, 'a').isDisabled).toBe(false);
        expect(taskById(account, 'removed').isDisabled).toBe(true);
        expect(errorSpy).toHaveBeenCalledWith('Unknown task: Test / removed');
        errorSpy.mockClear();
    });

    it.each([[new Date('nope')], ['2026-10-25'], [Date.now()]])('rejects an invalid now (%s)', (now) => {
        const { processor, gameTasks } = single({ kind: 'daily' });

        expect(() => processor.computeSingleAccountResetData(makeAccount(gameTasks.Test), 'Test', now)).toThrow(
            'Invalid current date',
        );
    });

    it('computeTaskResetData', () => {
        const config = makeConfig({ A: {}, B: { servers: DST_SERVERS } });
        const tasks = makeTasks({
            A: [makeTask('a-daily', { kind: 'daily' })],
            B: [makeTask('b-daily', { kind: 'daily' })],
        });
        const { computeTaskResetData } = createResetProcessor(config, tasks);
        const groups = [
            { name: 'A', accounts: [makeAccount(tasks.A), makeAccount(tasks.A, { server: 'Europe' })] },
            { name: 'B', accounts: [makeAccount(tasks.B, { server: 'America' })] },
        ];

        const result = computeTaskResetData(groups, new Date('2026-10-25T12:00:00Z'));

        expect(result).toBe(groups);
        for (const account of groups.flatMap((group) => group.accounts)) {
            for (const task of Object.values(account.tasks).flat()) {
                expect(task.isDisabled).toBe(false);
                expect(task.nextReset).toBeGreaterThan(0);
            }
        }
    });

    it('getLastDailyReset', () => {
        const { processor } = single({ kind: 'daily' }, { servers: DST_SERVERS, daily_reset: '05:00' });
        const now = new Date('2026-11-01T12:00:00Z');

        expect(processor.getLastDailyReset('Test', 'America', now).toISOString()).toBe('2026-11-01T10:00:00.000Z');
        expect(processor.getLastDailyReset('Test', 'Asia', now).toISOString()).toBe('2026-10-31T21:00:00.000Z');
        expect(() => processor.getLastDailyReset('Test', 'Mars', now)).toThrow('Unknown server for Test / Mars');
        expect(() => processor.getLastDailyReset('Nope', 'Asia', now)).toThrow('Unknown server for Nope / Asia');
    });
});

describe('validation when game data loads', () => {
    const build =
        (reset, gameOverrides = {}) =>
        () =>
            single(reset, gameOverrides);

    it('tasks without config', () => {
        expect(() => createResetProcessor(makeConfig({ A: {} }), makeTasks({ A: [], B: [] }))).toThrow(
            'Missing game configuration: B',
        );
    });

    it('config without tasks', () => {
        expect(() => createResetProcessor(makeConfig({ A: {}, B: {} }), makeTasks({ A: [] }))).toThrow(
            'Missing task configuration: B',
        );
    });

    it('duplicate task ids', () => {
        expect(() => setup({}, [makeTask('same', { kind: 'daily' }), makeTask('same', { kind: 'weekly' })])).toThrow(
            'Duplicate task ID: same',
        );
    });

    it('same id in different games is fine', () => {
        const config = makeConfig({ A: {}, B: {} });
        const tasks = makeTasks({
            A: [makeTask('daily', { kind: 'daily' })],
            B: [makeTask('daily', { kind: 'daily' })],
        });

        expect(() => createResetProcessor(config, tasks)).not.toThrow();
    });

    it('rejects invalid game config', () => {
        expect(build({ kind: 'daily' }, { daily_reset: '25:00' })).toThrow('Invalid Test America daily_reset');
    });

    it.each([
        ['a missing reset', undefined],
        ['an unknown kind', { kind: 'yearly' }],
        ['weekday out of range', { kind: 'weekly', weekday: 7 }],
        ['weekday as text', { kind: 'weekly', weekday: '1' }],
        ['monthDays missing', { kind: 'monthly' }],
        ['monthDays empty', { kind: 'monthly', monthDays: [] }],
        ['monthDays with 0', { kind: 'monthly', monthDays: [0] }],
        ['monthDays with 32', { kind: 'monthly', monthDays: [32] }],
        ['monthDays with a fraction', { kind: 'monthly', monthDays: [1.5] }],
        ['interval anchor not YYYY-MM-DD', { kind: 'interval', anchor: '2026-2-9', intervalDays: 14 }],
        ['interval anchor as patch date', { kind: 'interval', anchor: 'patchStart', intervalDays: 14 }],
        ['interval of 0 days', { kind: 'interval', anchor: '2026-02-09', intervalDays: 0 }],
        ['interval of fractional days', { kind: 'interval', anchor: '2026-02-09', intervalDays: 1.5 }],
        [
            'non-boolean patchCollision',
            { kind: 'interval', anchor: '2026-02-09', intervalDays: 14, patchCollision: 'yes' },
        ],
    ])('rejects %s', (_, reset) => {
        expect(build(reset)).toThrow('Invalid reset configuration for task: task');
    });

    it('fields from another kind', () => {
        expect(build({ kind: 'daily', weekday: 1 })).toThrow('Task task: "weekday" is not used by kind "daily"');
        expect(build({ kind: 'window', startDate: '2026-10-01', anchor: '2026-10-01' })).toThrow(
            'Task task: "anchor" is not used by kind "window"',
        );
    });

    it('weekly needs a weekday', () => {
        expect(build({ kind: 'weekly' }, { weekly_reset_weekday: undefined })).toThrow(
            'Task task has no weekday and the game has no weekly_reset_weekday setting',
        );
        expect(build({ kind: 'weekly', weekday: 2 }, { weekly_reset_weekday: undefined })).not.toThrow();
    });

    it.each([
        ['an unknown start date token', { startDate: 'patchMiddle', endDate: 'patchEnd' }],
        ['a slash date', { startDate: '2026/10/01', endDate: 'patchEnd' }],
        ['a missing start date', { endDate: 'patchEnd' }],
        ['a bad end date', { startDate: 'patchStart', endDate: 'patchEnd+x' }],
    ])('rejects a window with %s', (_, reset) => {
        expect(build({ kind: 'window', ...reset })).toThrow('Invalid window dates for task: task');
    });

    it.each([
        ['unknown named time', { startTime: 'noon' }, 'Invalid time "noon" for task: task'],
        ['literal time past midnight', { endTime: '24:00@server' }, 'Invalid time "24:00@server" for task: task'],
        ['literal time without scope', { startTime: '10:00' }, 'Invalid time "10:00" for task: task'],
    ])('rejects a window with an %s', (_, times, message) => {
        expect(build({ kind: 'window', startDate: 'patchStart', endDate: 'patchEnd', ...times })).toThrow(message);
    });

    it('event times the game does not have', () => {
        expect(
            build({ kind: 'window', startDate: 'patchStart', endDate: 'patchEnd' }, { event_start: undefined }),
        ).toThrow('Task task uses eventStart, but the game has no event_start setting');
        expect(
            build(
                { kind: 'window', startDate: 'patchStart', endDate: 'patchEnd', endTime: 'dailyReset' },
                { event_end: undefined },
            ),
        ).not.toThrow();
        expect(
            build(
                { kind: 'interval', anchor: '2026-02-09', intervalDays: 14, startTime: 'eventEnd' },
                { event_end: undefined },
            ),
        ).toThrow('Task task uses eventEnd, but the game has no event_end setting');
    });

    it('window ends before it starts', () => {
        expect(build({ kind: 'window', startDate: '2026-10-10', endDate: '2026-10-01' })).toThrow(
            'Invalid reset end for task: task',
        );
        expect(build({ kind: 'window', startDate: 'patchEnd', endDate: 'patchStart' })).toThrow(
            'Invalid reset end for task: task',
        );
    });
});
