<template>
    <div id="app" :class="settings.theme">
        <NotificationCenter />
        <AppSettings />
        <ConfirmDialogue />
        <UpdatePill v-if="desktop" />
        <div v-if="desktop" class="title-bar">
            <img :src="appIcon" alt="" class="title-bar-icon" />
            <span>Gacha Manager</span>
        </div>
        <div class="app-bar">
            <div v-if="currentView !== 'setup'" class="view-toggle">
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
                    <div ref="themePicker" class="theme-picker">
                        <button
                            class="theme-btn theme-picker-toggle"
                            :aria-expanded="themeMenuOpen"
                            @click="themeMenuOpen = !themeMenuOpen"
                        >
                            <span class="theme-swatch" :class="currentTheme.id || 'default'"></span>
                            <span>{{ currentTheme.name }}</span>
                            <span class="theme-picker-caret">▾</span>
                        </button>
                        <Transition name="theme-menu">
                            <div v-if="themeMenuOpen" class="theme-menu">
                                <button
                                    v-for="theme in THEMES"
                                    :key="theme.id"
                                    class="theme-btn"
                                    :class="{ active: settings.theme === theme.id }"
                                    @click="selectTheme(theme.id)"
                                >
                                    <span class="theme-swatch" :class="theme.id || 'default'"></span>
                                    <span>{{ theme.name }}</span>
                                </button>
                            </div>
                        </Transition>
                    </div>
                </div>
                <button
                    v-if="desktop"
                    class="settings-btn"
                    title="Closes the window to save memory. The app keeps running in the tray."
                    @click="desktop.hideToTray()"
                >
                    <span>Background</span>
                    <span>▾</span>
                </button>
                <button class="settings-btn" @click="showSettings = !showSettings">
                    <span>⚙</span>
                    <span>Settings</span>
                </button>
            </div>
        </div>
        <div v-if="startupError" class="startup-error">
            <p class="startup-error-title">Gacha Manager couldn't start</p>
            <p class="startup-error-detail">{{ startupError }}</p>
            <button class="settings-btn" @click="reloadPage">Try again</button>
        </div>
        <SetupView v-else-if="currentView === 'setup'" @done="onSetupDone" />
        <TasksView v-else-if="currentView === 'tasks'" />
        <ScheduleView v-else-if="currentView === 'schedule'" />
        <AppFooter />
    </div>
</template>

<script setup>
import { watch, ref, computed, onMounted, onUnmounted } from 'vue';
import platform from '#platform';

import './styles/app.css';
import.meta.glob('./styles/themes/*.css', { eager: true });
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
import { THEMES } from './themes.js';
import appIcon from '../assets/icon.png';
import UpdatePill from './components/UpdatePill.vue';

const { createNotification, setTheme } = useNotification();
const { settings, showSettings, saveSettings } = useSettings();
const { gamesWithAccounts, loadGameData, loadAccounts, reloadAccountsAndSettings, syncMonthlySubs } = useAccounts();

const desktop = platform.desktop;
const hideSetup = ref(false);
const currentView = ref(null);
const themeMenuOpen = ref(false);
const themePicker = ref(null);
const startupError = ref(null);
let taskTimer = null;
let stopExternalChangeListener = null;
let stopGameDataListener = null;

const selectTheme = (theme) => {
    themeMenuOpen.value = false;
    settings.value.theme = theme;
    saveSettings(true);
};

const currentTheme = computed(() => THEMES.find((theme) => theme.id === settings.value.theme) ?? THEMES[0]);

const closeThemeMenuOnOutsideClick = (event) => {
    if (themePicker.value && !themePicker.value.contains(event.target)) themeMenuOpen.value = false;
};

const closeThemeMenuOnEscape = (event) => {
    if (event.key === 'Escape') themeMenuOpen.value = false;
};

const onSetupDone = () => {
    currentView.value = 'tasks';
    hideSetup.value = true;
};

const scheduleUpdate = () => {
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    taskTimer = setTimeout(async () => {
        try {
            await syncMonthlySubs();
        } catch (err) {
            console.error('Minute tick failed:', err);
        }
        scheduleUpdate();
    }, msUntilNextMinute);
};

const onExternalChange = async (reason) => {
    if (reason === 'dailiesCompleted') createNotification('success', 'Daily completed!', 1000);

    try {
        await reloadAccountsAndSettings();
    } catch (err) {
        console.error('Reloading accounts failed:', err);
    }
};

const onGameDataUpdated = async () => {
    try {
        await loadGameData();
        await loadAccounts();
    } catch (err) {
        console.error('Game data update failed:', err);
    }
};

const reloadPage = () => window.location.reload();

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

        if (!desktop) return;

        const style = getComputedStyle(document.documentElement);
        desktop.setTitleBarColors({
            color: style.getPropertyValue('--titlebar-bg').trim(),
            symbolColor: style.getPropertyValue('--titlebar-symbol').trim(),
        });
    },
    { immediate: true },
);

onMounted(async () => {
    document.addEventListener('mousedown', closeThemeMenuOnOutsideClick);
    document.addEventListener('keydown', closeThemeMenuOnEscape);
    stopGameDataListener = platform.gameData.onUpdated(onGameDataUpdated);

    try {
        await loadGameData();
        await loadAccounts();
    } catch (err) {
        console.error('Startup failed:', err);
        startupError.value = err.message;
        return;
    }

    hideSetup.value = gamesWithAccounts.value.length > 0;
    currentView.value = hideSetup.value ? 'tasks' : 'setup';
    scheduleUpdate();

    stopExternalChangeListener = platform.accounts.onExternalChange(onExternalChange);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', closeThemeMenuOnOutsideClick);
    document.removeEventListener('keydown', closeThemeMenuOnEscape);
    clearTimeout(taskTimer);
    if (settings.value.theme) document.documentElement.classList.remove(settings.value.theme);
    if (stopExternalChangeListener) stopExternalChangeListener();
    if (stopGameDataListener) stopGameDataListener();
});
</script>
