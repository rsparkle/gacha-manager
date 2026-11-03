import {
    USER_DATA_VERSION,
    UserDataMigrationError,
    NewerUserDataVersionError,
    emptyUserData,
    parseUserData,
    serializeUserData,
} from '../../../shared/accounts/accountsFile.js';
import { migrateSettings } from '../../../shared/settings.js';

const PREFIX = 'gacha-manager:';

export const KEYS = {
    accounts: `${PREFIX}accounts`,
    settings: `${PREFIX}settings`,
    gameConfig: `${PREFIX}game-config`,
    gameTasks: `${PREFIX}game-tasks`,
    independentEvents: `${PREFIX}independent-events`,
    usagePing: `${PREFIX}usage-ping`,
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
            const valid = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
            const migrated = migrateSettings(valid);

            if (migrated !== valid) writeJson(KEYS.settings, migrated);

            data = migrated;
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

const NEWER_DATA_PROMPT =
    'Your accounts were saved by a newer version of Gacha Manager.\n\n' +
    'Reload the page to get the latest version, or press OK to start fresh. ' +
    'Starting fresh keeps your current data as a backup, so you can import it after updating.';

function startFresh(text, reason) {
    write(`${KEYS.accounts}.${reason}-${Date.now()}`, text);
    write(KEYS.accounts, serializeUserData(emptyUserData()));

    return emptyUserData();
}

export function createAccountsStorage() {
    return {
        load() {
            const text = read(KEYS.accounts);

            if (text === null) return emptyUserData();

            let result;

            try {
                result = parseUserData(text);
            } catch (err) {
                if (err instanceof NewerUserDataVersionError) {
                    if (globalThis.confirm?.(NEWER_DATA_PROMPT)) return startFresh(text, 'newer');
                    throw err;
                }

                if (err instanceof UserDataMigrationError) throw err;

                console.error('Saved accounts could not be read, starting fresh:', err);

                return startFresh(text, 'corrupt');
            }

            if (result.fromVersion !== USER_DATA_VERSION) {
                write(`${KEYS.accounts}.v${result.fromVersion}-backup`, text);
                write(KEYS.accounts, serializeUserData(result));
            }

            return { accounts: result.accounts, custom: result.custom };
        },

        save(data) {
            write(KEYS.accounts, serializeUserData(data));
        },
    };
}
