<template>
    <div :class="settings.theme" id="app">
        <NotificationCenter />
        <AppSettings :accountsPerGame="accountsPerGame" />
        <ConfirmDialogue />
        <div class="app-bar">
            <div class="view-toggle" v-if="currentView !== 'setup'">
                <button v-if="hideSetup" class="view-btn" :class="{ active: currentView === 'tasks' }"
                    @click="currentView = 'tasks'">
                    <span>Tasks</span>
                </button>
                <button v-else class="view-btn" :class="{ active: currentView === 'setup' }"
                    @click="currentView = 'setup'">
                    <span>Setup</span>
                </button>
                <button class="view-btn" :class="{ active: currentView === 'schedule' }"
                    @click="currentView = 'schedule'">
                    <span>Schedule</span>
                </button>
            </div>
            <div v-else class="app-bar-logo">Setup</div>

            <div class="app-bar-right">
                <div class="theme-group">
                    <span class="app-bar-label">Theme</span>
                    <button class="theme-btn" :class="{ active: settings.theme === '' }"
                        @click="settings.theme = ''; saveSettings(true)">
                        <span class="theme-swatch emerald"></span>
                        <span>Default</span>
                    </button>
                    <button class="theme-btn" :class="{ active: settings.theme === 'sparkle' }"
                        @click="settings.theme = 'sparkle'; saveSettings(true)">
                        <span class="theme-swatch crimson"></span>
                        <span>Sparkle</span>
                    </button>
                </div>
                <button class="settings-btn" @click="showSettings = !showSettings">
                    <span>⚙</span>
                    <span>Settings</span>
                </button>
            </div>
        </div>
        <SetupView v-if="currentView === 'setup'" @done="onSetupDone" :gameConfig="GAME_CONFIG" />
        <TasksView v-else-if="currentView === 'tasks'" :accountsPerGame="accountsPerGame"
            @refreshAccount="updateAccountTaskData" @refresh="loadData" :gameConfig="GAME_CONFIG" />
        <ScheduleView v-else-if="currentView === 'schedule'" :gameConfig="GAME_CONFIG" :gamesWithAccounts="gamesWithAccounts"/>
        <AppFooter />
    </div>
</template>

<script setup>
import { watch, ref, computed, onMounted, onUnmounted } from 'vue'

import '../styles/app.css';
import SetupView from './SetupView.vue'
import TasksView from './TasksView.vue'
import ScheduleView from './ScheduleView.vue'
import AppFooter from './AppFooter.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import ConfirmDialogue from './components/ConfirmDialogue.vue'
import AppSettings from './components/AppSettings.vue'
import { useNotification } from './composables/useNotification.js'
import { useSettings } from './composables/useSettings.js'
import { createResetProcessor } from './resetProcessor';
const GAME_CONFIG = ref(null);
const GAME_TASKS = ref(null);
let computeTaskResetData, computeSingleAccountResetData;

const { setTheme } = useNotification()
const { settings, showSettings, saveSettings } = useSettings()

const accountsPerGame = ref([])
const hideSetup = ref(false)
const currentView = ref(null)
let taskTimer = null

const loadData = async () => {
    const groupedAccounts = await window.api.getGroupedAccounts()
    accountsPerGame.value = computeTaskResetData(groupedAccounts)
}

const gamesWithAccounts = computed(() => {
    return accountsPerGame.value.filter(game => game.accounts.length > 0).map(game => game.name)
})

const updateAccountTaskData = (
    gameName,
    accountId
) => {
    const game = accountsPerGame.value.find(
        game => game.name === gameName
    );

    if (!game) return;

    const account = game.accounts.find(
        account => account.id === accountId
    );

    if (!account) return;

    computeSingleAccountResetData(
        account,
        gameName
    );
};

const onSetupDone = async () => {
    await loadData()
    currentView.value = 'tasks'
    hideSetup.value = true
}

const scheduleUpdate = () => {
    const now = new Date()
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()

    taskTimer = setTimeout(() => {
        accountsPerGame.value = computeTaskResetData(accountsPerGame.value)
        scheduleUpdate()
    }, msUntilNextMinute)
}

watch(
    () => settings.value.theme,
    (theme, previousTheme) => {
        setTheme(theme);

        if (previousTheme) {
            document.documentElement.classList.remove(previousTheme);
        }

        if (theme) {
            document.documentElement.classList.add(theme);
        }
    },
    { immediate: true }
);

onMounted(async () => {
    GAME_CONFIG.value = await window.api.getGameConfig();
    GAME_TASKS.value = await window.api.getGameTasks();
    ({ computeTaskResetData, computeSingleAccountResetData } = createResetProcessor(GAME_CONFIG.value, GAME_TASKS.value));

    await loadData();

    hideSetup.value = accountsPerGame.value.some(
        game => game.accounts.length > 0
    );
    currentView.value = hideSetup.value ? 'tasks' : 'setup';
    scheduleUpdate();
})

onUnmounted(() => {
    clearTimeout(taskTimer);
    document.documentElement.classList.remove(settings.value.theme);
})
</script>