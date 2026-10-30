import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService } from '../../../src/shared/accounts/accountService.js';
import { serializeAccounts } from '../../../src/shared/accounts/accountsFile.js';
import { createMemoryStorage, createStore } from '../../helpers/stores.js';
import { makeConfig, makeTask, makeTasks } from '../../helpers/builders.js';

const GAME = 'Test';
const OTHER = 'Other';
const config = makeConfig({ [GAME]: {}, [OTHER]: { abbr: 'OT' } });
const tasks = makeTasks({
    [GAME]: [
        makeTask('daily', { kind: 'daily' }),
        makeTask('weekly', { kind: 'weekly' }, { type: 'Weekly' }),
        makeTask('event', { kind: 'window', startDate: '2026-12-01', endDate: '2026-12-10' }, { type: 'Event' }),
    ],
    [OTHER]: [makeTask('other-daily', { kind: 'daily' })],
});

function load({ accounts = {}, store = createStore() } = {}) {
    const storage = createMemoryStorage(accounts);
    const service = createAccountService({ storage, settings: store });

    service.setGameData({ config, tasks });

    return { service, storage, store };
}

function account(overrides = {}) {
    return { id: 'acc-1', uid: '', server: 'Asia', label: '', tasks: {}, ...overrides };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('loading', () => {
    it('starts with what storage loads', () => {
        const { service } = load({ accounts: { [GAME]: [account()] } });

        expect(service.getAccounts()).toEqual({ [GAME]: [account()] });
    });

    it('reload picks up changes made elsewhere', () => {
        const { service, storage } = load();
        const listener = vi.fn();

        service.onChange(listener);
        storage.saved = { [GAME]: [account()] };
        service.reload();

        expect(service.getAccounts()).toEqual({ [GAME]: [account()] });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('no groups before game data', () => {
        const service = createAccountService({ storage: createMemoryStorage(), settings: createStore() });

        expect(service.computeGroups()).toEqual([]);
        expect(service.syncCalendarMonthlySubs()).toBe(false);
    });
});

describe('managing accounts', () => {
    it('insert', () => {
        const { service, storage } = load();

        const created = service.insertAccounts([
            { name: GAME, server: 'Europe', label: 'Main' },
            { name: GAME, server: 'Asia' },
        ]);

        expect(created).toHaveLength(2);
        expect(created[0]).toMatchObject({ uid: '', server: 'Europe', label: 'Main', tasks: {} });
        expect(created[1].label).toBe('');
        expect(created[0].id).not.toBe(created[1].id);
        expect(storage.saved[GAME]).toEqual(created);
    });

    it.each([
        ['an empty list', [], 'No games selected'],
        ['not a list', null, 'No games selected'],
        ['an unknown game', [{ name: 'Nope', server: 'Asia' }], 'Unknown game: Nope'],
        ['an unknown server', [{ name: GAME, server: 'Mars' }], 'Unknown server: Mars'],
    ])('rejects %s without saving anything', (_, list, message) => {
        const { service, storage } = load();

        expect(() => service.insertAccounts(list)).toThrow(message);
        expect(storage.saves).toBe(0);
    });

    it('getAccounts returns a copy', () => {
        const { service } = load({ accounts: { [GAME]: [account()] } });

        service.getAccounts()[GAME][0].label = 'changed';

        expect(service.getAccounts()[GAME][0].label).toBe('');
    });

    it('update only editable fields', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });

        const updated = service.updateAccount(GAME, 'acc-1', {
            uid: 812345678,
            label: 'Alt',
            server: 'Europe',
            id: 'hijack',
            tasks: { daily: 'x' },
        });

        expect(updated).toMatchObject({ id: 'acc-1', uid: '812345678', label: 'Alt', server: 'Europe' });
        expect(storage.saved[GAME][0]).toEqual({ ...account(), uid: '812345678', label: 'Alt', server: 'Europe' });
    });

    it('monthly sub edit date', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });

        service.updateAccount(GAME, 'acc-1', { monthlySubRemaining: '30' });

        expect(storage.saved[GAME][0]).toMatchObject({
            monthlySubRemaining: 30,
            lastMonthlySubEditedDay: '2026-10-25T12:00:00.000Z',
        });
    });

    it.each([
        [{ uid: '12ab' }, 'UID can only contain digits'],
        [{ server: 'Mars' }, 'Unknown server: Mars'],
        [{ monthlySubRemaining: -1 }, 'Invalid monthly subscription days'],
        [{ monthlySubRemaining: 1.5 }, 'Invalid monthly subscription days'],
        [{ monthlySubRemaining: 'abc' }, 'Invalid monthly subscription days'],
    ])('rejects %j', (changes, message) => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });

        expect(() => service.updateAccount(GAME, 'acc-1', changes)).toThrow(message);
        expect(storage.saved[GAME][0]).toEqual(account());
    });

    it('fails for unknown accounts', () => {
        const { service } = load();

        expect(() => service.updateAccount(GAME, 'nope', {})).toThrow('Account not found');
        expect(() => service.deleteAccount(GAME, 'nope')).toThrow('Account not found');
        expect(() => service.setTaskCompleted(GAME, 'daily', 'nope', true)).toThrow('Account not found');
    });

    it('delete removes per-account settings', () => {
        const store = createStore({
            automaticDailies: { [GAME]: ['acc-1', 'acc-2'] },
            deadlineNotifications: { [GAME]: ['acc-1'], [OTHER]: ['acc-9'] },
            monthlySubNotifications: { [GAME]: ['acc-1', 'acc-2'] },
        });
        const { service, storage } = load({ accounts: { [GAME]: [account(), account({ id: 'acc-2' })] }, store });

        service.deleteAccount(GAME, 'acc-1');

        expect(storage.saved[GAME].map((a) => a.id)).toEqual(['acc-2']);
        expect(store.data.automaticDailies).toEqual({ [GAME]: ['acc-2'] });
        expect(store.data.deadlineNotifications).toEqual({ [GAME]: [], [OTHER]: ['acc-9'] });
        expect(store.data.monthlySubNotifications).toEqual({ [GAME]: ['acc-2'] });
    });
});

describe('tasks', () => {
    const accounts = { [GAME]: [account()] };

    it('grouped for the UI', () => {
        const { service } = load({
            accounts: { [GAME]: [account({ tasks: { daily: '2026-10-25T10:00:00.000Z' } })] },
        });

        const groups = service.getGroupedAccounts();

        expect(groups.map((group) => [group.name, group.game_version, group.accounts.length])).toEqual([
            [GAME, '1.1', 1],
            [OTHER, '1.1', 0],
        ]);
        expect(Object.keys(groups[0].accounts[0].tasks)).toEqual(['Daily', 'Weekly', 'Event']);
        expect(groups[0].accounts[0].tasks.Daily[0]).toMatchObject({
            id: 'daily',
            last_completed: '2026-10-25T10:00:00.000Z',
        });
        expect(groups[0].accounts[0].tasks.Weekly[0].last_completed).toBeNull();
    });

    it('complete and uncomplete', () => {
        const { service, storage } = load({ accounts });

        const completed = service.setTaskCompleted(GAME, 'daily', 'acc-1', true);

        expect(completed.tasks.Daily[0].last_completed).toBe('2026-10-25T12:00:00.000Z');
        expect(storage.saved[GAME][0].tasks).toEqual({ daily: '2026-10-25T12:00:00.000Z' });

        service.setTaskCompleted(GAME, 'daily', 'acc-1', false);

        expect(storage.saved[GAME][0].tasks).toEqual({});
    });

    it('already completed keeps the time', () => {
        const { service, storage } = load({ accounts });

        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);
        vi.setSystemTime(new Date('2026-10-25T13:00:00Z'));
        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);

        expect(storage.saved[GAME][0].tasks.daily).toBe('2026-10-25T12:00:00.000Z');
    });

    it('completion from previous reset', () => {
        const { service, storage } = load({ accounts });

        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);
        vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));
        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);

        expect(storage.saved[GAME][0].tasks.daily).toBe('2026-10-25T20:00:00.000Z');
    });

    it('inactive and unknown tasks', () => {
        const { service } = load({ accounts });

        expect(() => service.setTaskCompleted(GAME, 'event', 'acc-1', true)).toThrow(
            'This task is not active right now',
        );
        expect(() => service.setTaskCompleted(GAME, 'nope', 'acc-1', true)).toThrow('Unknown task: nope');
    });

    it('automatic dailies', () => {
        const { service, storage } = load({
            accounts: { [GAME]: [account(), account({ id: 'acc-2' })] },
            store: createStore({ automaticDailies: { [GAME]: ['acc-2'] } }),
        });

        expect(service.completeAutomaticDailies(GAME)).toBe(true);
        expect(service.completeAutomaticDailies(GAME)).toBe(false);
        expect(service.completeAutomaticDailies('Nope')).toBe(false);

        const [first, second] = storage.saved[GAME];

        expect(first.tasks).toEqual({});
        expect(second.tasks).toEqual({ daily: '2026-10-25T12:00:00.000Z' });
    });
});

describe('monthly subscription', () => {
    const subscribed = (overrides = {}) =>
        account({ monthlySubRemaining: 10, lastMonthlySubEditedDay: '2026-10-22T12:00:00.000Z', ...overrides });

    it('calendar mode: one per reset', () => {
        const { service, storage } = load({ accounts: { [GAME]: [subscribed()] } });

        expect(service.syncCalendarMonthlySubs()).toBe(true);
        expect(storage.saved[GAME][0]).toMatchObject({
            monthlySubRemaining: 7,
            lastMonthlySubEditedDay: '2026-10-25T12:00:00.000Z',
        });
        expect(service.syncCalendarMonthlySubs()).toBe(false);

        vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));

        expect(service.syncCalendarMonthlySubs()).toBe(true);
        expect(storage.saved[GAME][0].monthlySubRemaining).toBe(6);
    });

    it('calendar mode: stops at 0', () => {
        const { service, storage } = load({ accounts: { [GAME]: [subscribed({ monthlySubRemaining: 1 })] } });

        service.syncCalendarMonthlySubs();

        expect(storage.saved[GAME][0].monthlySubRemaining).toBe(0);
    });

    it('calendar mode: no edit date yet', () => {
        const { service, storage } = load({
            accounts: { [GAME]: [account({ monthlySubRemaining: 5 }), account({ id: 'acc-2' })] },
        });

        expect(service.syncCalendarMonthlySubs()).toBe(true);

        const [withSub, withoutSub] = storage.saved[GAME];

        expect(withSub).toMatchObject({ monthlySubRemaining: 5, lastMonthlySubEditedDay: '2026-10-25T12:00:00.000Z' });
        expect(withoutSub).toEqual(account({ id: 'acc-2' }));
    });

    it('calendar mode off in daily task mode', () => {
        const { service } = load({
            accounts: { [GAME]: [subscribed()] },
            store: createStore({ monthlySubCheck: 'dailyTask' }),
        });

        expect(service.syncCalendarMonthlySubs()).toBe(false);
    });

    it('daily task mode: one per reset', () => {
        const { service, storage } = load({
            accounts: { [GAME]: [subscribed()] },
            store: createStore({ monthlySubCheck: 'dailyTask' }),
        });

        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);
        service.setTaskCompleted(GAME, 'daily', 'acc-1', false);
        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);
        service.setTaskCompleted(GAME, 'weekly', 'acc-1', true);

        expect(storage.saved[GAME][0].monthlySubRemaining).toBe(9);

        vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);

        expect(storage.saved[GAME][0].monthlySubRemaining).toBe(8);
    });
});

describe('saving settings', () => {
    const subscribed = account({ monthlySubRemaining: 10, lastMonthlySubEditedDay: '2026-10-22T12:00:00.000Z' });

    it('switching mode settles the calendar count then restarts it', () => {
        const { service, storage, store } = load({ accounts: { [GAME]: [subscribed, account({ id: 'acc-2' })] } });

        expect(service.saveSettings({ monthlySubCheck: 'dailyTask', theme: 'sparkle' })).toEqual({
            accountsChanged: true,
        });

        const [withSub, withoutSub] = storage.saved[GAME];

        expect(withSub).toMatchObject({ monthlySubRemaining: 7, lastMonthlySubEditedDay: '2026-10-25T12:00:00.000Z' });
        expect(withoutSub).toEqual(account({ id: 'acc-2' }));
        expect(store.data).toMatchObject({ monthlySubCheck: 'dailyTask', theme: 'sparkle' });
    });

    it('same mode leaves accounts alone', () => {
        const { service, storage } = load({ accounts: { [GAME]: [subscribed] } });

        expect(service.saveSettings({ monthlySubCheck: 'calendar' })).toEqual({ accountsChanged: false });
        expect(service.saveSettings({ theme: 'nikki' })).toEqual({ accountsChanged: false });
        expect(storage.saves).toBe(0);
    });
});

describe('backup', () => {
    it('export is the versioned file', () => {
        const { service } = load({ accounts: { [GAME]: [account()] } });

        expect(service.exportAccounts()).toBe(serializeAccounts({ [GAME]: [account()] }));
    });

    it('import replaces accounts and drops settings for missing ones', () => {
        const store = createStore({
            automaticDailies: { [GAME]: ['acc-1', 'acc-2'] },
            deadlineNotifications: { [OTHER]: ['acc-9'] },
            monthlySubNotifications: { [GAME]: ['acc-1'] },
        });
        const { service, storage } = load({ accounts: { [GAME]: [account(), account({ id: 'acc-2' })] }, store });

        service.importAccounts(JSON.stringify({ [GAME]: [account({ id: 'acc-2', label: 'Imported' })] }));

        expect(storage.saved).toEqual({ [GAME]: [account({ id: 'acc-2', label: 'Imported' })] });
        expect(store.data.automaticDailies).toEqual({ [GAME]: ['acc-2'] });
        expect(store.data.deadlineNotifications).toEqual({ [OTHER]: [] });
        expect(store.data.monthlySubNotifications).toEqual({ [GAME]: [] });
    });

    it.each([
        ['broken text', '{ nope', 'This file is not a Gacha Manager accounts backup'],
        ['a newer version', JSON.stringify({ version: 99, accounts: {} }), 'version 99'],
        ['an invalid account', JSON.stringify({ [GAME]: [{ label: 'x' }] }), `Invalid accounts for ${GAME}`],
    ])('rejects %s without changing anything', (_, text, message) => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });

        expect(() => service.importAccounts(text)).toThrow(message);
        expect(storage.saves).toBe(0);
        expect(service.getAccounts()).toEqual({ [GAME]: [account()] });
    });
});

describe('change events', () => {
    it('fire on game data, saves and settings', () => {
        const { service } = load();
        const listener = vi.fn();
        const stop = service.onChange(listener);

        service.setGameData({ config, tasks });
        service.insertAccounts([{ name: GAME, server: 'Asia' }]);
        service.saveSettings({ theme: 'nikki' });

        expect(listener).toHaveBeenCalledTimes(3);

        stop();
        service.saveSettings({ theme: '' });

        expect(listener).toHaveBeenCalledTimes(3);
    });
});
