import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, dialog, Notification } from 'electron';
import { createResetProcessor } from '../shared/resetProcessor';
import { URGENT_PROGRESS, isUrgent } from '../shared/tasks.js';

let accounts = {};
let accountPath;
let gameTasks;
let gameConfig;
let computeTaskResetData;
let computeSingleAccountResetData;
let getLastDailyReset;
let store;
let notificationTimeout;
const notifiedKeys = new Set();
const TIMER_BUFFER_MS = 1000;
const EDITABLE_ACCOUNT_FIELDS = ['server', 'uid', 'label', 'monthlySubRemaining'];
const PER_ACCOUNT_SETTINGS = ['automaticDailies', 'windowsNotifications'];

export function getAccountIds(key, gameName) {
    return Object.values(store.get(key, {})[gameName] ?? {});
}

function getMonthlySubCheck() {
    return store.get('monthlySubCheck', 'calendar');
}

export function initializeAccounts({ tasks, config, settingsStore }) {
    store = settingsStore;
    accountPath = path.join(app.getPath('userData'), 'accounts.json');
    accounts = loadStoredAccounts();

    setGameData({ tasks, config });
}

export function setGameData({ tasks, config }) {
    ({ computeTaskResetData, computeSingleAccountResetData, getLastDailyReset } = createResetProcessor(config, tasks));
    gameTasks = tasks;
    gameConfig = config;

    updateNextNotification();
}

function writeFileAtomic(filePath, contents) {
    const tempPath = `${filePath}.tmp`;
    const fd = fs.openSync(tempPath, 'w');

    try {
        fs.writeSync(fd, contents);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }

    try {
        fs.renameSync(tempPath, filePath);
    } catch {
        fs.writeFileSync(filePath, contents, 'utf-8');
        fs.rmSync(tempPath, { force: true });
    }
}

function loadStoredAccounts() {
    if (!fs.existsSync(accountPath)) {
        writeFileAtomic(accountPath, '{}');
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
            cancelId: 1,
        });

        if (choice !== 0) {
            err.userDeclined = true;
            throw err;
        }

        const backup = accountPath.replace('.json', `.corrupt-${Date.now()}.json`);
        fs.copyFileSync(accountPath, backup);
        writeFileAtomic(accountPath, '{}');

        return {};
    }
}

function saveAccounts(nextAccounts) {
    writeFileAtomic(accountPath, JSON.stringify(nextAccounts, null, 2));

    accounts = nextAccounts;

    updateNextNotification();
}

export function getAccounts() {
    return structuredClone(accounts);
}

export function insertAccounts(gameList) {
    if (!Array.isArray(gameList) || gameList.length === 0) {
        throw new Error('No games selected');
    }

    for (const game of gameList) {
        if (!Object.hasOwn(gameConfig, game?.name)) {
            throw new Error(`Unknown game: ${game?.name}`);
        }

        if (!Object.hasOwn(gameConfig[game.name].servers, game.server)) {
            throw new Error(`Unknown server: ${game.server}`);
        }
    }

    const nextAccounts = { ...accounts };
    const createdAccounts = [];

    gameList.forEach((game) => {
        const account = {
            id: randomUUID(),
            uid: '',
            server: game.server,
            label: game.label ?? '',
            tasks: {},
        };

        nextAccounts[game.name] = [...(nextAccounts[game.name] ?? []), account];

        createdAccounts.push(account);
    });

    saveAccounts(nextAccounts);

    return createdAccounts;
}

export function updateAccount(gameName, accountId, changes) {
    const gameAccounts = accounts[gameName] ?? [];

    if (!gameAccounts.some((account) => account.id === accountId)) {
        throw new Error('Account not found');
    }

    const sanitized = {};

    for (const field of EDITABLE_ACCOUNT_FIELDS) {
        if (changes[field] !== undefined) {
            sanitized[field] = changes[field];
        }
    }

    if (sanitized.uid !== undefined) {
        sanitized.uid = String(sanitized.uid);

        if (!/^\d*$/.test(sanitized.uid)) {
            throw new Error('UID can only contain digits');
        }
    }

    if (sanitized.server !== undefined && !Object.hasOwn(gameConfig[gameName]?.servers ?? {}, sanitized.server)) {
        throw new Error(`Unknown server: ${sanitized.server}`);
    }

    if (sanitized.monthlySubRemaining !== undefined) {
        const days = Number(sanitized.monthlySubRemaining);

        if (!Number.isInteger(days) || days < 0) {
            throw new Error('Invalid monthly subscription days');
        }

        sanitized.monthlySubRemaining = days;
        sanitized.lastMonthlySubEditedDay = new Date().toISOString();
    }

    const nextAccounts = {
        ...accounts,
        [gameName]: gameAccounts.map((account) =>
            account.id === accountId
                ? {
                      ...account,
                      ...sanitized,
                      id: account.id,
                  }
                : account,
        ),
    };

    saveAccounts(nextAccounts);

    return getAccountForUI(gameName, accountId);
}

export function deleteAccount(gameName, accountId) {
    const gameAccounts = accounts[gameName] ?? [];

    const deletedAccount = gameAccounts.find((account) => account.id === accountId);

    if (!deletedAccount) {
        throw new Error('Account not found');
    }

    const nextAccounts = {
        ...accounts,
        [gameName]: gameAccounts.filter((account) => account.id !== accountId),
    };

    saveAccounts(nextAccounts);
    removeAccountSettings(gameName, accountId);
}

function removeAccountSettings(gameName, accountId) {
    for (const key of PER_ACCOUNT_SETTINGS) {
        const map = store.get(key, {});

        if (!map[gameName]) continue;

        store.set(key, {
            ...map,
            [gameName]: getAccountIds(key, gameName).filter((id) => id !== accountId),
        });
    }

    updateNextNotification();
}

function findAccount(gameName, accountId) {
    const account = accounts[gameName]?.find((account) => account.id === accountId);

    if (!account) {
        throw new Error('Account not found');
    }

    return account;
}

export function setTaskCompleted(gameName, taskId, accountId, completed) {
    const account = findAccount(gameName, accountId);
    const definition = gameTasks[gameName]?.tasks.find((task) => task.id === taskId);

    if (!definition) {
        throw new Error(`Unknown task: ${taskId}`);
    }

    const now = new Date();
    const current = Object.values(computeSingleAccountResetData(toUIAccount(gameName, account), gameName, now).tasks)
        .flat()
        .find((task) => task.id === taskId);

    if (current.isDisabled) {
        throw new Error('This task is not active right now');
    }

    if (current.isCompleted === Boolean(completed)) {
        return toUIAccount(gameName, account);
    }

    const tasks = { ...account.tasks };
    const nextAccount = { ...account, tasks };

    if (completed) {
        tasks[taskId] = now.toISOString();

        const remaining = Number(account.monthlySubRemaining ?? 0);

        if (getMonthlySubCheck() === 'dailyTask' && definition.type === 'Daily' && remaining > 0) {
            const lastCountedAt = Date.parse(account.lastMonthlySubEditedDay ?? '');

            if (
                !Number.isFinite(lastCountedAt) ||
                lastCountedAt < getLastDailyReset(gameName, account.server, now).getTime()
            ) {
                nextAccount.monthlySubRemaining = remaining - 1;
                nextAccount.lastMonthlySubEditedDay = now.toISOString();
            }
        }
    } else {
        delete tasks[taskId];
    }

    saveAccounts({
        ...accounts,
        [gameName]: accounts[gameName].map((stored) => (stored.id === accountId ? nextAccount : stored)),
    });

    return toUIAccount(gameName, nextAccount);
}

export function syncCalendarMonthlySubs() {
    if (getMonthlySubCheck() !== 'calendar') return false;

    const nextAccounts = structuredClone(accounts);
    const now = new Date();
    const dayMs = 86_400_000;
    let changed = false;

    for (const [gameName, gameAccounts] of Object.entries(nextAccounts)) {
        for (const account of gameAccounts) {
            if (account.monthlySubRemaining == null) continue;

            const lastMs = Date.parse(account.lastMonthlySubEditedDay ?? '');

            if (!Number.isFinite(lastMs)) {
                account.lastMonthlySubEditedDay = now.toISOString();
                changed = true;
                continue;
            }

            let elapsedDays;

            try {
                const currentReset = getLastDailyReset(gameName, account.server, now);
                const lastReset = getLastDailyReset(gameName, account.server, new Date(lastMs));
                elapsedDays = Math.round((currentReset - lastReset) / dayMs);
            } catch (err) {
                console.warn(err.message);
                continue;
            }

            if (elapsedDays <= 0) continue;

            account.monthlySubRemaining = Math.max(0, account.monthlySubRemaining - elapsedDays);
            account.lastMonthlySubEditedDay = now.toISOString();
            changed = true;
        }
    }

    if (changed) saveAccounts(nextAccounts);

    return changed;
}

export function restartMonthlySubCount() {
    const now = new Date().toISOString();
    let changed = false;

    const nextAccounts = Object.fromEntries(
        Object.entries(accounts).map(([gameName, gameAccounts]) => [
            gameName,
            gameAccounts.map((account) => {
                if (account.monthlySubRemaining == null) return account;

                changed = true;
                return { ...account, lastMonthlySubEditedDay: now };
            }),
        ]),
    );

    if (changed) saveAccounts(nextAccounts);
}

function getTasksForUI(gameName, account) {
    return gameTasks[gameName].tasks.reduce((groupedTasks, task) => {
        const formattedTask = {
            ...task,
            last_completed: account.tasks?.[task.id] ?? null,
        };

        (groupedTasks[task.type] ??= []).push(formattedTask);

        return groupedTasks;
    }, {});
}

function toUIAccount(gameName, account) {
    return {
        ...structuredClone(account),
        tasks: getTasksForUI(gameName, account),
    };
}

function getAccountForUI(gameName, accountId) {
    return toUIAccount(gameName, findAccount(gameName, accountId));
}

export function getGroupedAccounts() {
    return Object.entries(gameConfig).map(([gameName, config]) => ({
        name: gameName,
        game_version: config.current.version,
        accounts: (accounts[gameName] ?? []).map((account) => toUIAccount(gameName, account)),
    }));
}

function showDeadlineNotification(entries) {
    const games = [...new Set(entries.map((entry) => entry.game))].join(', ');
    const body =
        entries.length === 1
            ? `There is 1 task approaching its deadline in ${games}`
            : `There are ${entries.length} tasks approaching their deadlines in ${games}`;

    new Notification({
        title: 'Some tasks are approaching their deadline!',
        body,
    }).show();
}

export function updateNextNotification() {
    clearTimeout(notificationTimeout);
    notificationTimeout = undefined;

    if (!computeTaskResetData) return;

    const now = new Date();
    const nowMs = now.getTime();

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
        const enabledIds = getAccountIds('windowsNotifications', group.name);

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

    const urgentKeys = new Set(urgent.map((entry) => entry.key));
    for (const key of notifiedKeys) {
        if (!urgentKeys.has(key)) notifiedKeys.delete(key);
    }

    const fresh = urgent.filter((entry) => !notifiedKeys.has(entry.key));
    if (fresh.length > 0) {
        fresh.forEach((entry) => notifiedKeys.add(entry.key));
        showDeadlineNotification(fresh);
    }

    if (Number.isFinite(nextWake)) {
        notificationTimeout = setTimeout(updateNextNotification, Math.max(nextWake - nowMs, 0) + TIMER_BUFFER_MS);
    }
}

export function completeAutomaticDailies(gameName, accountIds) {
    const group = computeTaskResetData(getGroupedAccounts(), new Date()).find((g) => g.name === gameName);

    if (!group) return false;

    let changed = false;

    for (const account of group.accounts) {
        if (!accountIds.includes(account.id)) continue;

        const task = account.tasks.Daily?.[0];
        if (!task || task.isCompleted || task.isDisabled) continue;

        setTaskCompleted(gameName, task.id, account.id, true);
        changed = true;
    }

    return changed;
}
