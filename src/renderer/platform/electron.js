const api = window.api;

async function call(method, payload) {
    const response = await api[method](payload);

    if (!response?.success) {
        throw new Error(response?.error || 'Unknown error');
    }

    return response.data;
}

export default {
    name: 'desktop',

    gameData: {
        load: () => call('getGameData'),
        onUpdated: (callback) => api.onGameDataUpdated(callback),
    },

    images: {
        getUrl: (file) => call('getImageUrl', file),
    },

    accounts: {
        getGroups: () => call('getAccountGroups'),
        insert: (gameList) => call('insertAccounts', gameList),
        update: (gameName, id, changes) => call('updateAccount', { gameName, id, changes }),
        remove: (gameName, id) => call('deleteAccount', { gameName, id }),
        setTaskCompleted: (gameName, accountId, taskId, completed) =>
            call('setTaskCompleted', { gameName, accountId, taskId, completed }),
        syncCalendarMonthlySubs: () => call('syncCalendarMonthlySubs'),
        createCustomGame: () => call('createCustomGame'),
        renameCustomGame: (gameKey, name) => call('renameCustomGame', { gameKey, name }),
        deleteCustomGame: (gameKey) => call('deleteCustomGame', gameKey),
        addCustomTask: (gameKey, task) => call('addCustomTask', { gameKey, task }),
        updateCustomTask: (gameKey, taskId, task) => call('updateCustomTask', { gameKey, taskId, task }),
        deleteCustomTask: (gameKey, taskId) => call('deleteCustomTask', { gameKey, taskId }),
        exportToFile: () => call('exportAccounts'),
        importFromFile: () => call('importAccounts'),
        onExternalChange: (callback) => api.onDailiesCompleted(() => callback('dailiesCompleted')),
    },

    settings: {
        load: () => call('loadSettings'),
        save: (settings) => call('saveSettings', settings),
    },

    desktop: {
        hideToTray: () => api.hideToTray(),
        setTitleBarColors: (colors) => api.setTitleBarColors(colors),
        relaunch: () => call('relaunchApp'),
        clearImageCache: () => call('clearImageCache'),

        updates: {
            getState: () => call('getUpdateState'),
            onState: (callback) => api.onUpdateState(callback),
            download: () => call('downloadUpdate'),
            install: () => call('installUpdate'),
            dismiss: () => call('dismissUpdate'),
            openReleasesPage: () => call('openReleasesPage'),
        },
    },
};
