import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountsFileStorage } from '../../src/main/accountsStorage.js';

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

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gacha-manager-test-'));
    state.dialogChoice = 1;
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('loading accounts.json', () => {
    it('first launch', () => {
        expect(storage().load()).toEqual({});
        expect(readAccountsFile()).toEqual({ version: 1, accounts: {} });
    });

    it('migrates old file with backup', () => {
        const legacy = { Test: [account()] };
        writeAccountsFile(legacy);

        expect(storage().load()).toEqual(legacy);
        expect(readAccountsFile()).toEqual({ version: 1, accounts: legacy });
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'accounts.v0-backup.json'), 'utf-8'))).toEqual(legacy);
    });

    it('no backup when current', () => {
        writeAccountsFile({ version: 1, accounts: { Test: [account()] } });

        storage().load();

        expect(fs.readdirSync(dir)).toEqual(['accounts.json']);
    });

    it('corrupted file: start fresh', () => {
        state.dialogChoice = 0;
        writeAccountsFile('{ not json');

        expect(storage().load()).toEqual({});
        expect(readAccountsFile()).toEqual({ version: 1, accounts: {} });

        const backup = fs.readdirSync(dir).find((name) => name.startsWith('accounts.corrupt-'));

        expect(fs.readFileSync(path.join(dir, backup), 'utf-8')).toBe('{ not json');
    });

    it('corrupted file: quit', () => {
        writeAccountsFile('{ not json');

        expect(() => storage().load()).toThrow(expect.objectContaining({ userDeclined: true }));
        expect(fs.readFileSync(accountsPath(), 'utf-8')).toBe('{ not json');
    });

    it('file from newer version', () => {
        const newer = { version: 99, accounts: {} };
        writeAccountsFile(newer);
        state.dialogChoice = 0;

        expect(() => storage().load()).toThrow(
            expect.objectContaining({ name: 'NewerAccountsVersionError', userDeclined: true }),
        );
        expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/rsparkle/gacha-manager/releases/latest');
        expect(readAccountsFile()).toEqual(newer);
    });
});

describe('saving accounts.json', () => {
    it('writes the versioned file without leftovers', () => {
        storage().save({ Test: [account()] });

        expect(readAccountsFile()).toEqual({ version: 1, accounts: { Test: [account()] } });
        expect(fs.readdirSync(dir)).toEqual(['accounts.json']);
    });
});
