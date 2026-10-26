import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    ACCOUNTS_VERSION,
    AccountsMigrationError,
    NewerAccountsVersionError,
    backupFileName,
    migrateAccountsFile,
    parseAccounts,
    serializeAccounts,
} from '../../../src/shared/accounts/accountsFile.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/accounts');

function fixture(version) {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES, `v${version}.json`), 'utf-8'));
}

function expectCurrentShape(accounts) {
    for (const [gameName, gameAccounts] of Object.entries(accounts)) {
        expect(Array.isArray(gameAccounts), gameName).toBe(true);

        for (const account of gameAccounts) {
            expect(account).toEqual(
                expect.objectContaining({
                    id: expect.any(String),
                    uid: expect.any(String),
                    server: expect.any(String),
                    label: expect.any(String),
                    tasks: expect.any(Object),
                }),
            );

            for (const completedAt of Object.values(account.tasks)) {
                expect(Number.isFinite(Date.parse(completedAt))).toBe(true);
            }
        }
    }
}

const versions = Array.from({ length: ACCOUNTS_VERSION + 1 }, (_, version) => version);

describe('accounts.json versions', () => {
    it.each(versions)('example file for v%i', (version) => {
        expect(
            fs.existsSync(path.join(FIXTURES, `v${version}.json`)),
            `Add tests/fixtures/accounts/v${version}.json with a real accounts file saved by that version`,
        ).toBe(true);
    });

    it.each(versions)('migrates v%i', (version) => {
        const { accounts, fromVersion } = migrateAccountsFile(fixture(version));

        expect(fromVersion).toBe(version);
        expectCurrentShape(accounts);
    });

    it.each(versions.slice(0, -1))('migration from v%i exists', (version) => {
        expect(() => migrateAccountsFile({ version, accounts: {} })).not.toThrow();
    });

    it('keeps every account', () => {
        const migrated = versions.map((version) => migrateAccountsFile(fixture(version)).accounts);

        for (const accounts of migrated) {
            expect(Object.keys(accounts)).toEqual(Object.keys(migrated.at(-1)));
            expect(
                Object.values(accounts)
                    .flat()
                    .map((account) => account.id),
            ).toEqual(
                Object.values(migrated.at(-1))
                    .flat()
                    .map((account) => account.id),
            );
        }
    });

    it('does not mutate input', () => {
        const data = fixture(0);
        const copy = structuredClone(data);

        migrateAccountsFile(data);

        expect(data).toEqual(copy);
    });
});

describe('migrateAccountsFile', () => {
    it('no version means v0', () => {
        expect(migrateAccountsFile({ 'Genshin Impact': [] })).toEqual({
            accounts: { 'Genshin Impact': [] },
            fromVersion: 0,
        });
    });

    it('reads the current envelope as is', () => {
        expect(migrateAccountsFile({ version: ACCOUNTS_VERSION, accounts: {} })).toEqual({
            accounts: {},
            fromVersion: ACCOUNTS_VERSION,
        });
    });

    it('newer version throws', () => {
        expect(() => migrateAccountsFile({ version: ACCOUNTS_VERSION + 1, accounts: {} })).toThrow(
            NewerAccountsVersionError,
        );
    });

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'accounts'],
        ['a negative version', { version: -1, accounts: {} }],
        ['a fractional version', { version: 1.5, accounts: {} }],
        ['a text version', { version: '1', accounts: {} }],
        ['accounts as an array', { version: ACCOUNTS_VERSION, accounts: [] }],
        ['missing accounts', { version: ACCOUNTS_VERSION }],
        ['a game that is not a list', { version: ACCOUNTS_VERSION, accounts: { 'Genshin Impact': {} } }],
        ['a legacy game that is not a list', { 'Genshin Impact': 'oops' }],
        ['an account that is not an object', { version: ACCOUNTS_VERSION, accounts: { 'Genshin Impact': ['acc'] } }],
        [
            'an account without an id',
            { version: ACCOUNTS_VERSION, accounts: { 'Genshin Impact': [{ server: 'Asia' }] } },
        ],
        ['an account with an empty id', { 'Genshin Impact': [{ id: '', server: 'Asia' }] }],
        ['an account without a server', { 'Genshin Impact': [{ id: 'acc-1' }] }],
        ['tasks that are not an object', { 'Genshin Impact': [{ id: 'acc-1', server: 'Asia', tasks: [] }] }],
    ])('rejects %s as corrupt', (_, data) => {
        let error;

        try {
            migrateAccountsFile(data);
        } catch (err) {
            error = err;
        }

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(NewerAccountsVersionError);
        expect(error).not.toBeInstanceOf(AccountsMigrationError);
    });
});

describe('serializeAccounts', () => {
    it('round-trips', () => {
        const accounts = migrateAccountsFile(fixture(ACCOUNTS_VERSION)).accounts;
        const text = serializeAccounts(accounts);

        expect(JSON.parse(text)).toEqual({ version: ACCOUNTS_VERSION, accounts });
        expect(migrateAccountsFile(JSON.parse(text))).toEqual({ accounts, fromVersion: ACCOUNTS_VERSION });
    });
});

describe('parseAccounts', () => {
    it('parses and migrates text', () => {
        expect(parseAccounts(JSON.stringify({ 'Genshin Impact': [] }))).toEqual({
            accounts: { 'Genshin Impact': [] },
            fromVersion: 0,
        });
    });

    it('throws a SyntaxError for broken text', () => {
        expect(() => parseAccounts('{ not json')).toThrow(SyntaxError);
    });
});

describe('backupFileName', () => {
    it('uses the date', () => {
        expect(backupFileName(new Date('2026-10-25T23:00:00Z'))).toBe('gacha-manager-accounts-2026-10-25.json');
    });
});
