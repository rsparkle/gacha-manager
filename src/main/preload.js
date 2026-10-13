import {contextBridge, ipcRenderer} from 'electron';

const subscribe = channel => callback => {
    const listener = () => callback();

    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
    getGameConfig: () => ipcRenderer.invoke('getGameConfig'),

    getGameTasks: () => ipcRenderer.invoke('getGameTasks'),

    cacheImage: filename => ipcRenderer.invoke('cacheImage', filename),

    deleteCacheAssets: () => ipcRenderer.invoke('deleteCacheAssets'),

    getGamesWithoutAccounts: () => ipcRenderer.invoke('getGamesWithoutAccounts'),

    insertAccounts: gameList => ipcRenderer.invoke('insertAccounts', gameList),

    updateAccount: accountData => ipcRenderer.invoke('updateAccount', accountData),

    deleteAccount: accountData => ipcRenderer.invoke('deleteAccount', accountData),

    getGroupedAccounts: () => ipcRenderer.invoke('getGroupedAccounts'),

    updateTaskLog: taskLogData => ipcRenderer.invoke('updateTaskLog', taskLogData),

    loadSettings: () => ipcRenderer.invoke('loadSettings'),

    saveSettings: settings => ipcRenderer.invoke('saveSettings', settings),

    syncCalendarMonthlySubs: () => ipcRenderer.invoke('syncCalendarMonthlySubs'),

    onDailiesCompleted: subscribe('dailies-completed')
});