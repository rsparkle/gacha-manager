import { createAccountService } from '../../../shared/accounts/accountService.js';
import { backupFileName } from '../../../shared/accounts/accountsFile.js';
import { createDeadlineNotifier } from '../../../shared/deadlineNotifier.js';
import { createGameDataLoader } from '../../../shared/gameDataLoader.js';
import { GAME_DATA_REFRESH_MS } from '../../../shared/remote.js';
import { downloadTextFile, pickTextFile } from './files.js';
import { createImageResolver } from './images.js';
import { ensurePermission, showNotification } from './notifications.js';
import { KEYS, createAccountsStorage, createSettingsStore, readJson, writeJson } from './storage.js';

const settings = createSettingsStore();
const gameDataListeners = new Set();
const externalChangeListeners = new Set();

let accounts = null;
let started = null;

const subscribe = (listeners) => (callback) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const emit = (listeners, ...args) => {
    for (const listener of listeners) listener(...args);
};

const gameData = createGameDataLoader({
    readCache: () => {
        const config = readJson(KEYS.gameConfig);
        const tasks = readJson(KEYS.gameTasks);

        if (!config || !tasks) throw new Error('No cached game data');

        return { config, tasks };
    },
    writeCache: ({ config, tasks }) => {
        writeJson(KEYS.gameConfig, config);
        writeJson(KEYS.gameTasks, tasks);
    },
    onUpdate: (data) => {
        accounts.setGameData(data);
        emit(gameDataListeners);
    },
});

function reloadFromOtherTab(event) {
    if (![null, KEYS.accounts, KEYS.settings].includes(event.key)) return;

    settings.reload();

    try {
        accounts.reload();
    } catch (err) {
        console.error('Failed to reload accounts changed in another tab:', err);
        return;
    }

    emit(externalChangeListeners, 'otherTab');
}

async function start() {
    const initial = await gameData.load();

    accounts = createAccountService({ storage: createAccountsStorage(), settings });

    const notifier = createDeadlineNotifier({
        computeGroups: (now) => accounts.computeGroups(now),
        enabledAccountIds: (gameName) => accounts.getAccountIds('windowsNotifications', gameName),
        notify: showNotification,
    });

    accounts.onChange(notifier.refresh);
    accounts.setGameData(gameData.current);
    accounts.syncCalendarMonthlySubs();

    window.addEventListener('storage', reloadFromOtherTab);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;

        notifier.refresh();
        gameData.refresh();
    });

    setInterval(() => gameData.refresh(), GAME_DATA_REFRESH_MS);

    if (initial.fromCache) gameData.refresh();

    return accounts;
}

const ready = () => (started ??= start());

const withAccounts =
    (action) =>
    async (...args) =>
        structuredClone(action(await ready(), ...args));

export default {
    name: 'web',

    gameData: {
        load: async () => {
            await ready();

            return structuredClone(gameData.current);
        },
        onUpdated: subscribe(gameDataListeners),
    },

    images: {
        getUrl: createImageResolver(),
    },

    accounts: {
        getGrouped: withAccounts((service) => service.getGroupedAccounts()),
        insert: withAccounts((service, gameList) => service.insertAccounts(gameList)),
        update: withAccounts((service, gameName, id, changes) => service.updateAccount(gameName, id, changes)),
        remove: withAccounts((service, gameName, id) => service.deleteAccount(gameName, id)),
        setTaskCompleted: withAccounts((service, gameName, accountId, taskId, completed) =>
            service.setTaskCompleted(gameName, taskId, accountId, completed),
        ),
        syncCalendarMonthlySubs: withAccounts((service) => service.syncCalendarMonthlySubs()),
        exportToFile: async () => {
            downloadTextFile(backupFileName(), (await ready()).exportAccounts());

            return true;
        },
        importFromFile: async () => {
            const text = await pickTextFile('application/json,.json');

            if (text === null) return false;

            (await ready()).importAccounts(text);

            return true;
        },
        onExternalChange: subscribe(externalChangeListeners),
    },

    settings: {
        load: async () => settings.store,
        save: async (next) => {
            const notificationsAllowed = await ensurePermission(next);
            const result = (await ready()).saveSettings(next);

            return { ...result, restartRequired: false, notificationsBlocked: !notificationsAllowed };
        },
    },

    desktop: null,
};
