import { createResetProcessor } from '../resetProcessor.js';
import { DEFAULT_SETTINGS } from '../settings.js';
import { parseUserData, serializeUserData } from './accountsFile.js';
import {
    CUSTOM_GAME_NAME_MAX,
    CUSTOM_TASK_CATEGORY_MAX,
    CUSTOM_TASK_LABEL_MAX,
    CUSTOM_TASK_MAX_MINUTES,
    computeCustomTask,
    createCustomId,
    currentTimeZone,
    customTaskEnd,
    isCustomKey,
    nextCustomGameColor,
    nextCustomGameName,
    normalizeCustomReset,
} from './customData.js';
import { getLiveVersion } from '../liveVersion.js';
import { DAY } from '../serverTime.js';

const EDITABLE_ACCOUNT_FIELDS = ['server', 'uid', 'label', 'monthlySubRemaining'];
const PER_ACCOUNT_SETTINGS = ['automaticDailies', 'deadlineNotifications', 'monthlySubNotifications'];

function withoutKey(object, key) {
    const next = { ...object };
    delete next[key];

    return next;
}

export function createAccountService({ storage, settings }) {
    let { accounts, custom } = storage.load();
    let gameTasks = null;
    let gameConfig = null;
    let processor = null;
    const listeners = new Set();

    function onChange(listener) {
        listeners.add(listener);

        return () => listeners.delete(listener);
    }

    function emitChange() {
        for (const listener of listeners) listener();
    }

    function setGameData({ config, tasks }) {
        processor = createResetProcessor(config, tasks);
        gameTasks = tasks;
        gameConfig = config;

        emitChange();
    }

    function reload() {
        ({ accounts, custom } = storage.load());

        emitChange();
    }

    function save(nextAccounts, nextCustom = custom) {
        storage.save({ accounts: nextAccounts, custom: nextCustom });
        accounts = nextAccounts;
        custom = nextCustom;

        emitChange();
    }

    function getAccountIds(key, gameName) {
        return Object.values(settings.get(key, {})[gameName] ?? {});
    }

    function getMonthlySubCheck() {
        return settings.get('monthlySubCheck', DEFAULT_SETTINGS.monthlySubCheck);
    }

    function getAccounts() {
        return structuredClone(accounts);
    }

    function getCustomData() {
        return structuredClone(custom);
    }

    function hasGame(gameKey) {
        return Object.hasOwn(gameConfig ?? {}, gameKey) || Object.hasOwn(custom.games, gameKey);
    }

    function findCustomGame(gameKey) {
        if (!isCustomKey(gameKey) || !Object.hasOwn(custom.games, gameKey)) {
            throw new Error(`Unknown game: ${gameKey}`);
        }

        return custom.games[gameKey];
    }

    function gameNames({ except } = {}) {
        return [
            ...Object.keys(gameConfig ?? {}),
            ...Object.entries(custom.games)
                .filter(([key]) => key !== except)
                .map(([, game]) => game.name),
        ];
    }

    function findAccount(gameName, accountId) {
        const account = accounts[gameName]?.find((account) => account.id === accountId);

        if (!account) {
            throw new Error('Account not found');
        }

        return account;
    }

    function getTasksForUI(gameName, account) {
        return (gameTasks?.[gameName]?.tasks ?? []).reduce((groupedTasks, task) => {
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

    function getGroupedAccounts() {
        return Object.entries(gameConfig).map(([gameName, config]) => ({
            name: gameName,
            game_version: getLiveVersion(config),
            accounts: (accounts[gameName] ?? []).map((account) => toUIAccount(gameName, account)),
        }));
    }

    function addCustomTasks(gameKey, uiAccount, now) {
        const completions = accounts[gameKey]?.find((account) => account.id === uiAccount.id)?.tasks ?? {};

        for (const task of custom.tasks[gameKey] ?? []) {
            (uiAccount.tasks[task.category] ??= []).push(computeCustomTask(task, completions[task.id], now));
        }

        return uiAccount;
    }

    function computeCustomGameGroups(now) {
        return Object.entries(custom.games).map(([gameKey, game]) => ({
            name: gameKey,
            displayName: game.name,
            color: game.color,
            custom: true,
            game_version: null,
            maintenance: null,
            accounts: (accounts[gameKey] ?? []).map((account) =>
                addCustomTasks(gameKey, { ...structuredClone(account), tasks: {} }, now),
            ),
        }));
    }

    function computeGroups(now = new Date()) {
        if (!processor) return [];

        const groups = processor.computeTaskResetData(getGroupedAccounts(), now);

        for (const group of groups) {
            for (const account of group.accounts) addCustomTasks(group.name, account, now);
        }

        return [...groups, ...computeCustomGameGroups(now)];
    }

    function insertAccounts(gameList) {
        if (!Array.isArray(gameList) || gameList.length === 0) {
            throw new Error('No games selected');
        }

        for (const game of gameList) {
            if (!hasGame(game?.name)) {
                throw new Error(`Unknown game: ${game?.name}`);
            }

            const serverValid = isCustomKey(game.name)
                ? game.server === ''
                : Object.hasOwn(gameConfig[game.name].servers, game.server);

            if (!serverValid) {
                throw new Error(`Unknown server: ${game.server}`);
            }
        }

        const nextAccounts = { ...accounts };
        const createdAccounts = [];

        for (const game of gameList) {
            const account = {
                id: crypto.randomUUID(),
                uid: '',
                server: game.server,
                label: game.label ?? '',
                tasks: {},
            };

            nextAccounts[game.name] = [...(nextAccounts[game.name] ?? []), account];
            createdAccounts.push(account);
        }

        save(nextAccounts);

        return createdAccounts;
    }

    function updateAccount(gameName, accountId, changes) {
        const gameAccounts = accounts[gameName] ?? [];

        if (!gameAccounts.some((account) => account.id === accountId)) {
            throw new Error('Account not found');
        }

        const sanitized = {};

        for (const field of EDITABLE_ACCOUNT_FIELDS) {
            if (changes?.[field] !== undefined) {
                sanitized[field] = changes[field];
            }
        }

        if (sanitized.uid !== undefined) {
            sanitized.uid = String(sanitized.uid);

            if (!/^\d*$/.test(sanitized.uid)) {
                throw new Error('UID can only contain digits');
            }
        }

        const serverValid = isCustomKey(gameName)
            ? sanitized.server === ''
            : Object.hasOwn(gameConfig?.[gameName]?.servers ?? {}, sanitized.server);

        if (sanitized.server !== undefined && !serverValid) {
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

        save({
            ...accounts,
            [gameName]: gameAccounts.map((account) =>
                account.id === accountId ? { ...account, ...sanitized, id: account.id } : account,
            ),
        });
    }

    function removeAccountSettings(keep) {
        for (const key of PER_ACCOUNT_SETTINGS) {
            const map = settings.get(key, {});
            const next = {};
            let changed = false;

            for (const gameName of Object.keys(map)) {
                const ids = getAccountIds(key, gameName);
                const kept = ids.filter((id) => keep(gameName, id));

                if (kept.length > 0) next[gameName] = kept;
                changed ||= kept.length !== ids.length || kept.length === 0;
            }

            if (changed) settings.set(key, next);
        }
    }

    function deleteAccount(gameName, accountId) {
        const gameAccounts = accounts[gameName] ?? [];

        if (!gameAccounts.some((account) => account.id === accountId)) {
            throw new Error('Account not found');
        }

        save({
            ...accounts,
            [gameName]: gameAccounts.filter((account) => account.id !== accountId),
        });

        removeAccountSettings((game, id) => game !== gameName || id !== accountId);
    }

    function saveTaskCompletion(gameName, accountId, nextAccount) {
        save({
            ...accounts,
            [gameName]: accounts[gameName].map((stored) => (stored.id === accountId ? nextAccount : stored)),
        });
    }

    function setCustomTaskCompleted(gameName, taskId, account, completed) {
        const task = custom.tasks[gameName]?.find((candidate) => candidate.id === taskId);

        if (!task) {
            throw new Error(`Unknown task: ${taskId}`);
        }

        const now = new Date();
        const current = computeCustomTask(task, account.tasks?.[taskId], now);

        if (current.isCompleted === Boolean(completed)) return;

        if (completed && current.isDisabled) {
            throw new Error(current.ended ? 'This task has already ended' : 'This task is not active right now');
        }

        const tasks = completed ? { ...account.tasks, [taskId]: now.toISOString() } : withoutKey(account.tasks, taskId);

        saveTaskCompletion(gameName, account.id, { ...account, tasks });
    }

    function setTaskCompleted(gameName, taskId, accountId, completed) {
        const account = findAccount(gameName, accountId);

        if (isCustomKey(taskId)) {
            setCustomTaskCompleted(gameName, taskId, account, completed);
            return;
        }

        const definition = gameTasks[gameName]?.tasks.find((task) => task.id === taskId);

        if (!definition) {
            throw new Error(`Unknown task: ${taskId}`);
        }

        const now = new Date();
        const current = Object.values(
            processor.computeSingleAccountResetData(toUIAccount(gameName, account), gameName, now).tasks,
        )
            .flat()
            .find((task) => task.id === taskId);

        if (current.isDisabled) {
            throw new Error('This task is not active right now');
        }

        if (current.isCompleted === Boolean(completed)) return;

        const tasks = { ...account.tasks };
        const nextAccount = { ...account, tasks };

        if (completed) {
            tasks[taskId] = now.toISOString();

            const remaining = Number(account.monthlySubRemaining ?? 0);

            if (getMonthlySubCheck() === 'dailyTask' && definition.type === 'Daily' && remaining > 0) {
                const lastCountedAt = Date.parse(account.lastMonthlySubEditedDay ?? '');

                if (
                    !Number.isFinite(lastCountedAt) ||
                    lastCountedAt < processor.getLastDailyReset(gameName, account.server, now).getTime()
                ) {
                    nextAccount.monthlySubRemaining = remaining - 1;
                    nextAccount.lastMonthlySubEditedDay = now.toISOString();
                }
            }
        } else {
            delete tasks[taskId];
        }

        saveTaskCompletion(gameName, accountId, nextAccount);
    }

    function syncCalendarMonthlySubs() {
        if (getMonthlySubCheck() !== 'calendar' || !processor) return false;

        const nextAccounts = structuredClone(accounts);
        const now = new Date();
        let changed = false;

        for (const [gameName, gameAccounts] of Object.entries(nextAccounts)) {
            if (isCustomKey(gameName)) continue;

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
                    const currentReset = processor.getLastDailyReset(gameName, account.server, now);
                    const lastReset = processor.getLastDailyReset(gameName, account.server, new Date(lastMs));
                    elapsedDays = Math.round((currentReset - lastReset) / DAY);
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

        if (changed) save(nextAccounts);

        return changed;
    }

    function restartMonthlySubCount() {
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

        if (changed) save(nextAccounts);
    }

    function saveSettings(nextSettings) {
        const monthlySubModeChanged =
            nextSettings.monthlySubCheck !== undefined && nextSettings.monthlySubCheck !== getMonthlySubCheck();

        if (monthlySubModeChanged) syncCalendarMonthlySubs();

        settings.set(nextSettings);

        if (monthlySubModeChanged) restartMonthlySubCount();

        emitChange();

        return { accountsChanged: monthlySubModeChanged };
    }

    function completeAutomaticDailies(gameName) {
        const accountIds = getAccountIds('automaticDailies', gameName);
        const group = computeGroups().find((g) => g.name === gameName);

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

    function clearMissingFavorite() {
        const favorite = settings.get('favoriteGame', null);

        if (isCustomKey(favorite) && !Object.hasOwn(custom.games, favorite)) {
            settings.set('favoriteGame', null);
        }
    }

    function createCustomGame() {
        const key = createCustomId();
        const game = {
            name: nextCustomGameName(gameNames()),
            color: nextCustomGameColor(Object.values(custom.games).map((existing) => existing.color)),
        };
        const account = { id: crypto.randomUUID(), uid: '', server: '', label: '', tasks: {} };

        save({ ...accounts, [key]: [account] }, { ...custom, games: { ...custom.games, [key]: game } });

        return { key, game, account };
    }

    function renameCustomGame(gameKey, name) {
        const game = findCustomGame(gameKey);
        const trimmed = String(name ?? '').trim();

        if (!trimmed) {
            throw new Error("The name can't be empty");
        }

        if (trimmed.length > CUSTOM_GAME_NAME_MAX) {
            throw new Error(`The name can be up to ${CUSTOM_GAME_NAME_MAX} characters`);
        }

        if (gameNames({ except: gameKey }).some((taken) => taken.toLowerCase() === trimmed.toLowerCase())) {
            throw new Error(`There's already a game called ${trimmed}`);
        }

        if (trimmed === game.name) return;

        save(accounts, { ...custom, games: { ...custom.games, [gameKey]: { ...game, name: trimmed } } });
    }

    function deleteCustomGame(gameKey) {
        findCustomGame(gameKey);

        save(withoutKey(accounts, gameKey), {
            games: withoutKey(custom.games, gameKey),
            tasks: withoutKey(custom.tasks, gameKey),
        });

        removeAccountSettings((gameName) => gameName !== gameKey);
        clearMissingFavorite();
    }

    function buildCustomTask(id, { label, category, minutes, reset } = {}, zone) {
        const task = {
            id,
            label: String(label ?? '').trim(),
            category: String(category ?? '').trim(),
        };

        if (!task.label) throw new Error('Give the task a name');
        if (task.label.length > CUSTOM_TASK_LABEL_MAX) {
            throw new Error(`The task name can be up to ${CUSTOM_TASK_LABEL_MAX} characters`);
        }

        if (!task.category) throw new Error('Pick a category for the task');
        if (task.category.length > CUSTOM_TASK_CATEGORY_MAX) {
            throw new Error(`The category can be up to ${CUSTOM_TASK_CATEGORY_MAX} characters`);
        }

        if (reset != null) {
            task.reset = normalizeCustomReset({ ...reset, zone });
        } else {
            const duration = Number(minutes);

            if (!Number.isInteger(duration) || duration < 1) throw new Error('Set a deadline of at least 1 minute');
            if (duration > CUSTOM_TASK_MAX_MINUTES) throw new Error('The deadline can be at most 366 days away');

            const now = new Date();
            task.createdAt = now.toISOString();
            task.endsAt = customTaskEnd(duration, now).toISOString();
        }

        return task;
    }

    function addCustomTask(gameKey, input) {
        if (!hasGame(gameKey)) {
            throw new Error(`Unknown game: ${gameKey}`);
        }

        const task = buildCustomTask(createCustomId(), input, currentTimeZone());

        save(accounts, {
            ...custom,
            tasks: { ...custom.tasks, [gameKey]: [...(custom.tasks[gameKey] ?? []), task] },
        });

        return task;
    }

    function updateCustomTask(gameKey, taskId, input) {
        const customTasks = custom.tasks[gameKey] ?? [];
        const existing = customTasks.find((task) => task.id === taskId);

        if (!existing) {
            throw new Error(`Unknown task: ${taskId}`);
        }

        const task = buildCustomTask(taskId, input, existing.reset?.zone ?? currentTimeZone());

        save(accounts, {
            ...custom,
            tasks: { ...custom.tasks, [gameKey]: customTasks.map((stored) => (stored.id === taskId ? task : stored)) },
        });

        return task;
    }

    function deleteCustomTask(gameKey, taskId) {
        const customTasks = custom.tasks[gameKey] ?? [];

        if (!customTasks.some((task) => task.id === taskId)) {
            throw new Error(`Unknown task: ${taskId}`);
        }

        const remaining = customTasks.filter((task) => task.id !== taskId);
        const nextAccounts = accounts[gameKey]
            ? {
                  ...accounts,
                  [gameKey]: accounts[gameKey].map((account) =>
                      Object.hasOwn(account.tasks ?? {}, taskId)
                          ? { ...account, tasks: withoutKey(account.tasks, taskId) }
                          : account,
                  ),
              }
            : accounts;

        save(nextAccounts, {
            ...custom,
            tasks: remaining.length > 0 ? { ...custom.tasks, [gameKey]: remaining } : withoutKey(custom.tasks, gameKey),
        });
    }

    function exportAccounts() {
        return serializeUserData({ accounts, custom });
    }

    function importAccounts(text) {
        let imported;

        try {
            imported = parseUserData(text);
        } catch (err) {
            throw new Error(
                err instanceof SyntaxError ? 'This file is not a Gacha Manager accounts backup' : err.message,
                { cause: err },
            );
        }

        save(imported.accounts, imported.custom);
        removeAccountSettings(
            (gameName, id) => imported.accounts[gameName]?.some((account) => account.id === id) ?? false,
        );
        clearMissingFavorite();
    }

    return {
        onChange,
        setGameData,
        reload,
        getAccountIds,
        getAccounts,
        getCustomData,
        computeGroups,
        insertAccounts,
        updateAccount,
        deleteAccount,
        setTaskCompleted,
        createCustomGame,
        renameCustomGame,
        deleteCustomGame,
        addCustomTask,
        updateCustomTask,
        deleteCustomTask,
        syncCalendarMonthlySubs,
        saveSettings,
        completeAutomaticDailies,
        exportAccounts,
        importAccounts,
    };
}
