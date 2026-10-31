import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService } from '../../../src/shared/accounts/accountService.js';
import { serializeUserData } from '../../../src/shared/accounts/accountsFile.js';
import { currentTimeZone } from '../../../src/shared/accounts/customData.js';
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

const EMPTY_CUSTOM = { games: {}, tasks: {} };

function load({ accounts = {}, custom = EMPTY_CUSTOM, store = createStore() } = {}) {
    const storage = createMemoryStorage(accounts, custom);
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

        service.updateAccount(GAME, 'acc-1', {
            uid: 812345678,
            label: 'Alt',
            server: 'Europe',
            id: 'hijack',
            tasks: { daily: 'x' },
        });

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
        expect(store.data.deadlineNotifications).toEqual({ [OTHER]: ['acc-9'] });
        expect(store.data.monthlySubNotifications).toEqual({ [GAME]: ['acc-2'] });
    });
});

describe('tasks', () => {
    const accounts = { [GAME]: [account()] };

    it('grouped for the UI', () => {
        const { service } = load({
            accounts: { [GAME]: [account({ tasks: { daily: '2026-10-25T10:00:00.000Z' } })] },
        });

        const groups = service.computeGroups();

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

        expect(service.setTaskCompleted(GAME, 'daily', 'acc-1', true)).toBeUndefined();

        expect(service.computeGroups()[0].accounts[0].tasks.Daily[0]).toMatchObject({
            last_completed: '2026-10-25T12:00:00.000Z',
            isCompleted: true,
        });
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

        expect(service.exportAccounts()).toBe(
            serializeUserData({ accounts: { [GAME]: [account()] }, custom: EMPTY_CUSTOM }),
        );
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
        expect(store.data.deadlineNotifications).toEqual({});
        expect(store.data.monthlySubNotifications).toEqual({});
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

describe('custom games', () => {
    const groupFor = (service, key) => service.computeGroups().find((group) => group.name === key);

    it('create picks a free name and color and adds one account', () => {
        const { service, storage } = load();

        const first = service.createCustomGame();
        const second = service.createCustomGame();

        expect(first.key).toMatch(/^custom:/);
        expect(first.game).toEqual({ name: 'My Game', color: '#7aa2f7' });
        expect(second.game).toEqual({ name: 'My Game 2', color: '#9ece6a' });
        expect(first.account).toMatchObject({ uid: '', server: '', label: '', tasks: {} });
        expect(storage.saved[first.key]).toEqual([first.account]);
        expect(storage.savedCustom.games).toEqual({ [first.key]: first.game, [second.key]: second.game });
    });

    it('reuses the color of a deleted game', () => {
        const { service } = load();

        const first = service.createCustomGame();
        service.createCustomGame();
        service.deleteCustomGame(first.key);

        expect(service.createCustomGame().game.color).toBe('#7aa2f7');
    });

    it('groups come after the remote games with display info', () => {
        const { service } = load();
        const { key, account: created } = service.createCustomGame();

        const groups = service.computeGroups();

        expect(groups.map((group) => group.name)).toEqual([GAME, OTHER, key]);
        expect(groups[2]).toEqual({
            name: key,
            displayName: 'My Game',
            color: '#7aa2f7',
            custom: true,
            game_version: null,
            maintenance: null,
            accounts: [{ ...created, tasks: {} }],
        });
        expect(groups[0].displayName).toBeUndefined();
    });

    it('rename trims and checks every game name', () => {
        const { service, storage } = load();
        const { key } = service.createCustomGame();
        const other = service.createCustomGame();

        service.renameCustomGame(key, '  Arknights  ');

        expect(storage.savedCustom.games[key].name).toBe('Arknights');
        expect(() => service.renameCustomGame(key, ' ')).toThrow("The name can't be empty");
        expect(() => service.renameCustomGame(key, 'x'.repeat(41))).toThrow('up to 40 characters');
        expect(() => service.renameCustomGame(key, 'test')).toThrow("There's already a game called test");
        expect(() => service.renameCustomGame(other.key, 'ARKNIGHTS')).toThrow('already a game called ARKNIGHTS');
        expect(() => service.renameCustomGame('custom:nope', 'X')).toThrow('Unknown game: custom:nope');
        expect(() => service.renameCustomGame(GAME, 'X')).toThrow(`Unknown game: ${GAME}`);
    });

    it('rename to the same name saves nothing', () => {
        const { service, storage } = load();
        const { key } = service.createCustomGame();
        const saves = storage.saves;

        service.renameCustomGame(key, 'My Game');

        expect(storage.saves).toBe(saves);
    });

    it('delete removes accounts, tasks, settings and the favorite', () => {
        const store = createStore();
        const { service, storage } = load({ store });
        const { key, account: created } = service.createCustomGame();
        service.addCustomTask(key, { label: 'Event', category: 'Events', minutes: 60 });
        store.set({ deadlineNotifications: { [key]: [created.id], [GAME]: ['acc-9'] }, favoriteGame: key });

        service.deleteCustomGame(key);

        expect(storage.saved).toEqual({});
        expect(storage.savedCustom).toEqual(EMPTY_CUSTOM);
        expect(store.data.deadlineNotifications).toEqual({ [GAME]: ['acc-9'] });
        expect(store.data.favoriteGame).toBeNull();
        expect(groupFor(service, key)).toBeUndefined();
    });

    it('delete keeps a remote favorite', () => {
        const store = createStore({ favoriteGame: GAME });
        const { service } = load({ store });
        const { key } = service.createCustomGame();

        service.deleteCustomGame(key);

        expect(store.data.favoriteGame).toBe(GAME);
    });

    it('accounts have no server', () => {
        const { service, storage } = load();
        const { key } = service.createCustomGame();

        const [added] = service.insertAccounts([{ name: key, server: '' }]);
        service.updateAccount(key, added.id, { uid: '123', label: 'Alt' });

        expect(storage.saved[key][1]).toMatchObject({ uid: '123', label: 'Alt', server: '' });
        expect(() => service.insertAccounts([{ name: key, server: 'Asia' }])).toThrow('Unknown server: Asia');
        expect(() => service.updateAccount(key, added.id, { server: 'Asia' })).toThrow('Unknown server: Asia');
        expect(() => service.insertAccounts([{ name: 'custom:nope', server: '' }])).toThrow(
            'Unknown game: custom:nope',
        );
    });

    it('calendar monthly sub skips custom games', () => {
        const warn = vi.spyOn(console, 'warn');
        const { service } = load();
        const { key, account: created } = service.createCustomGame();
        service.updateAccount(key, created.id, { monthlySubRemaining: 10 });
        vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));

        expect(service.syncCalendarMonthlySubs()).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it('reload picks up custom data changed elsewhere', () => {
        const { service, storage } = load();

        storage.savedCustom = { games: { 'custom:x': { name: 'X', color: '#7aa2f7' } }, tasks: {} };
        service.reload();

        expect(service.getCustomData()).toEqual(storage.savedCustom);
    });
});

describe('custom tasks', () => {
    const tasksOf = (service, gameName) =>
        service.computeGroups().find((group) => group.name === gameName).accounts[0].tasks;

    it('add to a remote game shows up for every account', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account(), account({ id: 'acc-2' })] } });

        const task = service.addCustomTask(GAME, { label: ' Login event ', category: 'Daily', minutes: 90 });

        expect(task).toEqual({
            id: expect.stringMatching(/^custom:/),
            label: 'Login event',
            category: 'Daily',
            createdAt: '2026-10-25T12:00:00.000Z',
            endsAt: '2026-10-25T13:30:00.000Z',
        });
        expect(storage.savedCustom.tasks[GAME]).toEqual([task]);

        const groups = service.computeGroups();
        const daily = groups[0].accounts[1].tasks.Daily;

        expect(daily.map((entry) => entry.id)).toEqual(['daily', task.id]);
        expect(daily[1]).toMatchObject({
            label: 'Login event',
            custom: true,
            ended: false,
            isCompleted: false,
            isDisabled: false,
            duration: 90 * 60_000,
            nextReset: 90 * 60_000,
        });
    });

    it('new categories get their own group', () => {
        const { service } = load({ accounts: { [GAME]: [account()] } });

        service.addCustomTask(GAME, { label: 'Web event', category: 'Web', minutes: 60 });

        expect(Object.keys(tasksOf(service, GAME))).toEqual(['Daily', 'Weekly', 'Event', 'Web']);
    });

    it('custom tasks never reach the reset processor', () => {
        const error = vi.spyOn(console, 'error');
        const { service } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, { label: 'Event', category: 'Event', minutes: 60 });

        service.setTaskCompleted(GAME, task.id, 'acc-1', true);
        service.computeGroups();

        expect(error).not.toHaveBeenCalled();
        expect(tasksOf(service, GAME).Event.map((entry) => entry.isDisabled)).toEqual([true, false]);
    });

    it.each([
        [{ label: ' ', category: 'Events', minutes: 60 }, 'Give the task a name'],
        [{ label: 'x'.repeat(61), category: 'Events', minutes: 60 }, 'up to 60 characters'],
        [{ label: 'Event', category: '', minutes: 60 }, 'Pick a category'],
        [{ label: 'Event', category: 'x'.repeat(31), minutes: 60 }, 'up to 30 characters'],
        [{ label: 'Event', category: 'Events', minutes: 0 }, 'at least 1 minute'],
        [{ label: 'Event', category: 'Events', minutes: 1.5 }, 'at least 1 minute'],
        [{ label: 'Event', category: 'Events', minutes: 'soon' }, 'at least 1 minute'],
        [{ label: 'Event', category: 'Events', minutes: 367 * 24 * 60 }, 'at most 366 days'],
    ])('rejects %j without saving', (input, message) => {
        const { service, storage } = load();

        expect(() => service.addCustomTask(GAME, input)).toThrow(message);
        expect(storage.saves).toBe(0);
    });

    it('rejects unknown games', () => {
        const { service } = load();

        expect(() => service.addCustomTask('Nope', { label: 'x', category: 'y', minutes: 5 })).toThrow(
            'Unknown game: Nope',
        );
    });

    it('works on custom games', () => {
        const { service } = load();
        const { key } = service.createCustomGame();

        service.addCustomTask(key, { label: 'Annihilation', category: 'Weekly', minutes: 7 * 24 * 60 });

        expect(tasksOf(service, key).Weekly[0]).toMatchObject({ label: 'Annihilation', nextReset: 7 * 86_400_000 });
    });

    it('complete and uncomplete', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, { label: 'Event', category: 'Events', minutes: 60 });

        service.setTaskCompleted(GAME, task.id, 'acc-1', true);

        expect(storage.saved[GAME][0].tasks).toEqual({ [task.id]: '2026-10-25T12:00:00.000Z' });
        expect(tasksOf(service, GAME).Events[0].isCompleted).toBe(true);

        service.setTaskCompleted(GAME, task.id, 'acc-1', false);

        expect(storage.saved[GAME][0].tasks).toEqual({});
        expect(() => service.setTaskCompleted(GAME, 'custom:nope', 'acc-1', true)).toThrow('Unknown task: custom:nope');
    });

    it('ended tasks are disabled unless they were completed', () => {
        const { service } = load({ accounts: { [GAME]: [account(), account({ id: 'acc-2' })] } });
        const task = service.addCustomTask(GAME, { label: 'Event', category: 'Events', minutes: 60 });
        service.setTaskCompleted(GAME, task.id, 'acc-2', true);

        vi.setSystemTime(new Date('2026-10-25T13:00:00Z'));

        const [open, done] = service.computeGroups()[0].accounts.map((entry) => entry.tasks.Events[0]);

        expect(open).toMatchObject({ ended: true, isDisabled: true, isCompleted: false, nextReset: 0, duration: 0 });
        expect(done).toMatchObject({ ended: true, isDisabled: false, isCompleted: true, nextReset: 0, duration: 0 });
        expect(() => service.setTaskCompleted(GAME, task.id, 'acc-1', true)).toThrow('This task has already ended');
    });

    it('reset tasks store the rule with the local time zone and no deadline', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });

        const task = service.addCustomTask(GAME, {
            label: 'Store refresh',
            category: 'Weekly',
            minutes: 90,
            reset: { kind: 'weekly', zone: 'Mars/Olympus', anchor: '2026-11-10T13:30:00Z', everyWeeks: '2' },
        });

        expect(task).toEqual({
            id: expect.stringMatching(/^custom:/),
            label: 'Store refresh',
            category: 'Weekly',
            reset: { kind: 'weekly', zone: currentTimeZone(), anchor: '2026-11-10T13:30:00.000Z', everyWeeks: 2 },
        });
        expect(storage.savedCustom.tasks[GAME]).toEqual([task]);
        expect(tasksOf(service, GAME).Weekly.find((entry) => entry.id === task.id)).toMatchObject({
            ended: false,
            duration: 14 * 24 * 3_600_000,
            nextReset: 90 * 60_000,
        });
    });

    it('reset tasks reopen after the reset instead of ending', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, {
            label: 'Login',
            category: 'Login bonus',
            reset: { kind: 'daily', time: '00:00' },
        });
        const current = () => tasksOf(service, GAME)['Login bonus'][0];

        service.setTaskCompleted(GAME, task.id, 'acc-1', true);
        expect(current()).toMatchObject({ isCompleted: true });

        vi.setSystemTime(new Date('2026-11-11T12:01:00Z'));

        expect(current()).toMatchObject({ ended: false, isDisabled: false, isCompleted: false });
        expect(() => service.setTaskCompleted(GAME, task.id, 'acc-1', true)).not.toThrow();
        expect(current()).toMatchObject({ isCompleted: true });
    });

    it('cycle tasks land on the current cycle', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service } = load({ accounts: { [GAME]: [account()] } });

        const task = service.addCustomTask(GAME, {
            label: 'Abyss',
            category: 'Endgame',
            reset: { kind: 'cycle', startsAt: '2026-10-26T04:00:00Z', endsAt: '2026-11-09T04:00:00Z' },
        });

        expect(task.reset).toMatchObject({ startsAt: '2026-10-26T04:00:00.000Z', endsAt: '2026-11-09T04:00:00.000Z' });
        expect(tasksOf(service, GAME).Endgame[0]).toMatchObject({
            ended: false,
            isDisabled: false,
            duration: 14 * 24 * 3_600_000,
            nextReset: 12 * 24 * 3_600_000 + 16 * 3_600_000,
        });
    });

    it('cycles that have not started cannot be completed', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, {
            label: 'Abyss',
            category: 'Endgame',
            reset: { kind: 'cycle', startsAt: '2026-12-01T04:00:00Z', endsAt: '2026-12-15T04:00:00Z' },
        });

        expect(() => service.setTaskCompleted(GAME, task.id, 'acc-1', true)).toThrow(
            'This task is not active right now',
        );
        expect(storage.saved[GAME][0].tasks).toEqual({});
    });

    it.each([
        [{ kind: 'hourly' }, 'Unknown reset rule'],
        [{ kind: 'daily' }, 'Set a reset time'],
        [{ kind: 'weekly', anchor: '2026-11-02T04:00:00Z', everyWeeks: 0 }, 'Reset every 1 to 52 weeks'],
        [{ kind: 'monthly', time: '04:00', monthDays: [] }, 'Pick at least one day'],
        [{ kind: 'cycle', startsAt: '2026-11-08T04:00:00Z', endsAt: '2026-11-01T04:00:00Z' }, 'after the start'],
    ])('rejects the reset rule %j without saving', (reset, message) => {
        const { service, storage } = load();

        expect(() => service.addCustomTask(GAME, { label: 'Event', category: 'Events', minutes: 60, reset })).toThrow(
            message,
        );
        expect(storage.saves).toBe(0);
    });

    it('edit keeps the id and completions', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, { label: 'Event', category: 'Events', minutes: 60 });
        service.setTaskCompleted(GAME, task.id, 'acc-1', true);

        const edited = service.updateCustomTask(GAME, task.id, {
            label: ' Login bonus ',
            category: 'Login',
            reset: { kind: 'daily', time: '00:00' },
        });

        expect(edited).toEqual({
            id: task.id,
            label: 'Login bonus',
            category: 'Login',
            reset: { kind: 'daily', zone: currentTimeZone(), time: '00:00' },
        });
        expect(storage.savedCustom.tasks[GAME]).toEqual([edited]);
        expect(storage.saved[GAME][0].tasks).toEqual({ [task.id]: '2026-11-10T12:00:00.000Z' });
        expect(tasksOf(service, GAME).Login[0]).toMatchObject({ id: task.id, isCompleted: true });
    });

    it('edit keeps the zone the rule was made in', () => {
        const zoned = { kind: 'daily', zone: 'Asia/Tokyo', time: '04:00' };
        const { service } = load({
            accounts: { [GAME]: [account()] },
            custom: {
                games: {},
                tasks: { [GAME]: [{ id: 'custom:t', label: 'Login', category: 'Daily', reset: zoned }] },
            },
        });

        expect(
            service.updateCustomTask(GAME, 'custom:t', {
                label: 'Login',
                category: 'Daily',
                reset: { kind: 'daily', time: '05:00' },
            }).reset,
        ).toEqual({
            ...zoned,
            time: '05:00',
        });
    });

    it('edit can turn a rule back into a one-off', () => {
        vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
        const { service } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, {
            label: 'Login',
            category: 'Daily',
            reset: { kind: 'daily', time: '00:00' },
        });

        expect(service.updateCustomTask(GAME, task.id, { label: 'Login', category: 'Event', minutes: 30 })).toEqual({
            id: task.id,
            label: 'Login',
            category: 'Event',
            createdAt: '2026-11-10T12:00:00.000Z',
            endsAt: '2026-11-10T12:30:00.000Z',
        });
    });

    it('edit rejects bad input and unknown tasks without saving', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });
        const task = service.addCustomTask(GAME, { label: 'Event', category: 'Events', minutes: 60 });
        const saves = storage.saves;

        expect(() => service.updateCustomTask(GAME, task.id, { label: '', category: 'Events', minutes: 60 })).toThrow(
            'Give the task a name',
        );
        expect(() => service.updateCustomTask(GAME, 'custom:nope', { label: 'x', category: 'y', minutes: 5 })).toThrow(
            'Unknown task: custom:nope',
        );
        expect(storage.saves).toBe(saves);
    });

    it('delete removes the task and its completions', () => {
        const { service, storage } = load({ accounts: { [GAME]: [account()] } });
        const kept = service.addCustomTask(GAME, { label: 'Kept', category: 'Events', minutes: 60 });
        const removed = service.addCustomTask(GAME, { label: 'Removed', category: 'Events', minutes: 60 });
        service.setTaskCompleted(GAME, removed.id, 'acc-1', true);
        service.setTaskCompleted(GAME, 'daily', 'acc-1', true);

        service.deleteCustomTask(GAME, removed.id);

        expect(storage.savedCustom.tasks[GAME]).toEqual([kept]);
        expect(storage.saved[GAME][0].tasks).toEqual({ daily: '2026-10-25T12:00:00.000Z' });

        service.deleteCustomTask(GAME, kept.id);

        expect(storage.savedCustom.tasks).toEqual({});
        expect(() => service.deleteCustomTask(GAME, kept.id)).toThrow(`Unknown task: ${kept.id}`);
    });
});

describe('backup with custom data', () => {
    it('export and import keep custom games and tasks', () => {
        const { service } = load();
        const { key } = service.createCustomGame();
        service.addCustomTask(key, { label: 'Event', category: 'Events', minutes: 60 });
        const exported = service.exportAccounts();

        const other = load().service;
        other.importAccounts(exported);

        expect(other.getAccounts()).toEqual(service.getAccounts());
        expect(other.getCustomData()).toEqual(service.getCustomData());
    });

    it('import clears a favorite custom game that no longer exists', () => {
        const store = createStore({ favoriteGame: 'custom:gone' });
        const { service } = load({ store });

        service.importAccounts(JSON.stringify({ version: 1, accounts: {} }));

        expect(store.data.favoriteGame).toBeNull();
    });
});
