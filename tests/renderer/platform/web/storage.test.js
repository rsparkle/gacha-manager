import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KEYS,
    createAccountsStorage,
    createSettingsStore,
    readJson,
    write,
} from '../../../../src/renderer/platform/web/storage.js';
import { createLocalStorage } from '../../../helpers/stores.js';
import { USER_DATA_VERSION } from '../../../../src/shared/accounts/accountsFile.js';

let localStorage;

function account(overrides = {}) {
    return { id: 'acc-1', uid: '', server: 'Asia', label: '', tasks: {}, ...overrides };
}

const EMPTY_CUSTOM = { games: {}, tasks: {} };
const CUSTOM = { games: { 'custom:game-1': { name: 'My Game', color: '#7aa2f7' } }, tasks: {} };

beforeEach(() => {
    localStorage = createLocalStorage();
    vi.stubGlobal('localStorage', localStorage);
});

describe('settings store', () => {
    it('reads defaults when empty', () => {
        const store = createSettingsStore();

        expect(store.get('theme', 'fallback')).toBe('fallback');
        expect(store.store).toEqual({});
    });

    it('sets one key or many and persists', () => {
        const store = createSettingsStore();

        store.set('theme', 'nikki');
        store.set({ server: 'Europe', deadlineNotifications: { Test: ['acc-1'] } });

        expect(store.get('theme')).toBe('nikki');
        expect(readJson(KEYS.settings)).toEqual({
            theme: 'nikki',
            server: 'Europe',
            deadlineNotifications: { Test: ['acc-1'] },
        });
    });

    it('store is a copy', () => {
        const store = createSettingsStore();
        store.set({ deadlineNotifications: { Test: [] } });

        store.store.deadlineNotifications.Test.push('x');

        expect(store.get('deadlineNotifications')).toEqual({ Test: [] });
    });

    it('reload picks up another tab', () => {
        const store = createSettingsStore();

        localStorage.setItem(KEYS.settings, JSON.stringify({ theme: 'furina' }));
        store.reload();

        expect(store.get('theme')).toBe('furina');
    });

    it('migrates the old notifications key and saves it', () => {
        localStorage.setItem(
            KEYS.settings,
            JSON.stringify({ theme: 'nikki', windowsNotifications: { Test: ['acc-1'] } }),
        );

        const store = createSettingsStore();

        expect(store.store).toEqual({ theme: 'nikki', deadlineNotifications: { Test: ['acc-1'] } });
        expect(readJson(KEYS.settings)).toEqual({ theme: 'nikki', deadlineNotifications: { Test: ['acc-1'] } });
    });

    it('does not rewrite settings that need no migration', () => {
        const text = JSON.stringify({ theme: 'nikki' });
        localStorage.setItem(KEYS.settings, text);
        const setItem = vi.spyOn(localStorage, 'setItem');

        createSettingsStore();

        expect(setItem).not.toHaveBeenCalled();
        expect(localStorage.getItem(KEYS.settings)).toBe(text);
    });

    it.each([['{ broken'], ['[]'], ['"text"']])('ignores bad saved settings %s', (text) => {
        localStorage.setItem(KEYS.settings, text);

        expect(createSettingsStore().store).toEqual({});
    });
});

describe('accounts storage', () => {
    it('empty when nothing saved', () => {
        expect(createAccountsStorage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(localStorage.items.size).toBe(0);
    });

    it('saves the versioned file', () => {
        createAccountsStorage().save({ accounts: { Test: [account()] }, custom: CUSTOM });

        expect(readJson(KEYS.accounts)).toEqual({
            version: USER_DATA_VERSION,
            accounts: { Test: [account()] },
            custom: CUSTOM,
        });
    });

    it('loads custom games', () => {
        localStorage.setItem(
            KEYS.accounts,
            JSON.stringify({ version: USER_DATA_VERSION, accounts: {}, custom: CUSTOM }),
        );

        expect(createAccountsStorage().load()).toEqual({ accounts: {}, custom: CUSTOM });
    });

    it('migrates old data with backup', () => {
        const legacy = JSON.stringify({ Test: [account()] });
        localStorage.setItem(KEYS.accounts, legacy);

        expect(createAccountsStorage().load()).toEqual({ accounts: { Test: [account()] }, custom: EMPTY_CUSTOM });
        expect(readJson(KEYS.accounts)).toEqual({
            version: USER_DATA_VERSION,
            accounts: { Test: [account()] },
            custom: EMPTY_CUSTOM,
        });
        expect(localStorage.getItem(`${KEYS.accounts}.v0-backup`)).toBe(legacy);
    });

    it('upgrading from v1 keeps every account', () => {
        const v1 = JSON.stringify({ version: 1, accounts: { Test: [account()] } });
        localStorage.setItem(KEYS.accounts, v1);

        createAccountsStorage().load();

        expect(readJson(KEYS.accounts)).toEqual({
            version: USER_DATA_VERSION,
            accounts: { Test: [account()] },
            custom: EMPTY_CUSTOM,
        });
        expect(localStorage.getItem(`${KEYS.accounts}.v1-backup`)).toBe(v1);
    });

    it('corrupted data: backup and start fresh', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem(KEYS.accounts, '{ not json');

        expect(createAccountsStorage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(readJson(KEYS.accounts)).toEqual({ version: USER_DATA_VERSION, accounts: {}, custom: EMPTY_CUSTOM });

        const backup = [...localStorage.items.keys()].find((key) => key.startsWith(`${KEYS.accounts}.corrupt-`));

        expect(localStorage.getItem(backup)).toBe('{ not json');
    });

    it('newer version: declining leaves it untouched', () => {
        const newer = JSON.stringify({ version: 99, accounts: {} });
        localStorage.setItem(KEYS.accounts, newer);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => false),
        );

        expect(() => createAccountsStorage().load()).toThrow(
            expect.objectContaining({ name: 'NewerUserDataVersionError' }),
        );
        expect(globalThis.confirm).toHaveBeenCalledWith(expect.stringContaining('newer version'));
        expect(localStorage.getItem(KEYS.accounts)).toBe(newer);
    });

    it('newer version: start fresh keeps a backup', () => {
        const newer = JSON.stringify({ version: 99, accounts: {} });
        localStorage.setItem(KEYS.accounts, newer);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true),
        );

        expect(createAccountsStorage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(readJson(KEYS.accounts)).toEqual({ version: USER_DATA_VERSION, accounts: {}, custom: EMPTY_CUSTOM });

        const backup = [...localStorage.items.keys()].find((key) => key.startsWith(`${KEYS.accounts}.newer-`));

        expect(localStorage.getItem(backup)).toBe(newer);
    });
});

describe('write errors', () => {
    it.each([
        ['QuotaExceededError', 'Browser storage is full'],
        ['SecurityError', 'This browser is blocking site storage'],
    ])('%s gets a readable message', (name, message) => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw Object.assign(new Error('nope'), { name });
            },
        });

        expect(() => write(KEYS.settings, '{}')).toThrow(message);
    });
});
