<template>
    <div id="setupApp" :style="bgStyle">
        <div class="setup-bg-glow"></div>

        <div class="setup-inner">
            <div class="setup-header">
                <p class="setup-eyebrow">Getting Started</p>
                <h1 class="setup-title">Select Your Games</h1>
                <p class="setup-subtitle">Choose which games you want to track. You can add more later.</p>
            </div>

            <div class="game-grid" v-if="gameList.length">
                <div class="game-card" v-for="game in gameList" :key="game.id"
                    :class="{ selected: selectedGames[game.id] }" @click="toggleGame(game)">
                    <img :src="getImageUrl(game)" :alt="game.name" @error="handleImageError(game)" />

                    <div class="game-card-check">
                        <span v-if="selectedGames[game.id]">✓</span>
                    </div>

                    <div class="game-card-body">
                        <p class="game-card-name">{{ game.name }}</p>
                        <p class="game-card-version" v-if="game.current_version">
                            v{{ Number(game.current_version).toFixed(1) }}
                        </p>
                    </div>

                    <div class="game-card-server" v-if="selectedGames[game.id]" @click.stop>
                        <p class="server-label">Server</p>
                        <div class="server-pills">
                            <button class="server-pill" v-for="server in Object.keys(GAME_CONFIG[game.name].servers)" :key="server"
                                :class="{ active: selectedGames[game.id]?.server === server }"
                                @click.stop="setServer(game, server)">
                                {{ server }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="game-grid-empty" v-else>
                <div class="empty-spinner"></div>
                <p>Loading games…</p>
            </div>

            <div class="setup-footer">
                <button class="btn-confirm" :disabled="!hasSelection" @click="confirm">
                    <span>Continue</span>
                    <span class="btn-arrow">→</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import '../styles/setup.css';
import { ref, computed, onMounted } from 'vue';
import { useNotification } from './composables/useNotification.js'
import { useSettings } from './composables/useSettings.js';
import { GAME_CONFIG } from '../game-config.js';
const { createNotification } = useNotification()
const { settings } = useSettings()

const emit = defineEmits(['done'])

const gameList = ref([]);
const selectedGames = ref({});

const hasSelection = computed(() =>
    Object.values(selectedGames.value).some(v => v !== null)
);

const bgStyle = computed(() => ({
    backgroundImage: settings.value.theme
        ? `url(${new URL(`../assets/themes/${settings.value.theme}/setup_background.webp`, import.meta.url).href})`
        : ''
}));

const toggleGame = (game) => {
    if (selectedGames.value[game.id]) {
        const next = { ...selectedGames.value };
        delete next[game.id];
        selectedGames.value = next;
    } else {
        selectedGames.value = {
            ...selectedGames.value,
            [game.id]: { server: Object.keys(GAME_CONFIG[game.name].servers)[0] }
        };
    }
};

const setServer = (game, server) => {
    if (!selectedGames.value[game.id]) return;
    selectedGames.value = {
        ...selectedGames.value,
        [game.id]: { ...selectedGames.value[game.id], server }
    };
};

const confirm = async () => {
    try {
        const accountList = Object.entries(selectedGames.value).map(([id, data]) => ({
            game_id: id,
            server: data.server
        }))
        const response = await window.api.insertAccounts(accountList)
        if (response.success) {
            emit('done');
        } else {
            createNotification("error", `Error creating accounts: ${response.error}`, 2000)
        }
    } catch (err) {
        createNotification('error', `Critical Error: ${err.message}`, 2000)
    }

};

const getImageUrl = (game) => {
    const slug = game.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    const filename = `${slug}_icon`;
    return new URL(`../assets/games/${filename}.webp`, import.meta.url).href;
};

onMounted(async () => {
    gameList.value = await window.api.getGamesWithoutAccounts();
});
</script>