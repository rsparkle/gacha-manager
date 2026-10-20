import { ref, computed } from 'vue';
import { createResetProcessor } from '../../shared/resetProcessor';
import { useSettings } from './useSettings.js';
import { getLiveVersion } from '../../shared/liveVersion.js';

const gameConfig = ref(null);
const accountsPerGame = ref([]);
let processor = null;

const gamesWithAccounts = computed(() =>
    accountsPerGame.value.filter((game) => game.accounts.length > 0).map((game) => game.name),
);

async function call(request) {
    const response = await request();

    if (!response?.success) {
        throw new Error(response?.error || 'Unknown error');
    }

    return response;
}

async function loadGameData() {
    const [config, tasks] = await Promise.all([window.api.getGameConfig(), window.api.getGameTasks()]);

    processor = createResetProcessor(config, tasks);
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
    accountsPerGame.value = applyLiveVersions(processor.computeTaskResetData(await window.api.getGroupedAccounts()));
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

async function insertAccounts(gameList) {
    const response = await call(() => window.api.insertAccounts(gameList));

    await loadAccounts();

    return response.data;
}

async function updateAccount(gameName, id, changes) {
    const { account } = await call(() => window.api.updateAccount({ gameName, id, changes }));

    replaceAccount(gameName, account);
}

async function deleteAccount(gameName, id) {
    await call(() => window.api.deleteAccount({ gameName, id }));
    await Promise.all([loadAccounts(), useSettings().loadSettings()]);
}

async function setTaskCompleted(gameName, accountId, taskId, completed) {
    const { account } = await call(() => window.api.setTaskCompleted({ gameName, accountId, taskId, completed }));

    replaceAccount(gameName, account);
}

export function useAccounts() {
    return {
        gameConfig,
        accountsPerGame,
        gamesWithAccounts,
        loadGameData,
        loadAccounts,
        recompute,
        insertAccounts,
        updateAccount,
        deleteAccount,
        setTaskCompleted,
    };
}
