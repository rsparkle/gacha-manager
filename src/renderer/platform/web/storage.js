import {
    ACCOUNTS_VERSION,
    AccountsMigrationError,
    NewerAccountsVersionError,
    parseAccounts,
    serializeAccounts,
} from '../../../shared/accounts/accountsFile.js';

const PREFIX = 'gacha-manager:';

export const KEYS = {
    accounts: `${PREFIX}accounts`,
    settings: `${PREFIX}settings`,
    gameConfig: `${PREFIX}game-config`,
    gameTasks: `${PREFIX}game-tasks`,
    independentEvents: `${PREFIX}independent-events`,
};

export function read(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        throw new Error(
            err?.name === 'QuotaExceededError'
                ? 'Browser storage is full, so the change could not be saved'
                : 'This browser is blocking site storage, so the change could not be saved',
            { cause: err },
        );
    }
}

export function readJson(key) {
    const text = read(key);

    return text === null ? null : JSON.parse(text);
}

export function writeJson(key, value) {
    write(key, JSON.stringify(value));
}

export function createSettingsStore() {
    let data = {};

    function reload() {
        try {
            const stored = readJson(KEYS.settings);

            data = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        } catch {
            data = {};
        }
    }

    reload();

    return {
        reload,
        get store() {
            return structuredClone(data);
        },
        get(key, fallback) {
            return data[key] === undefined ? fallback : data[key];
        },
        set(keyOrValues, value) {
            const changes = typeof keyOrValues === 'string' ? { [keyOrValues]: value } : keyOrValues;
            const next = { ...data, ...structuredClone(changes) };

            writeJson(KEYS.settings, next);
            data = next;
        },
    };
}

export function createAccountsStorage() {
    return {
        load() {
            const text = read(KEYS.accounts);

            if (text === null) return {};

            let result;

            try {
                result = parseAccounts(text);
            } catch (err) {
                if (err instanceof NewerAccountsVersionError || err instanceof AccountsMigrationError) throw err;

                console.error('Saved accounts could not be read, starting fresh:', err);
                write(`${KEYS.accounts}.corrupt-${Date.now()}`, text);
                write(KEYS.accounts, serializeAccounts({}));

                return {};
            }

            if (result.fromVersion !== ACCOUNTS_VERSION) {
                write(`${KEYS.accounts}.v${result.fromVersion}-backup`, text);
                write(KEYS.accounts, serializeAccounts(result.accounts));
            }

            return result.accounts;
        },

        save(accounts) {
            write(KEYS.accounts, serializeAccounts(accounts));
        },
    };
}
