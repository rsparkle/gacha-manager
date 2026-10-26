import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

const subscribe = (channel) => (callback) => {
    const listener = (_event, payload) => callback(payload);

    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
    getGameData: invoke('getGameData'),
    onGameDataUpdated: subscribe('game-data-updated'),

    getImageUrl: invoke('getImageUrl'),
    clearImageCache: invoke('clearImageCache'),

    getGroupedAccounts: invoke('getGroupedAccounts'),
    insertAccounts: invoke('insertAccounts'),
    updateAccount: invoke('updateAccount'),
    deleteAccount: invoke('deleteAccount'),
    setTaskCompleted: invoke('setTaskCompleted'),
    syncCalendarMonthlySubs: invoke('syncCalendarMonthlySubs'),
    exportAccounts: invoke('exportAccounts'),
    importAccounts: invoke('importAccounts'),
    onDailiesCompleted: subscribe('dailies-completed'),

    loadSettings: invoke('loadSettings'),
    saveSettings: invoke('saveSettings'),

    getUpdateState: invoke('getUpdateState'),
    downloadUpdate: invoke('downloadUpdate'),
    installUpdate: invoke('installUpdate'),
    dismissUpdate: invoke('dismissUpdate'),
    openReleasesPage: invoke('openReleasesPage'),
    onUpdateState: subscribe('update-state'),

    hideToTray: () => ipcRenderer.send('hideToTray'),
    setTitleBarColors: (colors) => ipcRenderer.send('setTitleBarColors', colors),
    relaunchApp: invoke('relaunchApp'),
});
