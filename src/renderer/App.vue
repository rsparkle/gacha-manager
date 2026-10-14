<template>
    <div :class="settings.theme" id="app">
        <NotificationCenter />
        <AppSettings />
        <ConfirmDialogue />
        <div class="app-bar">
            <div class="view-toggle" v-if="currentView !== 'setup'">
                <button
                    v-if="hideSetup"
                    class="view-btn"
                    :class="{ active: currentView === 'tasks' }"
                    @click="currentView = 'tasks'"
                >
                    <span>Tasks</span>
                </button>
                <button
                    v-else
                    class="view-btn"
                    :class="{ active: currentView === 'setup' }"
                    @click="currentView = 'setup'"
                >
                    <span>Setup</span>
                </button>
                <button
                    class="view-btn"
                    :class="{ active: currentView === 'schedule' }"
                    @click="currentView = 'schedule'"
                >
                    <span>Schedule</span>
                </button>
            </div>
            <div v-else class="app-bar-logo">Setup</div>

            <div class="app-bar-right">
                <div class="theme-group">
                    <span class="app-bar-label">Theme</span>
                    <button
                        class="theme-btn"
                        :class="{ active: settings.theme === '' }"
                        @click="
                            settings.theme = '';
                            saveSettings(true);
                        "
                    >
                        <span class="theme-swatch default"></span>
                        <span>Default</span>
                    </button>
                    <button
                        class="theme-btn"
                        :class="{ active: settings.theme === 'furina' }"
                        @click="
                            settings.theme = 'furina';
                            saveSettings(true);
                        "
                    >
                        <span class="theme-swatch furina"></span>
                        <span>Furina</span>
                    </button>
                    <button
                        class="theme-btn"
                        :class="{ active: settings.theme === 'sparkle' }"
                        @click="
                            settings.theme = 'sparkle';
                            saveSettings(true);
                        "
                    >
                        <span class="theme-swatch sparkle"></span>
                        <span>Sparkle</span>
                    </button>
                </div>
                <button class="settings-btn" @click="showSettings = !showSettings">
                    <span>⚙</span>
                    <span>Settings</span>
                </button>
            </div>
        </div>
        <SetupView v-if="currentView === 'setup'" @done="onSetupDone" />
        <TasksView v-else-if="currentView === 'tasks'" />
        <ScheduleView v-else-if="currentView === 'schedule'" />
        <AppFooter />
    </div>
</template>

<script setup>
import { watch, ref, onMounted, onUnmounted } from 'vue';

import './styles/app.css';
import SetupView from './views/SetupView.vue';
import TasksView from './views/TasksView.vue';
import ScheduleView from './views/ScheduleView.vue';
import AppFooter from './components/AppFooter.vue';
import NotificationCenter from './components/NotificationCenter.vue';
import ConfirmDialogue from './components/ConfirmDialogue.vue';
import AppSettings from './components/AppSettings.vue';
import { useNotification } from './composables/useNotification.js';
import { useSettings } from './composables/useSettings.js';
import { useAccounts } from './composables/useAccounts.js';

const { createNotification, setTheme } = useNotification();
const { settings, showSettings, saveSettings } = useSettings();
const { gamesWithAccounts, loadGameData, loadAccounts, recompute } = useAccounts();

const hideSetup = ref(false);
const currentView = ref(null);
let taskTimer = null;
let stopDailiesListener = null;
let stopGameDataListener = null;

const onSetupDone = () => {
    currentView.value = 'tasks';
    hideSetup.value = true;
};

const scheduleUpdate = () => {
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    taskTimer = setTimeout(async () => {
        try {
            const res = await window.api.syncCalendarMonthlySubs();

            if (res?.changed) {
                await loadAccounts();
            } else {
                recompute();
            }
        } catch (err) {
            console.error('Minute tick failed:', err);
        }
        scheduleUpdate();
    }, msUntilNextMinute);
};

const onDailiesCompleted = async () => {
    createNotification('success', 'Daily completed!', 1000);
    await loadAccounts();
};

const onGameDataUpdated = async () => {
    try {
        await loadGameData();
        await loadAccounts();
    } catch (err) {
        console.error('Game data update failed:', err);
    }
};

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
    { immediate: true },
);

onMounted(async () => {
    stopGameDataListener = window.api.onGameDataUpdated(onGameDataUpdated);

    await loadGameData();
    await loadAccounts();

    hideSetup.value = gamesWithAccounts.value.length > 0;
    currentView.value = hideSetup.value ? 'tasks' : 'setup';
    scheduleUpdate();

    stopDailiesListener = window.api.onDailiesCompleted(onDailiesCompleted);
});

onUnmounted(() => {
    clearTimeout(taskTimer);
    if (settings.value.theme) document.documentElement.classList.remove(settings.value.theme);
    if (stopDailiesListener) stopDailiesListener();
    if (stopGameDataListener) stopGameDataListener();
});
</script>
