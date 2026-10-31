import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    USER_DATA_VERSION,
    UserDataMigrationError,
    NewerUserDataVersionError,
    backupFileName,
    emptyUserData,
    migrateUserData,
    parseUserData,
    serializeUserData,
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

const EMPTY_CUSTOM = { games: {}, tasks: {} };
const GAME_KEY = 'custom:game-1';

function customTask(overrides = {}) {
    return {
        id: 'custom:task-1',
        label: 'Login event',
        category: 'Events',
        createdAt: '2026-10-25T12:00:00.000Z',
        endsAt: '2026-10-30T12:00:00.000Z',
        ...overrides,
    };
}

function withCustom(custom) {
    return { version: USER_DATA_VERSION, accounts: {}, custom };
}

const versions = Array.from({ length: USER_DATA_VERSION + 1 }, (_, version) => version);

describe('accounts.json versions', () => {
    it.each(versions)('example file for v%i', (version) => {
        expect(
            fs.existsSync(path.join(FIXTURES, `v${version}.json`)),
            `Add tests/fixtures/accounts/v${version}.json with a real accounts file saved by that version`,
        ).toBe(true);
    });

    it.each(versions)('migrates v%i', (version) => {
        const { accounts, custom, fromVersion } = migrateUserData(fixture(version));

        expect(fromVersion).toBe(version);
        expectCurrentShape(accounts);
        expect(custom).toEqual({ games: expect.any(Object), tasks: expect.any(Object) });
    });

    it.each(versions.filter((version) => version < 2))('v%i gets empty custom data', (version) => {
        expect(migrateUserData(fixture(version)).custom).toEqual(EMPTY_CUSTOM);
    });

    it('v2 keeps custom games and tasks', () => {
        const { custom } = migrateUserData(fixture(2));

        expect(Object.keys(custom.games)).toEqual(['custom:5d3e9b70-1c2a-4f8e-9b6d-2a7c4e1f0b93']);
        expect(custom.tasks['Genshin Impact']).toHaveLength(1);
    });

    it.each(versions.slice(0, -1))('migration from v%i exists', (version) => {
        expect(() => migrateUserData({ version, accounts: {} })).not.toThrow();
    });

    it('keeps every account', () => {
        const migrated = versions.map((version) => migrateUserData(fixture(version)).accounts);

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

        migrateUserData(data);

        expect(data).toEqual(copy);
    });
});

describe('migrateUserData', () => {
    it('no version means v0', () => {
        expect(migrateUserData({ 'Genshin Impact': [] })).toEqual({
            accounts: { 'Genshin Impact': [] },
            custom: EMPTY_CUSTOM,
            fromVersion: 0,
        });
    });

    it('reads the current envelope as is', () => {
        const custom = { games: { [GAME_KEY]: { name: 'My Game', color: '#7aa2f7' } }, tasks: {} };

        expect(migrateUserData(withCustom(custom))).toEqual({
            accounts: {},
            custom,
            fromVersion: USER_DATA_VERSION,
        });
    });

    it('ignores custom data in files older than v2', () => {
        expect(migrateUserData({ version: 1, accounts: {}, custom: 'junk' }).custom).toEqual(EMPTY_CUSTOM);
    });

    it('newer version throws', () => {
        expect(() => migrateUserData({ version: USER_DATA_VERSION + 1, accounts: {} })).toThrow(
            NewerUserDataVersionError,
        );
    });

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'accounts'],
        ['a negative version', { version: -1, accounts: {} }],
        ['a fractional version', { version: 1.5, accounts: {} }],
        ['a text version', { version: '1', accounts: {} }],
        ['accounts as an array', { version: USER_DATA_VERSION, accounts: [] }],
        ['missing accounts', { version: USER_DATA_VERSION }],
        ['a game that is not a list', { version: USER_DATA_VERSION, accounts: { 'Genshin Impact': {} } }],
        ['a legacy game that is not a list', { 'Genshin Impact': 'oops' }],
        ['an account that is not an object', { version: USER_DATA_VERSION, accounts: { 'Genshin Impact': ['acc'] } }],
        [
            'an account without an id',
            { version: USER_DATA_VERSION, accounts: { 'Genshin Impact': [{ server: 'Asia' }] } },
        ],
        ['an account with an empty id', { 'Genshin Impact': [{ id: '', server: 'Asia' }] }],
        ['an account without a server', { 'Genshin Impact': [{ id: 'acc-1' }] }],
        ['tasks that are not an object', { 'Genshin Impact': [{ id: 'acc-1', server: 'Asia', tasks: [] }] }],
        ['v2 without custom data', { version: 2, accounts: {} }],
        ['custom data that is not an object', withCustom([])],
        ['custom games that are not an object', withCustom({ games: [], tasks: {} })],
        [
            'a custom game with a plain key',
            withCustom({ games: { Mine: { name: 'Mine', color: '#7aa2f7' } }, tasks: {} }),
        ],
        ['a custom game without a name', withCustom({ games: { [GAME_KEY]: { color: '#7aa2f7' } }, tasks: {} })],
        [
            'a custom game with a bad color',
            withCustom({ games: { [GAME_KEY]: { name: 'X', color: 'blue' } }, tasks: {} }),
        ],
        ['custom tasks that are not a list', withCustom({ games: {}, tasks: { Test: customTask() } })],
        [
            'a custom task without a custom id',
            withCustom({ games: {}, tasks: { Test: [customTask({ id: 'daily' })] } }),
        ],
        ['a custom task without a label', withCustom({ games: {}, tasks: { Test: [customTask({ label: ' ' })] } })],
        ['a custom task with a bad end', withCustom({ games: {}, tasks: { Test: [customTask({ endsAt: 'soon' })] } })],
        [
            'a custom task that ends before it starts',
            withCustom({ games: {}, tasks: { Test: [customTask({ endsAt: '2026-10-20T12:00:00.000Z' })] } }),
        ],
        ['duplicate custom task ids', withCustom({ games: {}, tasks: { Test: [customTask(), customTask()] } })],
    ])('rejects %s as corrupt', (_, data) => {
        let error;

        try {
            migrateUserData(data);
        } catch (err) {
            error = err;
        }

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(NewerUserDataVersionError);
        expect(error).not.toBeInstanceOf(UserDataMigrationError);
    });
});

describe('serializeUserData', () => {
    it('round-trips', () => {
        const { accounts, custom } = migrateUserData(fixture(USER_DATA_VERSION));
        const text = serializeUserData({ accounts, custom });

        expect(JSON.parse(text)).toEqual({ version: USER_DATA_VERSION, accounts, custom });
        expect(migrateUserData(JSON.parse(text))).toEqual({ accounts, custom, fromVersion: USER_DATA_VERSION });
    });

    it('writes a migrated file without the version it came from', () => {
        const migrated = migrateUserData(fixture(0));

        expect(JSON.parse(serializeUserData(migrated))).toEqual({
            version: USER_DATA_VERSION,
            accounts: migrated.accounts,
            custom: EMPTY_CUSTOM,
        });
    });
});

describe('emptyUserData', () => {
    it('is valid and fresh every time', () => {
        const first = emptyUserData();

        first.custom.games.x = {};

        expect(emptyUserData()).toEqual({ accounts: {}, custom: EMPTY_CUSTOM });
        expect(migrateUserData(JSON.parse(serializeUserData(emptyUserData())))).toEqual({
            accounts: {},
            custom: EMPTY_CUSTOM,
            fromVersion: USER_DATA_VERSION,
        });
    });
});

describe('parseUserData', () => {
    it('parses and migrates text', () => {
        expect(parseUserData(JSON.stringify({ 'Genshin Impact': [] }))).toEqual({
            accounts: { 'Genshin Impact': [] },
            custom: EMPTY_CUSTOM,
            fromVersion: 0,
        });
    });

    it('throws a SyntaxError for broken text', () => {
        expect(() => parseUserData('{ not json')).toThrow(SyntaxError);
    });
});

describe('backupFileName', () => {
    it('uses the date', () => {
        expect(backupFileName(new Date('2026-10-25T23:00:00Z'))).toBe('gacha-manager-accounts-2026-10-25.json');
    });
});
