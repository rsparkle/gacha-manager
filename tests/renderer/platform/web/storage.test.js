import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    KEYS,
    createAccountsStorage,
    createSettingsStore,
    readJson,
    write,
} from '../../../../src/renderer/platform/web/storage.js';
import { createLocalStorage } from '../../../helpers/stores.js';

let localStorage;

function account(overrides = {}) {
    return { id: 'acc-1', uid: '', server: 'Asia', label: '', tasks: {}, ...overrides };
}

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
        expect(createAccountsStorage().load()).toEqual({});
        expect(localStorage.items.size).toBe(0);
    });

    it('saves the versioned file', () => {
        createAccountsStorage().save({ Test: [account()] });

        expect(readJson(KEYS.accounts)).toEqual({ version: 1, accounts: { Test: [account()] } });
    });

    it('migrates old data with backup', () => {
        const legacy = JSON.stringify({ Test: [account()] });
        localStorage.setItem(KEYS.accounts, legacy);

        expect(createAccountsStorage().load()).toEqual({ Test: [account()] });
        expect(readJson(KEYS.accounts)).toEqual({ version: 1, accounts: { Test: [account()] } });
        expect(localStorage.getItem(`${KEYS.accounts}.v0-backup`)).toBe(legacy);
    });

    it('corrupted data: backup and start fresh', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem(KEYS.accounts, '{ not json');

        expect(createAccountsStorage().load()).toEqual({});
        expect(readJson(KEYS.accounts)).toEqual({ version: 1, accounts: {} });

        const backup = [...localStorage.items.keys()].find((key) => key.startsWith(`${KEYS.accounts}.corrupt-`));

        expect(localStorage.getItem(backup)).toBe('{ not json');
    });

    it('newer version is left untouched', () => {
        const newer = JSON.stringify({ version: 99, accounts: {} });
        localStorage.setItem(KEYS.accounts, newer);

        expect(() => createAccountsStorage().load()).toThrow(
            expect.objectContaining({ name: 'NewerAccountsVersionError' }),
        );
        expect(localStorage.getItem(KEYS.accounts)).toBe(newer);
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
