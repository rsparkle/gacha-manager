import { createResetProcessor } from './resetProcessor.js';
import { ASSETS_BASE, GAME_CONFIG_PATH, GAME_TASKS_PATH, INDEPENDENT_EVENTS_PATH } from './gameData.js';
import { fetchJson } from './remote.js';

export function validateGameData({ config, tasks }) {
    createResetProcessor(config, tasks);
}

const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const fetchAssetsFile = (relativePath) => fetchJson(`${ASSETS_BASE}/${relativePath}`);

export function createGameDataLoader({
    readCache,
    writeCache,
    onUpdate,
    onRejected = () => {},
    readSource = fetchAssetsFile,
}) {
    let current = null;
    let rejected = null;
    let refreshing = null;

    async function fetchRemote() {
        const [config, tasks, independentEvents] = await Promise.all([
            readSource(GAME_CONFIG_PATH),
            readSource(GAME_TASKS_PATH),
            readSource(INDEPENDENT_EVENTS_PATH).catch(() => current?.independentEvents ?? []),
        ]);

        return { config, tasks, independentEvents };
    }

    async function cache(data) {
        try {
            await writeCache(data);
        } catch (err) {
            console.error('Failed to cache game data:', err);
        }
    }

    async function load() {
        try {
            const data = await readCache();

            validateGameData(data);
            current = data;

            return { ...data, fromCache: true };
        } catch (cacheError) {
            try {
                const data = await fetchRemote();

                validateGameData(data);
                await cache(data);
                current = data;

                return { ...data, fromCache: false };
            } catch (remoteError) {
                throw new Error(
                    `Failed to load game data.\n\nOnline: ${remoteError.message}\nCached: ${cacheError.message}`,
                    { cause: remoteError },
                );
            }
        }
    }

    async function update() {
        let data;

        try {
            data = await fetchRemote();
        } catch (err) {
            console.error('Game data refresh failed:', err);
            return;
        }

        if (sameData(data, current) || sameData(data, rejected)) return;

        try {
            validateGameData(data);
        } catch (err) {
            rejected = data;
            console.error('Game data update rejected:', err);
            onRejected(err);
            return;
        }

        rejected = null;
        current = data;

        await cache(data);

        try {
            onUpdate(data);
        } catch (err) {
            console.error('Failed to apply game data:', err);
        }
    }

    function refresh() {
        refreshing ??= update().finally(() => {
            refreshing = null;
        });

        return refreshing;
    }

    return {
        load,
        refresh,
        get current() {
            return current;
        },
    };
}
