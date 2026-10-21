<template>
    <div id="setupApp" :style="bgStyle">
        <div class="setup-inner">
            <div class="setup-header">
                <h1 class="setup-title">Choose Your Games</h1>
                <p class="setup-subtitle">Select which games you want to track (you can add more later).</p>
            </div>

            <div v-if="!showLoader" class="game-grid">
                <div
                    v-for="game in gameList"
                    :key="game.name"
                    class="game-card"
                    :class="{ selected: selectedGames[game.name] }"
                    @click="toggleGame(game)"
                >
                    <img :src="gameImages[game.name]" :alt="game.name" />

                    <div class="game-card-check">
                        <span v-if="selectedGames[game.name]">✓</span>
                    </div>

                    <div class="game-card-body">
                        <p class="game-card-name">{{ game.name }}</p>
                        <p v-if="game.currentVersion" class="game-card-version">v{{ game.currentVersion }}</p>
                    </div>

                    <div v-if="selectedGames[game.name]" class="game-card-server" @click.stop>
                        <p class="server-label">Server</p>
                        <div class="server-pills">
                            <button
                                v-for="server in Object.keys(GAME_CONFIG[game.name].servers)"
                                :key="server"
                                class="server-pill"
                                :class="{ active: selectedGames[game.name]?.server === server }"
                                @click.stop="setServer(game, server)"
                            >
                                {{ server }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="loading-overlay">
                <img v-if="loadingSticker" :src="loadingSticker" class="loading-sticker" alt="" />
                <div v-else class="empty-spinner"></div>
                <p>Loading games…</p>
            </div>

            <div class="setup-footer">
                <button class="btn-confirm" :disabled="!hasSelection || submitting" @click="submit">Continue</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import '../styles/setup.css';

import { ref, computed, onMounted } from 'vue';

import { useNotification } from '../composables/useNotification.js';
import { useSettings } from '../composables/useSettings.js';
import { useAccounts } from '../composables/useAccounts.js';
import { slugify } from '../../shared/format.js';
import { themeAsset } from '../themes.js';
import { getLiveVersion } from '../../shared/liveVersion.js';

const emit = defineEmits(['done']);

const { gameConfig, insertAccounts } = useAccounts();
const GAME_CONFIG = gameConfig.value;

const { createNotification } = useNotification();
const { settings } = useSettings();

const gameList = ref([]);
const selectedGames = ref({});
const gameImages = ref({});
const submitting = ref(false);

const hasSelection = computed(() => Object.keys(selectedGames.value).length > 0);
const setupBackground = computed(() => themeAsset(settings.value.theme, 'setup_background'));
const loadingSticker = computed(() => themeAsset(settings.value.theme, 'loading'));

const showLoader = ref(false);
let loaderTimer = null;

const startLoading = () => {
    loaderTimer = setTimeout(() => {
        showLoader.value = true;
    }, 300);
};

const stopLoading = () => {
    clearTimeout(loaderTimer);
    showLoader.value = false;
};

const bgStyle = computed(() => ({
    backgroundImage: setupBackground.value ? `url(${setupBackground.value})` : '',
}));

const toggleGame = (game) => {
    const gameName = game.name;

    if (selectedGames.value[gameName]) {
        const nextSelectedGames = {
            ...selectedGames.value,
        };

        delete nextSelectedGames[gameName];

        selectedGames.value = nextSelectedGames;
        return;
    }

    const defaultServer = Object.keys(GAME_CONFIG[gameName].servers)[0];

    selectedGames.value = {
        ...selectedGames.value,

        [gameName]: {
            server: defaultServer,
        },
    };
};

const setServer = (game, server) => {
    const gameName = game.name;

    if (!selectedGames.value[gameName]) return;

    selectedGames.value = {
        ...selectedGames.value,

        [gameName]: {
            ...selectedGames.value[gameName],
            server,
        },
    };
};

const submit = async () => {
    if (submitting.value) return;
    submitting.value = true;
    startLoading();

    try {
        const accountList = Object.entries(selectedGames.value).map(([name, data]) => ({
            name,
            server: data.server,
        }));

        await insertAccounts(accountList);
        emit('done');
    } catch (error) {
        createNotification('error', `Error creating accounts: ${error.message}`, 2000);
    } finally {
        submitting.value = false;
        stopLoading();
    }
};

const loadGames = async () => {
    const gameNames = await window.api.getGamesWithoutAccounts();

    gameList.value = gameNames.map((name) => ({
        name,
        currentVersion: getLiveVersion(GAME_CONFIG[name]),
    }));

    await Promise.all(
        gameList.value.map(async (game) => {
            gameImages.value[game.name] = await window.api.cacheImage(`games/${slugify(game.name)}_icon.webp`);
        }),
    );
};

onMounted(async () => {
    startLoading();
    try {
        await loadGames();
    } finally {
        stopLoading();
    }
});
</script>
