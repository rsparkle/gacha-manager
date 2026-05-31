import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import { initDB, runMigrations, seedDatabase, syncGameConfig } from './db/db.js';
import { fetchTasksForAccount, fetchAccounts, fetchGamesWithoutAccounts, insertAccounts, updateAccount, deleteAccount, insertTaskLog, deleteLastTaskLog } from './helper.js';
import path from 'node:path';
import { promises as fs } from 'fs';
import Store from 'electron-store';
import { Notification } from 'electron';
import { exec } from 'child_process';

const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const store = new Store()
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const CONFIG_BASE = 'https://raw.githubusercontent.com/ricardomagid/gacha-manager-assets/refs/heads/main/game-config.json';
const CONFIG_CACHE = path.join(app.getPath('userData'), 'game-config.json');
const ASSETS_BASE = 'https://raw.githubusercontent.com/ricardomagid/gacha-manager-assets/refs/heads/main';
const ASSETS_CACHE = path.join(app.getPath('userData'), 'assets');

let GAME_CONFIG = null;

let mainWindow;

let monitorInterval = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
  { scheme: 'asset', privileges: { secure: true, standard: true } }
]);

async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadGameConfig() {
  try {
    const res = await fetchWithTimeout(CONFIG_BASE);
    if (res.ok) {
      const data = await res.json();
      await fs.writeFile(CONFIG_CACHE, JSON.stringify(data, null, 2));
      return data;
    }
  } catch (networkError) {
  }

  try {
    const cached = await fs.readFile(CONFIG_CACHE, 'utf-8');
    return JSON.parse(cached);
  } catch (cacheError) {
  }

  try {
    const localModule = await import('../game-config.json', { with: { type: 'json' } });
    return localModule.default;
  } catch {
    throw new Error("Critical: Failed to load game configuration from all sources.");
  }
}

function startMonitoring() {
  if (monitorInterval) return;

  function checkProcesses() {
    exec('tasklist', (err, stdout) => {
      if (err) return

      for (const [game, config] of Object.entries(GAME_CONFIG)) {
        if (stdout.includes(config.process)) {
          mainWindow.webContents.send('game-detected', game)
        }
      }
    })
  }
  checkProcesses()

  monitorInterval = setInterval(checkProcesses, 30000)
}

function stopMonitoring() {
  clearInterval(monitorInterval);
  monitorInterval = null;
}

// Groups tasks by type for a given account
function getTasksForUI(account_id) {
  let accountTasks = fetchTasksForAccount(account_id);

  return accountTasks.reduce((tasks, task) => {
    (tasks[task.type] ??= []).push(task);
    return tasks;
  }, {});
}

// Returns all accounts grouped by game with their tasks attached
function getGroupedAccounts() {
  const accounts = fetchAccounts();

  const grouped = Object.values(
    accounts.reduce((acc, account) => {
      if (!acc[account.game]) {
        acc[account.game] = {
          name: account.game,
          id: account.game_id,
          game_version: account.current_version,
          accounts: []
        };
      }

      acc[account.game].accounts.push({
        id: account.id,
        uid: account.game_uid,
        server: account.server,
        label: account.label,
        tasks: getTasksForUI(account.id)
      });

      return acc;
    }, {})
  );

  return grouped;
}

// --- Window Management ---

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    webPreferences: {
      preload: PRELOAD_PATH,
    },
  });

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadURL('app://./index.html');
  }
};

// --- IPC Handlers ---

ipcMain.handle('get-game-config', () => GAME_CONFIG)

ipcMain.handle('cache-image', async (_, filename) => {
  const localPath = path.join(ASSETS_CACHE, filename);
  console.log('cache-image localPath:', localPath);

  try {
    await fs.access(localPath);
  } catch {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const res = await fetch(`${ASSETS_BASE}/${filename}`);
    if (res.ok) await fs.writeFile(localPath, Buffer.from(await res.arrayBuffer()));
  }

  return `asset://${localPath.replace(/\\/g, '/')}`;
});

ipcMain.handle("getGamesWithoutAccounts", () => {
  return fetchGamesWithoutAccounts();
})

ipcMain.handle('getGroupedAccounts', () => {
  return getGroupedAccounts();
});

ipcMain.handle('insertAccounts', (event, gameList) => {
  try {
    insertAccounts(gameList);
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
});

ipcMain.handle("updateAccount", (event, accountData) => {
  try {
    updateAccount(accountData.id, accountData.server, accountData.uid, accountData.label);
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("deleteAccount", (event, accId) => {
  try {
    deleteAccount(accId);
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("insertTaskLog", (event, taskLogData) => {
  try {
    insertTaskLog(taskLogData.task_id, taskLogData.account_id);
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("deleteLastTaskLog", (event, taskLogData) => {
  try {
    deleteLastTaskLog(taskLogData.task_id, taskLogData.account_id);
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("loadSettings", () => {
  try {
    return { success: true, data: store.store }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle("saveSettings", (event, settings) => {
  try {
    store.set(settings)
    settings.checkGachaProcesses ? startMonitoring() : stopMonitoring()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('sendNotification', (event, { title, body }) => {
  try {
    const notification = new Notification({
      title: title,
      body: body,
      silent: false
    })

    notification.show()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// --- App Entry Point ---

app.whenReady().then(async () => {
  GAME_CONFIG = await loadGameConfig();
  if (app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ricardomagid',
      repo: 'gacha-manager',
    });
    autoUpdater.checkForUpdatesAndNotify();
  }

  protocol.handle('app', (request) => {
    const url = request.url.replace('app://', '');
    return net.fetch('file://' + path.join(__dirname, '../renderer/main_window', url).replace(/\\/g, '/'));
  });

  protocol.handle('asset', (request) => {
    const url = request.url.replace('asset://', '');
    const filePath = url.replace(/^([a-z])\//, '$1:/');
    console.log('asset handler fetching:', 'file:///' + filePath);
    return net.fetch('file:///' + filePath);
  });

  app.setAppUserModelId('com.ricardomagid.gacha-manager');

  initDB();
  runMigrations();
  seedDatabase(GAME_CONFIG);
  syncGameConfig(GAME_CONFIG);

  createMainWindow()

  if (store.store.checkGachaProcesses) {
    mainWindow.webContents.once('did-finish-load', () => {
      startMonitoring()
    })
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
