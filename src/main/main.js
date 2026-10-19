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
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

let GAME_CONFIG = null;
let GAME_TASKS = null;
let refreshingGameData = null;
let updatesStarted = false;
let updateState = { status: 'idle', version: null, notes: '', percent: 0, failed: false };
let updateDismissed = false;
let updateNotification = null;
let mainWindow;
let monitorInterval = null;
let checkingProcesses = false;
let tray = null;
let hidingToTray = false;
let rejectedGameData = null;

const missingAssets = new Map();
const pendingDownloads = new Map();
const HARDWARE_ACCELERATION = store.get('hardwareAcceleration', false);

if (!HARDWARE_ACCELERATION) app.disableHardwareAcceleration();

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

function validateGameData({ config, tasks }) {
    createResetProcessor(config, tasks);
}

async function fetchGameData() {
    const [config, tasks] = await Promise.all([fetchJson(CONFIG_BASE), fetchJson(TASKS_BASE)]);

    return { config, tasks };
}

async function readCachedGameData() {
    const [config, tasks] = await Promise.all([readJson(CONFIG_CACHE), readJson(TASKS_CACHE)]);
    const data = { config, tasks };

    validateGameData(data);

    return data;
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

            validateGameData(data);
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
        console.error('Game data refresh failed:', err);
        return;
    }

    if (isDeepStrictEqual(data, { config: GAME_CONFIG, tasks: GAME_TASKS })) return;
    if (isDeepStrictEqual(data, rejectedGameData)) return;

    try {
        validateGameData(data);
    } catch (err) {
        rejectedGameData = data;
        console.error('Game data update rejected:', err);

        new Notification({
            title: 'Game data update skipped',
            body: 'The latest game data was invalid, so the last working version is being used.',
        }).show();

        return;
    }

    rejectedGameData = null;

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

                const name = entry.name.toLowerCase();

                if (!name.endsWith('.webp') && !name.endsWith('.tmp')) {
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

function isAutomaticUpdates() {
    return store.get('automaticUpdates', false);
}

function getUpdateState() {
    return { ...updateState, auto: isAutomaticUpdates(), dismissed: updateDismissed };
}

function setUpdateState(changes) {
    updateState = { ...updateState, ...changes };

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-state', getUpdateState());
    }
}

function summarizeReleaseNotes(notes) {
    return typeof notes === 'string' ? notes.trim() : '';
}

function checkForUpdates() {
    if (updateState.status === 'downloading' || updateState.status === 'ready') return;

    autoUpdater.checkForUpdates().catch((err) => {
        console.error('Update check failed:', err);
    });
}

function downloadUpdate() {
    if (updateState.status !== 'available') return;

    setUpdateState({ status: 'downloading', percent: 0, failed: false });

    autoUpdater.downloadUpdate().catch((err) => {
        console.error('Update download failed:', err);
        setUpdateState({ status: 'available', failed: true });
    });
}

function showUpdateReadyNotification(version) {
    updateNotification = new Notification({
        title: 'Update ready',
        body: `Gacha Manager ${version} will be installed the next time you close the app.`,
    });

    updateNotification.on('click', showWindow);
    updateNotification.show();
}

function setupAutoUpdates() {
    autoUpdater.autoDownload = isAutomaticUpdates();

    if (updatesStarted) {
        if (autoUpdater.autoDownload) downloadUpdate();
        setUpdateState({});
        return;
    }

    if (!app.isPackaged) return;

    updatesStarted = true;

    autoUpdater.on('update-available', (info) => {
        if (info.version !== updateState.version) updateDismissed = false;

        setUpdateState({
            status: autoUpdater.autoDownload ? 'downloading' : 'available',
            version: info.version,
            notes: summarizeReleaseNotes(info.releaseNotes),
            percent: 0,
            failed: false,
        });
    });

    autoUpdater.on('download-progress', ({ percent }) => {
        setUpdateState({ status: 'downloading', percent: Math.floor(percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        updateDismissed = false;
        setUpdateState({ status: 'ready', version: info.version, percent: 100 });

        if (!mainWindow) showUpdateReadyNotification(info.version);
    });

    autoUpdater.on('error', (err) => {
        console.error('Auto update failed:', err);

        if (updateState.status === 'downloading') {
            setUpdateState({ status: 'available', failed: true });
        }
    });

    checkForUpdates();
    setInterval(checkForUpdates, UPDATE_CHECK_MS);
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

        ...(process.platform !== 'darwin' && {
            titleBarStyle: 'hidden',
            titleBarOverlay: { color: '#09090a', symbolColor: '#b0b0b8', height: 32 },
        }),

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

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

const showWindow = () => {
    if (!mainWindow) {
        createMainWindow();
        return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
};

const hideToTray = () => {
    if (!mainWindow) return;

    hidingToTray = true;
    mainWindow.close();
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

ipcMain.on('hideToTray', hideToTray);

ipcMain.handle('relaunchApp', () => {
    app.relaunch();
    app.quit();
});

function handle(channel, handler) {
    ipcMain.handle(channel, async (_event, payload) => {
        try {
            return { success: true, ...(await handler(payload)) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

ipcMain.on('setTitleBarColors', (_event, { color, symbolColor } = {}) => {
    if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return;

    const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
    if (!isColor(color) || !isColor(symbolColor)) return;

    mainWindow.setTitleBarOverlay({ color, symbolColor });
});

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

        try {
            await fs.access(localPath);
        } catch {
            return null;
        }
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

    return {
        accountsChanged: monthlySubModeChanged,
        restartRequired: store.get('hardwareAcceleration', false) !== HARDWARE_ACCELERATION,
    };
});

handle('deleteCacheAssets', async () => {
    await deleteCacheFiles(0);
});

handle('syncCalendarMonthlySubs', () => ({
    changed: syncCalendarMonthlySubs(),
}));

ipcMain.handle('getUpdateState', () => getUpdateState());

ipcMain.handle('downloadUpdate', () => downloadUpdate());

ipcMain.handle('installUpdate', () => {
    if (updateState.status !== 'ready') return;

    setImmediate(() => autoUpdater.quitAndInstall(true, true));
});

ipcMain.handle('dismissUpdate', () => {
    updateDismissed = true;
    setUpdateState({});
});

// --- App Entry Point ---

async function startApp() {
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
        initializeAccounts({
            tasks: GAME_TASKS,
            config: GAME_CONFIG,
            settingsStore: store,
            onNotificationClick: showWindow,
        });
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

    deleteCacheFiles();

    if (store.get('checkGachaProcesses', false)) {
        startMonitoring();
    }

    if (gameData.fromCache) refreshGameData();
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
