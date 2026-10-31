import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountsFileStorage } from '../../src/main/accountsStorage.js';
import { USER_DATA_VERSION } from '../../src/shared/accounts/accountsFile.js';

const state = vi.hoisted(() => ({ dialogChoice: 1 }));

vi.mock('electron', () => ({
    dialog: { showMessageBoxSync: vi.fn(() => state.dialogChoice) },
    shell: { openExternal: vi.fn() },
}));

const { shell } = await import('electron');

let dir;

const accountsPath = () => path.join(dir, 'accounts.json');
const readAccountsFile = () => JSON.parse(fs.readFileSync(accountsPath(), 'utf-8'));
const writeAccountsFile = (data) =>
    fs.writeFileSync(accountsPath(), typeof data === 'string' ? data : JSON.stringify(data));
const storage = () => createAccountsFileStorage(accountsPath());

function account(overrides = {}) {
    return { id: 'acc-1', uid: '', server: 'Asia', label: '', tasks: {}, ...overrides };
}

const EMPTY_CUSTOM = { games: {}, tasks: {} };
const CUSTOM = {
    games: { 'custom:game-1': { name: 'My Game', color: '#7aa2f7' } },
    tasks: {
        'custom:game-1': [
            {
                id: 'custom:task-1',
                label: 'Login event',
                category: 'Events',
                createdAt: '2026-10-25T12:00:00.000Z',
                endsAt: '2026-10-30T12:00:00.000Z',
            },
        ],
    },
};
const EMPTY_FILE = { version: USER_DATA_VERSION, accounts: {}, custom: EMPTY_CUSTOM };

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gacha-manager-test-'));
    state.dialogChoice = 1;
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('loading accounts.json', () => {
    it('first launch', () => {
        expect(storage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(readAccountsFile()).toEqual(EMPTY_FILE);
    });

    it('migrates old file with backup', () => {
        const legacy = { Test: [account()] };
        writeAccountsFile(legacy);

        expect(storage().load()).toEqual({ accounts: legacy, custom: EMPTY_CUSTOM });
        expect(readAccountsFile()).toEqual({ version: USER_DATA_VERSION, accounts: legacy, custom: EMPTY_CUSTOM });
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'accounts.v0-backup.json'), 'utf-8'))).toEqual(legacy);
    });

    it('upgrading from v1 keeps every account', () => {
        const v1 = { version: 1, accounts: { Test: [account(), account({ id: 'acc-2', label: 'Alt' })] } };
        writeAccountsFile(v1);

        expect(storage().load()).toEqual({ accounts: v1.accounts, custom: EMPTY_CUSTOM });
        expect(readAccountsFile()).toEqual({ version: USER_DATA_VERSION, accounts: v1.accounts, custom: EMPTY_CUSTOM });
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'accounts.v1-backup.json'), 'utf-8'))).toEqual(v1);
    });

    it('loads custom games and tasks', () => {
        writeAccountsFile({ version: USER_DATA_VERSION, accounts: { Test: [account()] }, custom: CUSTOM });

        expect(storage().load()).toEqual({ accounts: { Test: [account()] }, custom: CUSTOM });
    });

    it('no backup when current', () => {
        writeAccountsFile({ version: USER_DATA_VERSION, accounts: { Test: [account()] }, custom: EMPTY_CUSTOM });

        storage().load();

        expect(fs.readdirSync(dir)).toEqual(['accounts.json']);
    });

    it('corrupted file: start fresh', () => {
        state.dialogChoice = 0;
        writeAccountsFile('{ not json');

        expect(storage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(readAccountsFile()).toEqual(EMPTY_FILE);

        const backup = fs.readdirSync(dir).find((name) => name.startsWith('accounts.corrupt-'));

        expect(fs.readFileSync(path.join(dir, backup), 'utf-8')).toBe('{ not json');
    });

    it('corrupted file: quit', () => {
        writeAccountsFile('{ not json');

        expect(() => storage().load()).toThrow(expect.objectContaining({ userDeclined: true }));
        expect(fs.readFileSync(accountsPath(), 'utf-8')).toBe('{ not json');
    });

    it('file from newer version: download', () => {
        const newer = { version: 99, accounts: {} };
        writeAccountsFile(newer);
        state.dialogChoice = 0;

        expect(() => storage().load()).toThrow(
            expect.objectContaining({ name: 'NewerUserDataVersionError', userDeclined: true }),
        );
        expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/rsparkle/gacha-manager/releases/latest');
        expect(readAccountsFile()).toEqual(newer);
    });
});

describe('saving accounts.json', () => {
    it('writes the versioned file without leftovers', () => {
        storage().save({ accounts: { Test: [account()] }, custom: CUSTOM });

        expect(readAccountsFile()).toEqual({
            version: USER_DATA_VERSION,
            accounts: { Test: [account()] },
            custom: CUSTOM,
        });
        expect(fs.readdirSync(dir)).toEqual(['accounts.json']);
    });

    it('file from newer version: start fresh', () => {
        const newer = { version: 99, accounts: {} };
        writeAccountsFile(newer);
        state.dialogChoice = 1;

        expect(storage().load()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(readAccountsFile()).toEqual(EMPTY_FILE);
        expect(shell.openExternal).not.toHaveBeenCalled();

        const backup = fs.readdirSync(dir).find((name) => name.startsWith('accounts.newer-'));

        expect(JSON.parse(fs.readFileSync(path.join(dir, backup), 'utf-8'))).toEqual(newer);
    });

    it('file from newer version: quit', () => {
        const newer = { version: 99, accounts: {} };
        writeAccountsFile(newer);
        state.dialogChoice = 2;

        expect(() => storage().load()).toThrow(expect.objectContaining({ userDeclined: true }));
        expect(shell.openExternal).not.toHaveBeenCalled();
        expect(readAccountsFile()).toEqual(newer);
    });
});