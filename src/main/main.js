import {
    app,
    BrowserWindow,
    ipcMain,
    protocol,
    net,
    Notification,
    dialog,
    Tray,
    Menu,
    powerMonitor,
    shell,
} from 'electron';

import {
    initializeAccounts,
    getAccounts,
    insertAccounts,
    updateAccount,
    deleteAccount,
    setTaskCompleted,
    getGroupedAccounts,
    syncCalendarMonthlySubs,
    updateNextNotification,
    completeAutomaticDailies,
    getAccountIds,
    setGameData,
    restartMonthlySubCount,
} from './accountHelper.js';

import { resolveInside } from './safePath.js';
import { createResetProcessor } from '../shared/resetProcessor';

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { execFile } from 'node:child_process';
import Store from 'electron-store';

const { autoUpdater } = require('electron-updater');

const store = new Store();

const PRELOAD_PATH = path.join(__dirname, 'preload.js');

const CONFIG_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main/game-config.json';

const CONFIG_CACHE = path.join(app.getPath('userData'), 'game-config.json');

const TASKS_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main/game-tasks.json';

const TASKS_CACHE = path.join(app.getPath('userData'), 'game-tasks.json');

const ASSETS_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main';

const ASSETS_CACHE = path.join(app.getPath('userData'), 'assets');

const RENDERER_ROOT = path.join(__dirname, '../renderer/main_window');

const MISSING_ASSET_RETRY_MS = 6 * 60 * 60 * 1000;
const NETWORK_RETRY_MS = 60 * 1000;
const GAME_DATA_REFRESH_MS = 6 * 60 * 60 * 1000;
const CACHE_TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

let GAME_CONFIG = null;
let GAME_TASKS = null;
let refreshingGameData = null;
let autoUpdatesStarted = false;
let mainWindow;
let monitorInterval = null;
let checkingProcesses = false;
let tray = null;
let hidingToTray = false;

const missingAssets = new Map();
const pendingDownloads = new Map();

app.setAppUserModelId('com.electron.gacha-manager');

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            secure: true,
            standard: true,
        },
    },
    {
        scheme: 'asset',
        privileges: {
            secure: true,
            standard: true,
        },
    },
]);

async function fetchWithTimeout(url, ms = 5000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);

    try {
        return await fetch(url, {
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchJson(url) {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
}

async function writeJson(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });

    const tempFile = `${file}.tmp`;

    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, file);
}

function validateGameData(config, tasks) {
    try {
        createResetProcessor(config, tasks);
    } catch (err) {
        err.isInvalidData = true;
        throw err;
    }
}

async function fetchGameData() {
    const [config, tasks] = await Promise.all([fetchJson(CONFIG_BASE), fetchJson(TASKS_BASE)]);

    validateGameData(config, tasks);

    return { config, tasks };
}

async function readCachedGameData() {
    const [config, tasks] = await Promise.all([readJson(CONFIG_CACHE), readJson(TASKS_CACHE)]);

    validateGameData(config, tasks);

    return { config, tasks };
}

async function cacheGameData({ config, tasks }) {
    try {
        await Promise.all([writeJson(CONFIG_CACHE, config), writeJson(TASKS_CACHE, tasks)]);
    } catch (err) {
        console.error('Failed to cache game data:', err);
    }
}

async function loadGameData() {
    try {
        return { ...(await readCachedGameData()), fromCache: true };
    } catch (cacheError) {
        try {
            const data = await fetchGameData();

            await cacheGameData(data);

            return { ...data, fromCache: false };
        } catch (remoteError) {
            throw new Error(
                `Failed to load game data.\n\nOnline: ${remoteError.message}\nCached: ${cacheError.message}`,
                { cause: remoteError },
            );
        }
    }
}

function applyGameData({ config, tasks }) {
    setGameData({ config, tasks });

    GAME_CONFIG = config;
    GAME_TASKS = tasks;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-data-updated');
    }
}

async function updateGameData() {
    let data;

    try {
        data = await fetchGameData();
    } catch (err) {
        if (err.isInvalidData) {
            new Notification({
                title: 'Game data update skipped',
                body: 'The latest game data was invalid, so the last working version is being used.',
            }).show();
        } else {
            console.error('Game data refresh failed:', err);
        }

        return;
    }

    if (isDeepStrictEqual(data, { config: GAME_CONFIG, tasks: GAME_TASKS })) return;

    await cacheGameData(data);

    try {
        applyGameData(data);
    } catch (err) {
        console.error('Failed to apply game data:', err);
    }
}

function refreshGameData() {
    refreshingGameData ??= updateGameData().finally(() => {
        refreshingGameData = null;
    });

    return refreshingGameData;
}

function handleGameDetected(gameName) {
    try {
        const accountIds = getAccountIds('automaticDailies', gameName);

        const changed = completeAutomaticDailies(gameName, accountIds);

        if (!changed) return;

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('dailies-completed');
        }
    } catch (err) {
        console.error('Automatic daily failed:', err);
    }
}

function getRunningProcesses() {
    return new Promise((resolve, reject) => {
        execFile(
            'tasklist',
            ['/FO', 'CSV', '/NH'],
            { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }

                const names = new Set();

                for (const line of stdout.split(/\r?\n/)) {
                    const match = line.match(/^"([^"]+)"/);

                    if (match) names.add(match[1].toLowerCase());
                }

                resolve(names);
            },
        );
    });
}

async function checkProcesses() {
    if (checkingProcesses) return;

    const gamesToCheck = Object.entries(GAME_CONFIG).filter(
        ([gameName]) => getAccountIds('automaticDailies', gameName).length > 0,
    );

    if (gamesToCheck.length === 0) return;

    checkingProcesses = true;

    try {
        const running = await getRunningProcesses();

        for (const [gameName, gameConfig] of gamesToCheck) {
            if (typeof gameConfig.process === 'string' && running.has(gameConfig.process.toLowerCase())) {
                handleGameDetected(gameName);
            }
        }
    } catch (err) {
        console.error('Process check failed:', err);
    } finally {
        checkingProcesses = false;
    }
}

function startMonitoring() {
    if (monitorInterval) return;

    checkProcesses();

    monitorInterval = setInterval(checkProcesses, 30000);
}

function stopMonitoring() {
    clearInterval(monitorInterval);
    monitorInterval = null;
}

async function deleteCacheFiles(months = 4) {
    const cutoffDate = new Date();

    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    async function cleanDirectory(directory) {
        let entries;

        try {
            entries = await fs.readdir(directory, {
                withFileTypes: true,
            });
        } catch {
            return;
        }

        for (const entry of entries) {
            const filePath = path.join(directory, entry.name);

            try {
                if (entry.isDirectory()) {
                    await cleanDirectory(filePath);
                    continue;
                }

                if (!entry.name.toLowerCase().endsWith('.webp')) {
                    continue;
                }

                const stats = await fs.stat(filePath);

                if (stats.mtime < cutoffDate) {
                    await fs.unlink(filePath);
                }
            } catch {
                // Skip files deleted or made inaccessible
            }
        }
    }

    await cleanDirectory(ASSETS_CACHE);
}

function encodePath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
}

async function downloadAsset(filename, localPath) {
    const retryAt = missingAssets.get(filename);

    if (retryAt && Date.now() < retryAt) return;

    try {
        const response = await fetchWithTimeout(`${ASSETS_BASE}/${encodePath(filename)}`, 10000);

        if (!response.ok) {
            missingAssets.set(filename, Date.now() + MISSING_ASSET_RETRY_MS);
            return;
        }

        await fs.mkdir(path.dirname(localPath), { recursive: true });

        const tempPath = `${localPath}.tmp`;

        await fs.writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
        await fs.rename(tempPath, localPath);

        missingAssets.delete(filename);
    } catch {
        missingAssets.set(filename, Date.now() + NETWORK_RETRY_MS);
    }
}

function registerProtocols() {
    protocol.handle('app', (request) => {
        let relativePath;

        try {
            relativePath = decodeURIComponent(new URL(request.url).pathname);
        } catch {
            return new Response(null, { status: 400 });
        }

        const filePath = resolveInside(RENDERER_ROOT, relativePath);

        if (!filePath) {
            return new Response(null, { status: 403 });
        }

        return net.fetch(pathToFileURL(filePath).toString());
    });

    protocol.handle('asset', (request) => {
        let relativePath;

        try {
            relativePath = decodeURIComponent(new URL(request.url).pathname);
        } catch {
            return new Response(null, { status: 400 });
        }

        const filePath = resolveInside(ASSETS_CACHE, relativePath);

        if (!filePath) {
            return new Response(null, { status: 403 });
        }

        return net.fetch(pathToFileURL(filePath).toString()).catch(() => new Response(null, { status: 404 }));
    });
}

function setupAutoUpdates() {
    if (autoUpdatesStarted || !app.isPackaged || !store.get('automaticUpdates', false)) return;

    autoUpdatesStarted = true;

    autoUpdater.on('error', (err) => {
        console.error('Auto update failed:', err);
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Update check failed:', err);
    });
}

// --- Window Management ---

const ICON_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../build/icon.ico');

const createMainWindow = () => {
    hidingToTray = false;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 750,
        minWidth: 800,
        minHeight: 550,
        show: false,
        icon: ICON_PATH,
        autoHideMenuBar: true,

        webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const appOrigin =
        typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined'
            ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
            : 'app://.';

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);

        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(appOrigin)) event.preventDefault();
    });

    if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadURL('app://./index.html');
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    mainWindow.on('minimize', () => {
        hidingToTray = true;
        mainWindow.close();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

const showWindow = () => {
    if (!mainWindow) {
        createMainWindow();
        return;
    }

    mainWindow.show();
    mainWindow.focus();
};

function createTray() {
    tray = new Tray(ICON_PATH);
    tray.setToolTip('Gacha Manager');
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: 'Open', click: showWindow },
            { label: 'Quit', click: () => app.quit() },
        ]),
    );
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
}

// --- IPC Handlers ---

function handle(channel, handler) {
    ipcMain.handle(channel, async (_event, payload) => {
        try {
            return { success: true, ...(await handler(payload)) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

ipcMain.handle('getGameConfig', () => GAME_CONFIG);

ipcMain.handle('getGameTasks', () => GAME_TASKS);

ipcMain.handle('getGroupedAccounts', () => getGroupedAccounts());

ipcMain.handle('getGamesWithoutAccounts', () => {
    const accounts = getAccounts();

    return Object.keys(GAME_CONFIG).filter((gameName) => !accounts[gameName]?.length);
});

ipcMain.handle('cacheImage', async (_event, filename) => {
    if (typeof filename !== 'string') {
        throw new Error('Invalid filename');
    }

    const localPath = resolveInside(ASSETS_CACHE, filename);

    if (!localPath) {
        throw new Error('Invalid filename');
    }

    try {
        const stats = await fs.stat(localPath);

        if (Date.now() - stats.mtimeMs > CACHE_TOUCH_AFTER_MS) {
            const now = new Date();

            fs.utimes(localPath, now, now).catch(() => {});
        }
    } catch {
        if (!pendingDownloads.has(filename)) {
            const download = downloadAsset(filename, localPath).finally(() => pendingDownloads.delete(filename));

            pendingDownloads.set(filename, download);
        }

        await pendingDownloads.get(filename);
    }

    const relativePath = path.relative(ASSETS_CACHE, localPath).split(path.sep).join('/');

    return `asset://cache/${encodePath(relativePath)}`;
});

handle('insertAccounts', (gameList) => ({
    data: insertAccounts(gameList),
}));

handle('updateAccount', ({ gameName, id, changes }) => ({
    account: updateAccount(gameName, id, changes),
}));

handle('deleteAccount', ({ gameName, id }) => {
    deleteAccount(gameName, id);
});

handle('setTaskCompleted', ({ gameName, taskId, accountId, completed }) => ({
    account: setTaskCompleted(gameName, taskId, accountId, completed),
}));

handle('loadSettings', () => ({
    data: store.store,
}));

handle('saveSettings', (settings) => {
    const monthlySubModeChanged =
        settings.monthlySubCheck !== undefined && settings.monthlySubCheck !== store.get('monthlySubCheck', 'calendar');

    if (monthlySubModeChanged) syncCalendarMonthlySubs();

    store.set(settings);

    if (monthlySubModeChanged) restartMonthlySubCount();

    if (settings.checkGachaProcesses) {
        startMonitoring();
    } else {
        stopMonitoring();
    }

    updateNextNotification();
    setupAutoUpdates();

    return { accountsChanged: monthlySubModeChanged };
});

handle('deleteCacheAssets', async () => {
    await deleteCacheFiles(0);
});

handle('syncCalendarMonthlySubs', () => ({
    changed: syncCalendarMonthlySubs(),
}));

// --- App Entry Point ---

async function startApp() {
    await deleteCacheFiles();

    let gameData;

    try {
        gameData = await loadGameData();
    } catch (err) {
        dialog.showErrorBox('Startup failed', err.message);
        app.quit();
        return;
    }

    GAME_CONFIG = gameData.config;
    GAME_TASKS = gameData.tasks;

    try {
        initializeAccounts({ tasks: GAME_TASKS, config: GAME_CONFIG, settingsStore: store });
    } catch (err) {
        if (!err.userDeclined) {
            dialog.showErrorBox('Startup failed', err.message);
        }

        app.quit();
        return;
    }

    powerMonitor.on('resume', () => {
        syncCalendarMonthlySubs();
        updateNextNotification();
        refreshGameData();
    });

    syncCalendarMonthlySubs();

    setupAutoUpdates();

    registerProtocols();

    createMainWindow();

    createTray();

    if (store.store.checkGachaProcesses) {
        startMonitoring();
    }

    if (gameData.fromCache) refreshGameData();

    setInterval(refreshGameData, GAME_DATA_REFRESH_MS);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', showWindow);

    app.whenReady()
        .then(startApp)
        .catch((err) => {
            dialog.showErrorBox('Startup failed', err.message);
            app.quit();
        });
}

app.on('window-all-closed', () => {
    if (hidingToTray) return;

    stopMonitoring();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});
