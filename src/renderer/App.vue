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
        <ScheduleView v-else-if="currentView === 'schedule'" :gameConfig="GAME_CONFIG" />
        <AppFooter />
    </div>
</template>

<script setup>
import { watch, ref, onMounted, onUnmounted } from 'vue'

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

const updateAccountTaskData = (game_id, account_id) => {
    const game = accountsPerGame.value.find(game => game.id === game_id)
    let acc = game.accounts.find(acc => acc.id === account_id)
    if (!acc) return
    computeSingleAccountResetData(acc, game.name)
}

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

watch(() => settings.value.theme, (val) => setTheme(val), { immediate: true });

onMounted(async () => {
    GAME_CONFIG.value = await window.api.getGameConfig();
    ({ computeTaskResetData, computeSingleAccountResetData } = createResetProcessor(GAME_CONFIG.value));

    await loadData();

    hideSetup.value = accountsPerGame.value.length > 0;
    currentView.value = hideSetup.value ? 'tasks' : 'setup';
    scheduleUpdate();
})

onUnmounted(() => {
    clearTimeout(taskTimer);
})
</script>