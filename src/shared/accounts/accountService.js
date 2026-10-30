import { createResetProcessor } from '../resetProcessor.js';
import { DEFAULT_SETTINGS } from '../settings.js';
import { parseAccounts, serializeAccounts } from './accountsFile.js';
import { getLiveVersion } from '../liveVersion.js';

const EDITABLE_ACCOUNT_FIELDS = ['server', 'uid', 'label', 'monthlySubRemaining'];
const PER_ACCOUNT_SETTINGS = ['automaticDailies', 'deadlineNotifications', 'monthlySubNotifications'];
const DAY_MS = 86_400_000;

export function createAccountService({ storage, settings }) {
    let accounts = storage.load();
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
        accounts = storage.load();

        emitChange();
    }

    function save(nextAccounts) {
        storage.save(nextAccounts);
        accounts = nextAccounts;

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

    function findAccount(gameName, accountId) {
        const account = accounts[gameName]?.find((account) => account.id === accountId);

        if (!account) {
            throw new Error('Account not found');
        }

        return account;
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

    function getGroupedAccounts() {
        return Object.entries(gameConfig).map(([gameName, config]) => ({
            name: gameName,
            game_version: getLiveVersion(config),
            accounts: (accounts[gameName] ?? []).map((account) => toUIAccount(gameName, account)),
        }));
    }

    function computeGroups(now = new Date()) {
        return processor ? processor.computeTaskResetData(getGroupedAccounts(), now) : [];
    }

    function insertAccounts(gameList) {
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

        save({
            ...accounts,
            [gameName]: gameAccounts.map((account) =>
                account.id === accountId ? { ...account, ...sanitized, id: account.id } : account,
            ),
        });

        return toUIAccount(gameName, findAccount(gameName, accountId));
    }

    function removeAccountSettings(keep) {
        for (const key of PER_ACCOUNT_SETTINGS) {
            const map = settings.get(key, {});
            const next = {};
            let changed = false;

            for (const gameName of Object.keys(map)) {
                const ids = getAccountIds(key, gameName);
                const kept = ids.filter((id) => keep(gameName, id));

                next[gameName] = kept;
                changed ||= kept.length !== ids.length;
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

    function setTaskCompleted(gameName, taskId, accountId, completed) {
        const account = findAccount(gameName, accountId);
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
                    lastCountedAt < processor.getLastDailyReset(gameName, account.server, now).getTime()
                ) {
                    nextAccount.monthlySubRemaining = remaining - 1;
                    nextAccount.lastMonthlySubEditedDay = now.toISOString();
                }
            }
        } else {
            delete tasks[taskId];
        }

        save({
            ...accounts,
            [gameName]: accounts[gameName].map((stored) => (stored.id === accountId ? nextAccount : stored)),
        });

        return toUIAccount(gameName, nextAccount);
    }

    function syncCalendarMonthlySubs() {
        if (getMonthlySubCheck() !== 'calendar' || !processor) return false;

        const nextAccounts = structuredClone(accounts);
        const now = new Date();
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
                    const currentReset = processor.getLastDailyReset(gameName, account.server, now);
                    const lastReset = processor.getLastDailyReset(gameName, account.server, new Date(lastMs));
                    elapsedDays = Math.round((currentReset - lastReset) / DAY_MS);
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

    function exportAccounts() {
        return serializeAccounts(accounts);
    }

    function importAccounts(text) {
        let imported;

        try {
            ({ accounts: imported } = parseAccounts(text));
        } catch (err) {
            throw new Error(
                err instanceof SyntaxError ? 'This file is not a Gacha Manager accounts backup' : err.message,
                { cause: err },
            );
        }

        save(imported);
        removeAccountSettings((gameName, id) => imported[gameName]?.some((account) => account.id === id) ?? false);
    }

    return {
        onChange,
        setGameData,
        reload,
        getAccountIds,
        getAccounts,
        getGroupedAccounts,
        computeGroups,
        insertAccounts,
        updateAccount,
        deleteAccount,
        setTaskCompleted,
        syncCalendarMonthlySubs,
        saveSettings,
        completeAutomaticDailies,
        exportAccounts,
        importAccounts,
    };
}
