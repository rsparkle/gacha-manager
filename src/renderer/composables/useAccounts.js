import { ref, computed } from 'vue';
import platform from '#platform';
import { createResetProcessor } from '../../shared/resetProcessor.js';
import { useSettings } from './useSettings.js';
import { getLiveVersion } from '../../shared/liveVersion.js';

const gameConfig = ref(null);
const independentEvents = ref([]);
const accountsPerGame = ref([]);
let processor = null;

const gamesWithAccounts = computed(() =>
    accountsPerGame.value.filter((game) => game.accounts.length > 0).map((game) => game.name),
);

const gamesWithoutAccounts = computed(() =>
    accountsPerGame.value.filter((game) => game.accounts.length === 0).map((game) => game.name),
);

async function loadGameData() {
    const { config, tasks, independentEvents: events } = await platform.gameData.load();

    processor = createResetProcessor(config, tasks);
    independentEvents.value = events ?? [];
    gameConfig.value = config;
}

function applyLiveVersions(groups) {
    for (const group of groups) {
        const config = gameConfig.value?.[group.name];

        if (config) group.game_version = getLiveVersion(config);
    }

    return groups;
}

async function loadAccounts() {
    accountsPerGame.value = applyLiveVersions(processor.computeTaskResetData(await platform.accounts.getGrouped()));
}

function recompute() {
    accountsPerGame.value = applyLiveVersions(processor.computeTaskResetData(accountsPerGame.value));
}

function replaceAccount(gameName, account) {
    const game = accountsPerGame.value.find((game) => game.name === gameName);
    const index = game?.accounts.findIndex((stored) => stored.id === account.id) ?? -1;

    if (index === -1) return;

    game.accounts[index] = processor.computeSingleAccountResetData(account, gameName);
}

async function reloadAccountsAndSettings() {
    await Promise.all([loadAccounts(), useSettings().loadSettings()]);
}

async function syncMonthlySubs() {
    if (await platform.accounts.syncCalendarMonthlySubs()) {
        await loadAccounts();
    } else {
        recompute();
    }
}

async function insertAccounts(gameList) {
    const created = await platform.accounts.insert(gameList);

    await loadAccounts();

    return created;
}

async function updateAccount(gameName, id, changes) {
    replaceAccount(gameName, await platform.accounts.update(gameName, id, changes));
}

async function deleteAccount(gameName, id) {
    await platform.accounts.remove(gameName, id);
    await reloadAccountsAndSettings();
}

async function setTaskCompleted(gameName, accountId, taskId, completed) {
    replaceAccount(gameName, await platform.accounts.setTaskCompleted(gameName, accountId, taskId, completed));
}

function exportAccounts() {
    return platform.accounts.exportToFile();
}

async function importAccounts() {
    const imported = await platform.accounts.importFromFile();

    if (imported) await reloadAccountsAndSettings();

    return imported;
}

export function useAccounts() {
    return {
        gameConfig,
        independentEvents,
        accountsPerGame,
        gamesWithAccounts,
        gamesWithoutAccounts,
        loadGameData,
        loadAccounts,
        reloadAccountsAndSettings,
        recompute,
        syncMonthlySubs,
        insertAccounts,
        updateAccount,
        deleteAccount,
        setTaskCompleted,
        exportAccounts,
        importAccounts,
    };
}
