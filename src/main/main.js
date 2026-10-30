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

import { createAccountService } from '../shared/accounts/accountService.js';
import { backupFileName } from '../shared/accounts/accountsFile.js';
import { createDeadlineNotifier } from '../shared/deadlineNotifier.js';
import { createGameDataLoader } from '../shared/gameDataLoader.js';
import { DEFAULT_SETTINGS, migrateSettings } from '../shared/settings.js';
import {
    GAME_DATA_REFRESH_MS,
    MISSING_ASSET_RETRY_MS,
    NETWORK_RETRY_MS,
    RELEASES_URL,
    STATUS_URL,
    assetUrl,
    encodePath,
    fetchJson,
    fetchWithTimeout,
} from '../shared/remote.js';
import { createAccountsFileStorage } from './accountsStorage.js';
import { isOlderVersion } from './appVersion.js';
import { resolveInside } from './safePath.js';

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import Store from 'electron-store';
import log from 'electron-log/main';

Object.assign(console, log.functions);
log.errorHandler.startCatching();

const { autoUpdater } = require('electron-updater');

const store = new Store();

const PRELOAD_PATH = path.join(__dirname, 'preload.js');

const ASSETS_CACHE = path.join(app.getPath('userData'), 'assets');

const CONFIG_CACHE = path.join(app.getPath('userData'), 'game-config.json');

const TASKS_CACHE = path.join(app.getPath('userData'), 'game-tasks.json');

const INDEPENDENT_EVENTS_CACHE = path.join(app.getPath('userData'), 'independent-events.json');

const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');

const RENDERER_ROOT = path.join(__dirname, '../renderer/main_window');

const CACHE_TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;
const SNOOZE_OPTIONS = [
    [15, '15 minutes'],
    [30, '30 minutes'],
    [60, '1 hour'],
    [120, '2 hours'],
    [240, '4 hours'],
];

const STARTUP_ARG = '--startup';
const LAUNCHED_AT_STARTUP = process.argv.includes(STARTUP_ARG);

const migratedSettings = migrateSettings(store.store);
if (migratedSettings !== store.store) store.store = migratedSettings;

let accounts = null;
let notifier = null;
let updatesStarted = false;
let updateState = { status: 'idle', version: null, notes: '', percent: 0, failed: false };
let updateDismissed = false;
let updateNotification = null;
let deadlineNotification = null;
let mainWindow;
let monitorInterval = null;
let checkingProcesses = false;
let tray = null;
let hidingToTray = false;
let appUpdateRequired = false;
let appStarted = false;

const missingAssets = new Map();
const pendingDownloads = new Map();
const HARDWARE_ACCELERATION = store.get('hardwareAcceleration', DEFAULT_SETTINGS.hardwareAcceleration);

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

function sendToWindow(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

async function checkAppStatus() {
    try {
        const status = await fetchJson(STATUS_URL);

        appUpdateRequired =
            typeof status.min_app_version === 'string' && isOlderVersion(app.getVersion(), status.min_app_version);
        setUpdateState({});
    } catch (err) {
        console.error('Status check failed:', err);
    }
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

const gameData = createGameDataLoader({
    readCache: async () => {
        const [config, tasks, independentEvents] = await Promise.all([
            readJson(CONFIG_CACHE),
            readJson(TASKS_CACHE),
            readJson(INDEPENDENT_EVENTS_CACHE).catch(() => []),
        ]);

        return { config, tasks, independentEvents };
    },
    writeCache: ({ config, tasks, independentEvents }) =>
        Promise.all([
            writeJson(CONFIG_CACHE, config),
            writeJson(TASKS_CACHE, tasks),
            writeJson(INDEPENDENT_EVENTS_CACHE, independentEvents ?? []),
        ]),
    onUpdate: (data) => {
        accounts.setGameData(data);
        sendToWindow('game-data-updated');
    },
    onRejected: () => {
        new Notification({
            title: 'Game data update skipped',
            body: 'The latest game data was invalid, so the last working version is being used.',
        }).show();
    },
});

function handleGameDetected(gameName) {
    try {
        if (accounts.completeAutomaticDailies(gameName)) sendToWindow('dailies-completed');
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

    const gamesToCheck = Object.entries(gameData.current.config).filter(
        ([gameName]) => accounts.getAccountIds('automaticDailies', gameName).length > 0,
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

function syncMonitoring() {
    if (store.get('checkGachaProcesses', DEFAULT_SETTINGS.checkGachaProcesses)) {
        startMonitoring();
    } else {
        stopMonitoring();
    }
}

function isLaunchAtStartup() {
    if (!app.isPackaged) return store.get('launchAtStartup', DEFAULT_SETTINGS.launchAtStartup);

    const settings = app.getLoginItemSettings({ args: [STARTUP_ARG] });

    return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
}

function setLaunchAtStartup(enabled) {
    if (!app.isPackaged || typeof enabled !== 'boolean' || enabled === isLaunchAtStartup()) return;

    app.setLoginItemSettings({ openAtLogin: enabled, args: [STARTUP_ARG] });
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

async function downloadAsset(filename, localPath) {
    const retryAt = missingAssets.get(filename);

    if (retryAt && Date.now() < retryAt) return;

    try {
        const response = await fetchWithTimeout(assetUrl(filename), 10000);

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

async function getImageUrl(filename) {
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

async function exportAccountsToFile() {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(app.getPath('documents'), backupFileName()),
        filters: [{ name: 'Accounts backup', extensions: ['json'] }],
    });

    if (canceled || !filePath) return false;

    await fs.writeFile(filePath, accounts.exportAccounts(), 'utf-8');

    return true;
}

async function importAccountsFromFile() {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Accounts backup', extensions: ['json'] }],
    });

    if (canceled || filePaths.length === 0) return false;

    accounts.importAccounts(await fs.readFile(filePaths[0], 'utf-8'));

    return true;
}

function isAutomaticUpdates() {
    return store.get('automaticUpdates', DEFAULT_SETTINGS.automaticUpdates);
}

function getUpdateState() {
    return {
        ...updateState,
        auto: isAutomaticUpdates(),
        dismissed: updateDismissed,
        required: appUpdateRequired,
    };
}

function setUpdateState(changes) {
    updateState = { ...updateState, ...changes };

    sendToWindow('update-state', getUpdateState());
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

const escapeXml = (text) =>
    text.replace(
        /[<>&'"]/g,
        (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
    );

function deadlineToastXml({ title, body, deadline }) {
    const minutesLeft = (deadline - Date.now()) / 60_000;
    const options = SNOOZE_OPTIONS.filter(([minutes]) => minutes < minutesLeft);

    const actions = options.length
        ? `<actions>
            <input id="snoozeTime" type="selection" title="Remind me in" defaultInput="${options.at(-1)[0] >= 60 ? 60 : options.at(-1)[0]}">
                ${options.map(([minutes, label]) => `<selection id="${minutes}" content="${label}"/>`).join('')}
            </input>
            <action activationType="system" arguments="snooze" hint-inputId="snoozeTime" content=""/>
            <action activationType="system" arguments="dismiss" content=""/>
        </actions>`
        : '';

    return `<toast launch="open">
        <visual><binding template="ToastGeneric">
            <text>${escapeXml(title)}</text>
            ${body
                .split('\n')
                .map((line) => `<text>${escapeXml(line)}</text>`)
                .join('')}
        </binding></visual>
        ${actions}
    </toast>`;
}

function showDeadlineNotification(payload) {
    deadlineNotification = new Notification({ toastXml: deadlineToastXml(payload) });
    deadlineNotification.on('click', showWindow);
    deadlineNotification.show();
}

// --- Window Management ---

const ICON_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../build/icon.ico');

const createMainWindow = ({ minimized = false } = {}) => {
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
        if (minimized) {
            mainWindow.once('restore', () => mainWindow.maximize());
            mainWindow.minimize();
            return;
        }

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

function handle(channel, handler) {
    ipcMain.handle(channel, async (_event, payload) => {
        try {
            return { success: true, data: await handler(payload) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

ipcMain.on('hideToTray', hideToTray);

ipcMain.on('setTitleBarColors', (_event, { color, symbolColor } = {}) => {
    if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return;

    const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
    if (!isColor(color) || !isColor(symbolColor)) return;

    mainWindow.setTitleBarOverlay({ color, symbolColor });
});

handle('getGameData', () => gameData.current);

handle('getImageUrl', getImageUrl);

handle('clearImageCache', () => deleteCacheFiles(0));

handle('getGroupedAccounts', () => accounts.getGroupedAccounts());

handle('insertAccounts', (gameList) => accounts.insertAccounts(gameList));

handle('updateAccount', ({ gameName, id, changes }) => accounts.updateAccount(gameName, id, changes));

handle('deleteAccount', ({ gameName, id }) => accounts.deleteAccount(gameName, id));

handle('setTaskCompleted', ({ gameName, taskId, accountId, completed }) =>
    accounts.setTaskCompleted(gameName, taskId, accountId, completed),
);

handle('syncCalendarMonthlySubs', () => accounts.syncCalendarMonthlySubs());

handle('exportAccounts', exportAccountsToFile);

handle('importAccounts', importAccountsFromFile);

handle('loadSettings', () => ({ ...store.store, launchAtStartup: isLaunchAtStartup() }));

handle('saveSettings', (settings) => {
    const result = accounts.saveSettings(settings);

    syncMonitoring();
    setupAutoUpdates();
    setLaunchAtStartup(settings?.launchAtStartup);

    return {
        ...result,
        restartRequired:
            store.get('hardwareAcceleration', DEFAULT_SETTINGS.hardwareAcceleration) !== HARDWARE_ACCELERATION,
    };
});

handle('getUpdateState', getUpdateState);

handle('downloadUpdate', downloadUpdate);

handle('installUpdate', () => {
    if (updateState.status !== 'ready') return;

    setImmediate(() => autoUpdater.quitAndInstall(true, true));
});

handle('dismissUpdate', () => {
    updateDismissed = true;
    setUpdateState({});
});

handle('openReleasesPage', () => shell.openExternal(RELEASES_URL));

handle('relaunchApp', () => {
    app.relaunch();
    app.quit();
});

// --- App Entry Point ---

async function startApp() {
    let initialData;

    try {
        initialData = await gameData.load();
    } catch (err) {
        dialog.showErrorBox('Startup failed', err.message);
        app.quit();
        return;
    }

    try {
        accounts = createAccountService({
            storage: createAccountsFileStorage(ACCOUNTS_FILE),
            settings: store,
        });
    } catch (err) {
        if (!err.userDeclined) {
            dialog.showErrorBox('Startup failed', err.message);
        }

        app.quit();
        return;
    }

    notifier = createDeadlineNotifier({
        computeGroups: (now) => accounts.computeGroups(now),
        enabledAccountIds: (key, gameName) => accounts.getAccountIds(key, gameName),
        notify: showDeadlineNotification,
    });

    accounts.onChange(notifier.refresh);
    accounts.setGameData(gameData.current);

    powerMonitor.on('resume', () => {
        accounts.syncCalendarMonthlySubs();
        notifier.refresh();
        gameData.refresh();
        checkAppStatus();
    });

    accounts.syncCalendarMonthlySubs();

    setupAutoUpdates();

    registerProtocols();

    createMainWindow({ minimized: LAUNCHED_AT_STARTUP });

    appStarted = true;

    createTray();

    deleteCacheFiles();

    syncMonitoring();

    checkAppStatus();

    if (initialData.fromCache) gameData.refresh();

    setInterval(() => {
        gameData.refresh();
        checkAppStatus();
    }, GAME_DATA_REFRESH_MS);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (appStarted) showWindow();
    });

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
