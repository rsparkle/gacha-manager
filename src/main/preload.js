import {contextBridge, ipcRenderer} from 'electron';

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

    sendNotification: notificationData => ipcRenderer.invoke('sendNotification', notificationData),

    on: (channel, callback) => ipcRenderer.on(channel, callback),

    removeAllListeners: channel => ipcRenderer.removeAllListeners(channel)
});