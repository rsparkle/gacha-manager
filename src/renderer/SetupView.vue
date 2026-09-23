<template>
    <div id="setupApp" :style="bgStyle">
        <div class="setup-inner">
            <div class="setup-header">
                <h1 class="setup-title">Select Your Games</h1>
                <p class="setup-subtitle">Choose which games you want to track. You can add more later.</p>
            </div>

            <div class="game-grid" v-if="gameList.length">
                <div class="game-card" v-for="game in gameList" :key="game.name"
                    :class="{ selected: selectedGames[game.name] }" @click="toggleGame(game)">
                    <img :src="gameImages[game.name]" :alt="game.name" @error="handleImageError(game)" />

                    <div class="game-card-check">
                        <span v-if="selectedGames[game.name]">✓</span>
                    </div>

                    <div class="game-card-body">
                        <p class="game-card-name">{{ game.name }}</p>
                        <p class="game-card-version" v-if="game.current_version">
                            v{{ Number(game.current_version).toFixed(1) }}
                        </p>
                    </div>

                    <div class="game-card-server" v-if="selectedGames[game.name]" @click.stop>
                        <p class="server-label">Server</p>
                        <div class="server-pills">
                            <button class="server-pill" v-for="server in Object.keys(GAME_CONFIG[game.name].servers)"
                                :key="server" :class="{ active: selectedGames[game.name]?.server === server }"
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
                    Continue
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import '../styles/setup.css';

import {
    ref,
    computed,
    onMounted
} from 'vue';

import { useNotification } from './composables/useNotification.js';
import { useSettings } from './composables/useSettings.js';

const props = defineProps({
    gameConfig: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['done']);

const GAME_CONFIG = props.gameConfig;

const { createNotification } = useNotification();
const { settings } = useSettings();

const gameList = ref([]);
const selectedGames = ref({});
const gameImages = ref({});

const hasSelection = computed(
    () => Object.keys(selectedGames.value).length > 0
);

const bgStyle = computed(() => ({
    backgroundImage: settings.value.theme
        ? `url(${
            new URL(
                `../assets/themes/${settings.value.theme}/setup_background.webp`,
                import.meta.url
            ).href
        })`
        : ''
}));

const toggleGame = game => {
    const gameName = game.name;

    if (selectedGames.value[gameName]) {
        const nextSelectedGames = {
            ...selectedGames.value
        };

        delete nextSelectedGames[gameName];

        selectedGames.value = nextSelectedGames;
        return;
    }

    const defaultServer = Object.keys(
        GAME_CONFIG[gameName].servers
    )[0];

    selectedGames.value = {
        ...selectedGames.value,

        [gameName]: {
            server: defaultServer
        }
    };
};

const setServer = (game, server) => {
    const gameName = game.name;

    if (!selectedGames.value[gameName]) return;

    selectedGames.value = {
        ...selectedGames.value,

        [gameName]: {
            ...selectedGames.value[gameName],
            server
        }
    };
};

const confirm = async () => {
    try {
        const accountList = Object.entries(
            selectedGames.value
        ).map(([name, data]) => ({
            name,
            server: data.server
        }));

        const response = await window.api.insertAccounts(
            accountList
        );

        if (response.success) {
            emit('done');
            return;
        }

        createNotification(
            'error',
            `Error creating accounts: ${response.error}`,
            2000
        );
    } catch (error) {
        createNotification(
            'error',
            `Critical Error: ${error.message}`,
            2000
        );
    }
};

onMounted(async () => {
    const gameNames =
        await window.api.getGamesWithoutAccounts();

    gameList.value = gameNames.map(name => ({
        name,
        currentVersion:
            GAME_CONFIG[name].current.version
    }));

    for (const game of gameList.value) {
        const slug = game.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        gameImages.value[game.name] =
            await window.api.cacheImage(
                `games/${slug}_icon.webp`
            );
    }
});
</script>