import { ref } from 'vue';
import platform from '#platform';
import { DEFAULT_SETTINGS } from '../../shared/settings.js';
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
    let stored = {};

    try {
        stored = await platform.settings.load();
    } catch (err) {
        console.error('Failed to load settings:', err);
    }

    const loaded = { ...DEFAULT_SETTINGS, ...stored };

    loaded.automaticDailies = normalizeArrayMap(loaded.automaticDailies);
    loaded.windowsNotifications = normalizeArrayMap(loaded.windowsNotifications);

    settings.value = loaded;
}

loadSettings();

export function useSettings() {
    async function saveSettings(silent = false, nextSettings = settings.value) {
        let result;

        try {
            result = await platform.settings.save(JSON.parse(JSON.stringify(nextSettings)));
        } catch (err) {
            createNotification('error', `Error: ${err.message}`, 2000);
            return null;
        }

        Object.assign(settings.value, nextSettings);

        if (!silent) {
            if (result.notificationsBlocked) {
                createNotification('error', 'Notifications are blocked for this site in your browser', 3000);
            } else {
                createNotification('success', 'Settings saved!', 2000);
            }
        }

        return result;
    }

    function toggleSetting(map, gameId, accountId) {
        if (!Array.isArray(map[gameId])) map[gameId] = [];
        const idx = map[gameId].indexOf(accountId);
        if (idx === -1) map[gameId].push(accountId);
        else map[gameId].splice(idx, 1);
    }

    return { settings, showSettings, saveSettings, loadSettings, toggleSetting };
}
