import { emptyCustomData, isValidCustomData, normalizeCustomData } from './customData.js';

export const USER_DATA_VERSION = 3;

export class UserDataMigrationError extends Error {
    name = 'UserDataMigrationError';
}

const MIGRATIONS = {
    0: (state) => state,
    1: (state) => ({ ...state, custom: emptyCustomData() }),
    2: (state) => state,
};

export class NewerUserDataVersionError extends Error {
    name = 'NewerUserDataVersionError';
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidAccount(account) {
    return (
        isPlainObject(account) &&
        typeof account.id === 'string' &&
        account.id.length > 0 &&
        typeof account.server === 'string' &&
        (account.tasks === undefined || isPlainObject(account.tasks))
    );
}

function readEnvelope(data) {
    if (!isPlainObject(data)) {
        throw new Error('Invalid accounts.json structure');
    }

    if (!Object.hasOwn(data, 'version')) {
        return { version: 0, accounts: data };
    }

    if (!Number.isInteger(data.version) || data.version < 0) {
        throw new Error('Invalid accounts.json version');
    }

    if (data.version > USER_DATA_VERSION) {
        throw new NewerUserDataVersionError(
            `accounts.json is version ${data.version}, but this app supports up to version ${USER_DATA_VERSION}`,
        );
    }

    if (!isPlainObject(data.accounts)) {
        throw new Error('Invalid accounts.json structure');
    }

    return {
        version: data.version,
        accounts: data.accounts,
        ...(data.version >= 2 && { custom: data.custom }),
    };
}

export function emptyUserData() {
    return { accounts: {}, custom: emptyCustomData() };
}

export function migrateUserData(data) {
    let { version, ...state } = readEnvelope(data);
    const fromVersion = version;

    while (version < USER_DATA_VERSION) {
        const migrate = MIGRATIONS[version];

        if (!migrate) {
            throw new UserDataMigrationError(`No migration from accounts version ${version}`);
        }

        try {
            state = migrate(structuredClone(state));
        } catch (err) {
            throw new UserDataMigrationError(`Migration from accounts version ${version} failed: ${err.message}`, {
                cause: err,
            });
        }

        version++;
    }

    for (const [gameName, gameAccounts] of Object.entries(state.accounts)) {
        if (!Array.isArray(gameAccounts) || !gameAccounts.every(isValidAccount)) {
            throw new Error(`Invalid accounts for ${gameName}`);
        }
    }

    if (!isValidCustomData(state.custom)) {
        throw new Error('Invalid custom games or tasks');
    }

    return { accounts: state.accounts, custom: normalizeCustomData(state.custom), fromVersion };
}

export function backupFileName(date = new Date()) {
    return `gacha-manager-accounts-${date.toISOString().slice(0, 10)}.json`;
}

export function parseUserData(text) {
    return migrateUserData(JSON.parse(text));
}

export function serializeUserData({ accounts, custom }) {
    return JSON.stringify({ version: USER_DATA_VERSION, accounts, custom }, null, 2);
}
