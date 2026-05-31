import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    getGameConfig: () => ipcRenderer.invoke('get-game-config'),
    cacheImage: (filename) => ipcRenderer.invoke('cache-image', filename),
    getGamesWithoutAccounts: () => ipcRenderer.invoke('getGamesWithoutAccounts'),
    insertAccounts: (gameList) => ipcRenderer.invoke('insertAccounts', gameList),
    updateAccount: (accountData) => ipcRenderer.invoke('updateAccount', accountData),
    deleteAccount: (accId) => ipcRenderer.invoke('deleteAccount', accId),
    getGroupedAccounts: () => ipcRenderer.invoke('getGroupedAccounts'),
    deleteLastTaskLog: (taskLogData) => ipcRenderer.invoke('deleteLastTaskLog', taskLogData),
    insertTaskLog: (taskLogData) => ipcRenderer.invoke('insertTaskLog', taskLogData),
    loadSettings: () => ipcRenderer.invoke('loadSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),
    sendNotification: (notificatioNData) => ipcRenderer.invoke('sendNotification', notificatioNData),
    on: (channel, callback) => ipcRenderer.on(channel, callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});