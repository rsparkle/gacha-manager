import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, dialog } from 'electron';

let accounts = {};
let accountPath;
let gameTasks;
let gameConfig;

export function initializeAccounts({ tasks, config }) {
  gameTasks = tasks;
  gameConfig = config;

  accountPath = path.join(app.getPath('userData'), 'accounts.json');

  accounts = loadStoredAccounts();
}

function loadStoredAccounts() {
  if (!fs.existsSync(accountPath)) {
    fs.writeFileSync(accountPath, '{}', 'utf-8');
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid accounts.json structure');
    }

    return parsed;
  } catch (err) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Accounts file is corrupted',
      message: 'Your accounts file could not be read.',
      detail: `${err.message}\n\nStart fresh? The damaged file will be saved as a backup first, so nothing is deleted.`,
      buttons: ['Start fresh', 'Quit'],
      defaultId: 1,
      cancelId: 1
    });

    if (choice !== 0) throw err;

    const backup = accountPath.replace('.json', `.corrupt-${Date.now()}.json`);
    fs.copyFileSync(accountPath, backup);
    fs.writeFileSync(accountPath, '{}', 'utf-8');

    return {};
  }
}

function saveAccounts(nextAccounts) {
  fs.writeFileSync(
    accountPath,
    JSON.stringify(nextAccounts, null, 2),
    'utf-8'
  );

  accounts = nextAccounts;
}

export function getAccounts() {
  return structuredClone(accounts);
}

export function insertAccounts(gameList) {
  const nextAccounts = { ...accounts };
  const createdAccounts = [];

  gameList.forEach(game => {
    const account = {
      id: randomUUID(),
      uid: 0,
      server: game.server,
      label: game.label ?? '',
      tasks: {}
    };

    nextAccounts[game.name] = [
      ...(nextAccounts[game.name] ?? []),
      account
    ];

    createdAccounts.push(account);
  });

  saveAccounts(nextAccounts);

  return createdAccounts;
}

export function updateAccount(gameName, accountId, changes) {
  const gameAccounts = accounts[gameName] ?? [];

  if (!gameAccounts.some(account => account.id === accountId)) {
    throw new Error('Account not found');
  }

  if (changes.monthlySubRemaining !== undefined) {
    changes.lastMonthlySubEditedDay = new Date().toISOString()
  }

  const nextAccounts = {
    ...accounts,
    [gameName]: gameAccounts.map(account =>
      account.id === accountId
        ? {
          ...account,
          ...changes,
          id: account.id
        }
        : account
    )
  };

  saveAccounts(nextAccounts);
}

export function deleteAccount(gameName, accountId) {
  const gameAccounts = accounts[gameName] ?? [];

  const deletedAccount = gameAccounts.find(
    account => account.id === accountId
  );

  if (!deletedAccount) {
    throw new Error('Account not found');
  }

  const nextAccounts = {
    ...accounts,
    [gameName]: gameAccounts.filter(
      account => account.id !== accountId
    )
  };

  saveAccounts(nextAccounts);

  return deletedAccount;
}

export function updateTaskLog(gameName, taskId, accountId, toDelete, monthlySubCheck) {
  const account = accounts[gameName]?.find(
    account => account.id === accountId
  );

  if (!account) {
    throw new Error('Account not found');
  }

  if (!toDelete) {
    const now = new Date();
    account.tasks[taskId] = now.toISOString();

    // Decrease monthly subscription once per server reset day when a daily task is completed
    const task = gameTasks[gameName]?.tasks.find(task => task.id === taskId);
    const isDailyTask = task?.type === 'Daily';

    const resetHour = gameConfig[gameName]?.servers[account.server]?.daily_reset;
    if (resetHour === undefined) {
      throw new Error('Daily reset not found for account server');
    }

    const lastReset = new Date(now);
    lastReset.setUTCHours(resetHour, 0, 0, 0);
    if (lastReset > now) {
      lastReset.setUTCDate(lastReset.getUTCDate() - 1);
    }

    const lastCountedAt = Date.parse(account.lastMonthlySubEditedDay ?? '');

    if (
      monthlySubCheck === 'dailyTask' &&
      isDailyTask &&
      Number(account.monthlySubRemaining ?? 0) > 0 &&
      (!Number.isFinite(lastCountedAt) || lastCountedAt < lastReset.getTime())
    ) {
      account.monthlySubRemaining--;
      account.lastMonthlySubEditedDay = now.toISOString();
    }
  } else {
    if (!Object.hasOwn(account.tasks, taskId)) {
      return false;
    }

    delete account.tasks[taskId];
  }

  saveAccounts(accounts);

  return { monthlySubRemaining: account.monthlySubRemaining ?? null };
}

export function getTasksForAccount(gameName, accountId) {
  const account = accounts[gameName]?.find(
    account => account.id === accountId
  );

  if (!account) {
    throw new Error('Account not found');
  }

  return structuredClone(account.tasks);
}

export function syncCalendarMonthlySubs(monthlySubCheck) {
  if (monthlySubCheck !== 'calendar') return;

  const now = new Date();
  const nowMs = now.getTime();
  const dayMs = 86_400_000;
  let changed = false;

  for (const [gameName, gameAccounts] of Object.entries(accounts)) {
    for (const account of gameAccounts) {
      if (account.monthlySubRemaining == null) continue;

      const resetHour =
        gameConfig[gameName]?.servers[account.server]?.daily_reset;

      if (!Number.isInteger(resetHour) || resetHour < 0 || resetHour > 23) {
        console.warn(`Invalid daily reset for ${gameName}/${account.server}`);
        continue;
      }

      const lastMs = Date.parse(account.lastMonthlySubEditedDay ?? '');

      if (!Number.isFinite(lastMs)) {
        account.lastMonthlySubEditedDay = now.toISOString();
        changed = true;
        continue;
      }

      const resetOffset = resetHour * 3_600_000;
      const currentGameDay = Math.floor((nowMs - resetOffset) / dayMs);
      const lastGameDay = Math.floor((lastMs - resetOffset) / dayMs);
      const elapsedDays = currentGameDay - lastGameDay;

      if (elapsedDays <= 0) continue;

      account.monthlySubRemaining = Math.max(
        0,
        account.monthlySubRemaining - elapsedDays
      );
      account.lastMonthlySubEditedDay = now.toISOString();
      changed = true;
    }
  }

  if (changed) saveAccounts(accounts);

  return changed;
}