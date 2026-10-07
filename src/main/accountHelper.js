import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, dialog, Notification } from 'electron';
import { createResetProcessor } from '../shared/resetProcessor';

let accounts = {};
let accountPath;
let gameTasks;
let gameConfig;
let computeTaskResetData;
let store;
let notificationTimeout;
const notifiedKeys = new Set();
const TIMER_BUFFER_MS = 1000;
const URGENT_PROGRESS = 80;

const taskProgress = (task) =>
  Math.max(0, Math.floor(((task.duration - task.nextReset) / task.duration) * 100));

const isUrgent = (task) => taskProgress(task) > URGENT_PROGRESS;

function getMonthlySubCheck() {
  return store.get('monthlySubCheck', 'calendar');
}

export function initializeAccounts({ tasks, config, settingsStore }) {
  gameTasks = tasks;
  gameConfig = config;
  store = settingsStore;
  ({ computeTaskResetData } = createResetProcessor(gameConfig, gameTasks));

  accountPath = path.join(app.getPath('userData'), 'accounts.json');

  accounts = loadStoredAccounts();

  updateNextNotification();
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

  updateNextNotification();
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

export function updateTaskLog(gameName, taskId, accountId, toDelete) {
  const monthlySubCheck = getMonthlySubCheck();

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

export function syncCalendarMonthlySubs() {
  if (getMonthlySubCheck() !== 'calendar') return;

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

function getTasksForUI(gameName, account) {
  return gameTasks[gameName].tasks.reduce((groupedTasks, task) => {
    const formattedTask = {
      ...task,
      last_completed: account.tasks?.[task.id] ?? null
    };

    (groupedTasks[task.type] ??= []).push(formattedTask);

    return groupedTasks;
  }, {});
}

export function getGroupedAccounts() {
  const stored = getAccounts();

  return Object.entries(gameConfig).map(([gameName, config]) => ({
    name: gameName,
    game_version: config.current.version,
    accounts: (stored[gameName] ?? []).map(account => ({
      ...account,
      tasks: getTasksForUI(gameName, account)
    }))
  }));
}

function showDeadlineNotification(entries) {
  const games = [...new Set(entries.map(entry => entry.game))].join(', ');
  const body = entries.length === 1
    ? `There is 1 task approaching its deadline in ${games}`
    : `There are ${entries.length} tasks approaching their deadlines in ${games}`;

  new Notification({
    title: 'Some tasks are approaching their deadline!',
    body
  }).show();
}

export function updateNextNotification() {
  clearTimeout(notificationTimeout);
  notificationTimeout = undefined;

  if (!computeTaskResetData) return;

  const now = new Date();
  const nowMs = now.getTime();
  const enabled = store.get('windowsNotifications') ?? {};

  let groups;
  try {
    groups = computeTaskResetData(getGroupedAccounts(), now);
  } catch (err) {
    console.error('Notification scheduling failed:', err);
    return;
  }

  const urgent = [];
  let nextWake = Infinity;

  for (const group of groups) {
    const enabledIds = enabled[group.name] ?? [];

    for (const account of group.accounts) {
      if (!enabledIds.includes(account.id)) continue;

      for (const task of Object.values(account.tasks).flat()) {
        if (task.isDisabled || !task.duration) continue;

        const end = nowMs + task.nextReset;
        const urgentAt = end - task.duration + (task.duration * (URGENT_PROGRESS + 1)) / 100;

        if (!task.isCompleted && isUrgent(task)) {
          urgent.push({ key: `${group.name}:${account.id}:${task.id}:${end}`, game: group.name });
          nextWake = Math.min(nextWake, end);
        } else {
          nextWake = Math.min(nextWake, task.isCompleted ? end : urgentAt);
        }
      }
    }
  }

  const urgentKeys = new Set(urgent.map(entry => entry.key));
  for (const key of notifiedKeys) {
    if (!urgentKeys.has(key)) notifiedKeys.delete(key);
  }

  const fresh = urgent.filter(entry => !notifiedKeys.has(entry.key));
  if (fresh.length > 0) {
    fresh.forEach(entry => notifiedKeys.add(entry.key));
    showDeadlineNotification(fresh);
  }

  if (Number.isFinite(nextWake)) {
    notificationTimeout = setTimeout(
      updateNextNotification,
      Math.max(nextWake - nowMs, 0) + TIMER_BUFFER_MS
    );
  }
}

export function completeAutomaticDailies(gameName, accountIds) {
  const group = computeTaskResetData(getGroupedAccounts(), new Date())
    .find(g => g.name === gameName);

  if (!group) return false;

  let changed = false;

  for (const account of group.accounts) {
    if (!accountIds.includes(account.id)) continue;

    const task = account.tasks.Daily?.[0];
    if (!task || task.isCompleted) continue;

    updateTaskLog(gameName, task.id, account.id, false);
    changed = true;
  }

  return changed;
}