import { ASSETS_BASE, GAME_CONFIG_PATH, GAME_TASKS_PATH, INDEPENDENT_EVENTS_PATH, STATUS_PATH } from './gameData.js';

export const CONFIG_URL = `${ASSETS_BASE}/${GAME_CONFIG_PATH}`;
export const TASKS_URL = `${ASSETS_BASE}/${GAME_TASKS_PATH}`;
export const INDEPENDENT_EVENTS_URL = `${ASSETS_BASE}/${INDEPENDENT_EVENTS_PATH}`;
export const STATUS_URL = `${ASSETS_BASE}/${STATUS_PATH}`;
export const RELEASES_URL = 'https://github.com/rsparkle/gacha-manager/releases/latest';
export const REPORT_URL =
    'https://script.google.com/macros/s/AKfycbwFgg5dGC6O2RB6Zef9LRSdF-IKkTPYTzPi2h9gTG3SXIq1X2u7GFV18qQayMv9nGEf/exec';
export const REPORT_ORIGINS = ['https://script.google.com', 'https://script.googleusercontent.com'];

export const MISSING_ASSET_RETRY_MS = 6 * 60 * 60 * 1000;
export const NETWORK_RETRY_MS = 60 * 1000;
export const GAME_DATA_REFRESH_MS = 6 * 60 * 60 * 1000;

export function encodePath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
}

export function assetUrl(relativePath) {
    return `${ASSETS_BASE}/${encodePath(relativePath)}`;
}

export async function fetchWithTimeout(url, ms = 5000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);

    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

export async function fetchJson(url) {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
}
