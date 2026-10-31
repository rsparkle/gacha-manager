import { ref, computed } from 'vue';
import platform from '#platform';
import { useSettings } from './useSettings.js';

const gameConfig = ref(null);
const independentEvents = ref([]);
const accountsPerGame = ref([]);

const gamesWithAccounts = computed(() =>
    accountsPerGame.value.filter((game) => game.accounts.length > 0).map((game) => game.name),
);

const gamesWithoutAccounts = computed(() =>
    accountsPerGame.value.filter((game) => !game.custom && game.accounts.length === 0).map((game) => game.name),
);

async function loadGameData() {
    const { config, independentEvents: events } = await platform.gameData.load();

    independentEvents.value = events ?? [];
    gameConfig.value = config;
}

async function loadAccounts() {
    accountsPerGame.value = await platform.accounts.getGroups();
}

async function reloadAccountsAndSettings() {
    await Promise.all([loadAccounts(), useSettings().loadSettings()]);
}

async function changeAccounts(action) {
    const result = await action();

    await loadAccounts();

    return result;
}

async function changeAccountsAndSettings(action) {
    const result = await action();

    await reloadAccountsAndSettings();

    return result;
}

async function syncMonthlySubs() {
    await platform.accounts.syncCalendarMonthlySubs();
    await loadAccounts();
}

function insertAccounts(gameList) {
    return changeAccounts(() => platform.accounts.insert(gameList));
}

function updateAccount(gameName, id, changes) {
    return changeAccounts(() => platform.accounts.update(gameName, id, changes));
}

function deleteAccount(gameName, id) {
    return changeAccountsAndSettings(() => platform.accounts.remove(gameName, id));
}

function setTaskCompleted(gameName, accountId, taskId, completed) {
    return changeAccounts(() => platform.accounts.setTaskCompleted(gameName, accountId, taskId, completed));
}

function createCustomGame() {
    return changeAccounts(() => platform.accounts.createCustomGame());
}

function renameCustomGame(gameKey, name) {
    return changeAccounts(() => platform.accounts.renameCustomGame(gameKey, name));
}

function deleteCustomGame(gameKey) {
    return changeAccountsAndSettings(() => platform.accounts.deleteCustomGame(gameKey));
}

function addCustomTask(gameKey, task) {
    return changeAccounts(() => platform.accounts.addCustomTask(gameKey, task));
}

function deleteCustomTask(gameKey, taskId) {
    return changeAccounts(() => platform.accounts.deleteCustomTask(gameKey, taskId));
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
        syncMonthlySubs,
        insertAccounts,
        updateAccount,
        deleteAccount,
        setTaskCompleted,
        createCustomGame,
        renameCustomGame,
        deleteCustomGame,
        addCustomTask,
        deleteCustomTask,
        exportAccounts,
        importAccounts,
    };
}
