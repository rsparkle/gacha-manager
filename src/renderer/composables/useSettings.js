import { ref } from 'vue';
import { config } from '../config.js';
import { useNotification } from './useNotification.js';

const { createNotification } = useNotification();

const settings = ref({});
const showSettings = ref(false);

function normalizeArrayMap(map) {
    if (!map || typeof map !== 'object') return {};
    return Object.fromEntries(
        Object.entries(map).map(([gameId, value]) => [
            gameId,
            Array.isArray(value) ? value : Object.values(value ?? {}),
        ]),
    );
}

async function loadSettings() {
    const res = await window.api.loadSettings();
    const loaded = res.success ? { ...config.settings, ...res.data } : { ...config.settings };

    loaded.automaticDailies = normalizeArrayMap(loaded.automaticDailies);
    loaded.windowsNotifications = normalizeArrayMap(loaded.windowsNotifications);

    settings.value = loaded;
}

loadSettings();

export function useSettings() {
    async function saveSettings(silent = false, nextSettings = settings.value) {
        try {
            const response = await window.api.saveSettings(JSON.parse(JSON.stringify(nextSettings)));

            if (response.success) Object.assign(settings.value, nextSettings);

            if (!silent) {
                if (response.success) {
                    createNotification('success', 'Settings saved!', 2000);
                } else {
                    createNotification('error', `Error: ${response.error || 'Unknown error'}`, 2000);
                }
            }

            return response;
        } catch (err) {
            createNotification('error', `Critical Error: ${err.message}`, 2000);
            return null;
        }
    }

    function toggleSetting(map, gameId, accountId) {
        if (!Array.isArray(map[gameId])) map[gameId] = [];
        const idx = map[gameId].indexOf(accountId);
        if (idx === -1) map[gameId].push(accountId);
        else map[gameId].splice(idx, 1);
    }

    return { settings, showSettings, saveSettings, loadSettings, toggleSetting };
}
