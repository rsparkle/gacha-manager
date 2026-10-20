export const ACCOUNTS_VERSION = 1;

export class AccountsMigrationError extends Error {
    name = 'AccountsMigrationError';
}

const MIGRATIONS = {
    0: (accounts) => accounts,
};

export class NewerAccountsVersionError extends Error {
    name = 'NewerAccountsVersionError';
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

    if (data.version > ACCOUNTS_VERSION) {
        throw new NewerAccountsVersionError(
            `accounts.json is version ${data.version}, but this app supports up to version ${ACCOUNTS_VERSION}`,
        );
    }

    if (!isPlainObject(data.accounts)) {
        throw new Error('Invalid accounts.json structure');
    }

    return { version: data.version, accounts: data.accounts };
}

export function migrateAccountsFile(data) {
    let { version, accounts } = readEnvelope(data);
    const fromVersion = version;

    while (version < ACCOUNTS_VERSION) {
        const migrate = MIGRATIONS[version];

        if (!migrate) {
            throw new AccountsMigrationError(`No migration from accounts version ${version}`);
        }

        try {
            accounts = migrate(structuredClone(accounts));
        } catch (err) {
            throw new AccountsMigrationError(`Migration from accounts version ${version} failed: ${err.message}`, {
                cause: err,
            });
        }

        version++;
    }

    for (const [gameName, gameAccounts] of Object.entries(accounts)) {
        if (!Array.isArray(gameAccounts)) {
            throw new Error(`Invalid accounts for ${gameName}`);
        }
    }

    return { accounts, fromVersion };
}

export function serializeAccounts(accounts) {
    return JSON.stringify({ version: ACCOUNTS_VERSION, accounts }, null, 2);
}