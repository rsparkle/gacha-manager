import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

let accounts = {};
let accountPath;
let gameTasks;
let gameConfig;

export function initializeAccounts({ tasks, config }) {
  gameTasks = tasks;
  gameConfig = config;

  accountPath = path.join(app.getPath('userData'), 'accounts.json');

  if (!fs.existsSync(accountPath)) {
    fs.writeFileSync(accountPath, '{}', 'utf-8');
  }

  const storedAccounts = JSON.parse(
    fs.readFileSync(accountPath, 'utf-8')
  );

  if (
    storedAccounts === null ||
    typeof storedAccounts !== 'object' ||
    Array.isArray(storedAccounts)
  ) {
    throw new Error('Invalid accounts.json structure');
  }

  accounts = storedAccounts;
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
        throw new Error(`Invalid daily reset for ${gameName}/${account.server}`);
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
}