import { app, BrowserWindow, ipcMain, protocol, net, Notification } from 'electron';

import { initializeAccounts, getAccounts, insertAccounts, updateAccount, deleteAccount, updateTaskLog } from './accountHelper.js';

import path from 'node:path';
import { promises as fs } from 'node:fs';
import Store from 'electron-store';
import { exec } from 'node:child_process';

const { autoUpdater } = require('electron-updater');

const store = new Store();

const PRELOAD_PATH = path.join(__dirname, 'preload.js');

const CONFIG_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main/game-config.json';

const CONFIG_CACHE = path.join(app.getPath('userData'), 'game-config.json');

const TASKS_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main/game-tasks.json';

const TASKS_CACHE = path.join(app.getPath('userData'), 'game-tasks.json');

const ASSETS_BASE = 'https://raw.githubusercontent.com/rsparkle/gacha-manager-assets/refs/heads/main';

const ASSETS_CACHE = path.join(app.getPath('userData'), 'assets');

let GAME_CONFIG = null;
let GAME_TASKS = null;
let mainWindow;
let monitorInterval = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true
    }
  },
  {
    scheme: 'asset',
    privileges: {
      secure: true,
      standard: true
    }
  }
]);

async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadGameFile(base, cache) {
  try {
    const response = await fetchWithTimeout(base);

    if (response.ok) {
      const data = await response.json();

      await fs.writeFile(
        cache,
        JSON.stringify(data, null, 2)
      );

      return data;
    }
  } catch (networkError) {
    // Fall back to the cached configuration
  }

  try {
    const cached = await fs.readFile(
      cache,
      'utf-8'
    );

    return JSON.parse(cached);
  } catch (cacheError) {
    // Report the combined failure below
  }

  throw new Error(
    'Critical: Failed to load game configuration from all sources.'
  );
}

function startMonitoring() {
  if (monitorInterval) return;

  function checkProcesses() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    exec('tasklist', (error, stdout) => {
      if (error || !mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      for (const [gameName, gameConfig] of Object.entries(GAME_CONFIG)) {
        if (stdout.includes(gameConfig.process)) {
          mainWindow.webContents.send(
            'game-detected',
            gameName
          );
        }
      }
    });
  }

  checkProcesses();

  monitorInterval = setInterval(
    checkProcesses,
    30000
  );
}

function stopMonitoring() {
  clearInterval(monitorInterval);
  monitorInterval = null;
}

function getTasksForUI(gameName, account) {
  return GAME_TASKS[gameName].tasks.reduce(
    (groupedTasks, task) => {
      const formattedTask = {
        ...task,
        last_completed:
          account.tasks?.[task.id] ?? null
      };

      (groupedTasks[task.type] ??= []).push(
        formattedTask
      );

      return groupedTasks;
    },
    {}
  );
}

function getGroupedAccounts() {
  const accounts = getAccounts();

  return Object.entries(GAME_CONFIG).map(
    ([gameName, gameConfig]) => ({
      name: gameName,
      game_version: gameConfig.current.version,

      accounts: (accounts[gameName] ?? []).map(
        account => ({
          ...account,
          tasks: getTasksForUI(gameName, account)
        })
      )
    })
  );
}

async function deleteCacheFiles(months = 4) {
  const cutoffDate = new Date();

  cutoffDate.setMonth(
    cutoffDate.getMonth() - months
  );

  async function cleanDirectory(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, {
        withFileTypes: true
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      const filePath = path.join(
        directory,
        entry.name
      );

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

// --- Window Management ---

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 800,
    minHeight: 550,
    show: false,

    webPreferences: {
      preload: PRELOAD_PATH
    }
  });

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined') {
    mainWindow.loadURL(
      MAIN_WINDOW_VITE_DEV_SERVER_URL
    );
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
};

// --- IPC Handlers ---

ipcMain.handle('getGameConfig', () => GAME_CONFIG);

ipcMain.handle('getGameTasks', () => GAME_TASKS);

ipcMain.handle('cacheImage', async (_event, filename) => {
  const resolved = path.resolve(
    ASSETS_CACHE,
    filename
  );

  if (
    !resolved.startsWith(
      path.resolve(ASSETS_CACHE) + path.sep
    )
  ) {
    throw new Error('Invalid filename');
  }

  const localPath = resolved;

  try {
    await fs.access(localPath);
  } catch {
    await fs.mkdir(path.dirname(localPath), {
      recursive: true
    });

    const response = await fetch(
      `${ASSETS_BASE}/${filename}`
    );

    if (response.ok) {
      await fs.writeFile(
        localPath,
        Buffer.from(
          await response.arrayBuffer()
        )
      );
    }
  }

  return `asset://${localPath.replace(
    /\\/g,
    '/'
  )}`;
}
);

ipcMain.handle('getGamesWithoutAccounts', () => {
  const accounts = getAccounts();

  return Object.keys(GAME_CONFIG).filter(
    gameName =>
      !accounts[gameName]?.length
  );
}
);

ipcMain.handle('getGroupedAccounts', () => getGroupedAccounts());

ipcMain.handle('insertAccounts', (_event, gameList) => {
  try {
    const createdAccounts =
      insertAccounts(gameList);

    return {
      success: true,
      data: createdAccounts
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('updateAccount', (_event, accountData) => {
  try {
    updateAccount(
      accountData.gameName,
      accountData.id,
      {
        server: accountData.server,
        uid: accountData.uid,
        label: accountData.label
      }
    );

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('deleteAccount', (_event, accountData) => {
  try {
    deleteAccount(
      accountData.gameName,
      accountData.id
    );

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('updateTaskLog', (_event, taskLogData) => {
  try {
    updateTaskLog(
      taskLogData.gameName,
      taskLogData.taskId,
      taskLogData.accountId,
      taskLogData.completed
    );

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('loadSettings', () => {
  try {
    return {
      success: true,
      data: store.store
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('saveSettings', (_event, settings) => {
  try {
    store.set(settings);

    settings.checkGachaProcesses
      ? startMonitoring()
      : stopMonitoring();

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('sendNotification', (_event, { title, body }) => {
  try {
    const notification = new Notification({
      title,
      body,
      silent: false
    });

    notification.show();

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

ipcMain.handle('deleteCacheAssets', async () => {
  try {
    await deleteCacheFiles(0);

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
);

// --- App Entry Point ---

app.whenReady().then(async () => {
  await deleteCacheFiles();

  initializeAccounts();

  GAME_CONFIG = await loadGameFile(CONFIG_BASE, CONFIG_CACHE);
  GAME_TASKS = await loadGameFile(TASKS_BASE, TASKS_CACHE);

  if (app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'rsparkle',
      repo: 'gacha-manager'
    });

    autoUpdater.checkForUpdatesAndNotify();
  }

  protocol.handle('app', request => {
    const url = request.url.replace(
      'app://',
      ''
    );

    const filePath = path
      .join(
        __dirname,
        '../renderer/main_window',
        url
      )
      .replace(/\\/g, '/');

    return net.fetch(`file://${filePath}`);
  });

  protocol.handle('asset', request => {
    const url = request.url.replace(
      'asset://',
      ''
    );

    const filePath = url.replace(
      /^([a-z])\//,
      '$1:/'
    );

    return net.fetch(`file:///${filePath}`);
  });

  app.setAppUserModelId(
    'com.rsparkle.gacha-manager'
  );

  createMainWindow();

  if (store.store.checkGachaProcesses) {
    mainWindow.webContents.once(
      'did-finish-load',
      () => {
        startMonitoring();
      }
    );
  }
});

app.on('window-all-closed', () => {
  stopMonitoring();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});