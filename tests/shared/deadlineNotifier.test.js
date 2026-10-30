import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService } from '../../src/shared/accounts/accountService.js';
import { createDeadlineNotifier } from '../../src/shared/deadlineNotifier.js';
import { createMemoryStorage, createStore } from '../helpers/stores.js';
import { makeConfig, makeTask, makeTasks } from '../helpers/builders.js';

const GAME = 'Test';
const config = makeConfig({ [GAME]: {} });
const tasks = makeTasks({
    [GAME]: [makeTask('daily', { kind: 'daily' }), makeTask('weekly', { kind: 'weekly' }, { type: 'Weekly' })],
});

function account(overrides = {}) {
    return { id: 'acc-1', uid: '', server: 'Asia', label: '', tasks: {}, ...overrides };
}

function start({ accounts, enabled = ['acc-1'], subs = [] }) {
    const store = createStore({
        deadlineNotifications: { [GAME]: enabled },
        monthlySubNotifications: { [GAME]: subs },
    });
    const service = createAccountService({ storage: createMemoryStorage({ [GAME]: accounts }), settings: store });
    const notify = vi.fn();
    const notifier = createDeadlineNotifier({
        computeGroups: (now) => service.computeGroups(now),
        enabledAccountIds: (key, gameName) => service.getAccountIds(key, gameName),
        notify,
    });

    service.onChange(notifier.refresh);
    service.setGameData({ config, tasks });

    return { service, notifier, notify };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('deadline notifications', () => {
    it('notifies once for urgent tasks', () => {
        vi.setSystemTime(new Date('2026-10-25T19:00:00Z'));
        const { notifier, notify } = start({ accounts: [account(), account({ id: 'acc-2' })] });

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith({
            title: 'Some tasks are approaching their deadline!',
            body: `There are 2 tasks approaching their deadlines in ${GAME}`,
            deadline: new Date('2026-10-25T20:00:00Z').getTime(),
        });

        notifier.refresh();

        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('skips completed tasks', () => {
        vi.setSystemTime(new Date('2026-10-25T19:00:00Z'));
        const done = { daily: '2026-10-25T18:00:00.000Z', weekly: '2026-10-25T18:00:00.000Z' };
        const { notify } = start({ accounts: [account({ tasks: done })] });

        expect(notify).not.toHaveBeenCalled();
    });

    it('notifications off', () => {
        vi.setSystemTime(new Date('2026-10-25T19:00:00Z'));
        const { notify } = start({ accounts: [account()], enabled: [] });

        expect(notify).not.toHaveBeenCalled();
    });

    it('timer fires when tasks become urgent', async () => {
        vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
        const { notify } = start({ accounts: [account()] });

        expect(notify).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000 + 30 * 60 * 1000);

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0].body).toBe(`There is 1 task approaching its deadline in ${GAME}`);

        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

        expect(notify).toHaveBeenCalledTimes(2);
    });

    it('stop cancels the timer', async () => {
        vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
        const { notifier, notify } = start({ accounts: [account()] });

        notifier.stop();
        await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);

        expect(notify).not.toHaveBeenCalled();
    });

    it('a failing computation is logged, not thrown', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const notifier = createDeadlineNotifier({
            computeGroups: () => {
                throw new Error('boom');
            },
            enabledAccountIds: () => [],
            notify: vi.fn(),
        });

        expect(() => notifier.refresh()).not.toThrow();
        expect(error).toHaveBeenCalledWith('Notification scheduling failed:', expect.any(Error));
    });
});

describe('monthly sub notifications', () => {
    const quiet = new Date('2026-10-20T12:00:00Z');

    it('notifies once when a sub is running out', () => {
        vi.setSystemTime(quiet);
        const { notifier, notify } = start({
            accounts: [account({ monthlySubRemaining: 3 }), account({ id: 'acc-2', monthlySubRemaining: 2 })],
            enabled: [],
            subs: ['acc-1', 'acc-2'],
        });

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith({
            title: 'A monthly subscription is running out!',
            body: `Monthly subscription running out in ${GAME}`,
            deadline: Infinity,
        });

        notifier.refresh();

        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('joins urgent tasks and subs into one notification', () => {
        vi.setSystemTime(new Date('2026-10-25T19:00:00Z'));
        const { notify } = start({ accounts: [account({ monthlySubRemaining: 3 })], subs: ['acc-1'] });

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith({
            title: 'Tasks and subscriptions need your attention!',
            body: `There are 2 tasks approaching their deadlines in ${GAME}\nMonthly subscription running out in ${GAME}`,
            deadline: new Date('2026-10-25T20:00:00Z').getTime(),
        });
    });

    it('notifies again each time the count drops', () => {
        vi.setSystemTime(quiet);
        const { service, notify } = start({
            accounts: [account({ monthlySubRemaining: 3 })],
            enabled: [],
            subs: ['acc-1'],
        });

        service.updateAccount(GAME, 'acc-1', { monthlySubRemaining: 2 });

        expect(notify).toHaveBeenCalledTimes(2);
    });

    it('notifies again after a renewal runs out', () => {
        vi.setSystemTime(quiet);
        const { service, notify } = start({
            accounts: [account({ monthlySubRemaining: 3 })],
            enabled: [],
            subs: ['acc-1'],
        });

        service.updateAccount(GAME, 'acc-1', { monthlySubRemaining: 30 });
        service.updateAccount(GAME, 'acc-1', { monthlySubRemaining: 3 });

        expect(notify).toHaveBeenCalledTimes(2);
    });

    it.each([[5], [0], [undefined]])('skips a sub with %s days left', (monthlySubRemaining) => {
        vi.setSystemTime(quiet);
        const { notify } = start({ accounts: [account({ monthlySubRemaining })], enabled: [], subs: ['acc-1'] });

        expect(notify).not.toHaveBeenCalled();
    });

    it('sub notifications off', () => {
        vi.setSystemTime(quiet);
        const { notify } = start({ accounts: [account({ monthlySubRemaining: 3 })], enabled: ['acc-1'] });

        expect(notify).not.toHaveBeenCalled();
    });
});
