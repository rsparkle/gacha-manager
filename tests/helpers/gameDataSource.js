import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ASSETS_BASE,
    GAME_CONFIG_PATH,
    GAME_CONFIG_VERSION,
    GAME_TASKS_PATH,
    GAME_TASKS_VERSION,
} from '../../src/shared/gameData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/game-data');
export const DATA_VERSION_LABEL = `config-v${GAME_CONFIG_VERSION}.tasks-v${GAME_TASKS_VERSION}`;

function readJson(file) {
    if (!fs.existsSync(file)) {
        throw new Error(`Missing ${path.relative(ROOT, file)}: copy it from gacha-manager-assets`);
    }

    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function readDataDir(dir) {
    return {
        config: readJson(path.join(dir, GAME_CONFIG_PATH)),
        tasks: readJson(path.join(dir, GAME_TASKS_PATH)),
    };
}

export function loadFixtureGameData() {
    return {
        source: `fixture ${DATA_VERSION_LABEL}`,
        ...readDataDir(FIXTURE_DIR),
        now: new Date(readJson(path.join(FIXTURE_DIR, 'meta.json')).now),
    };
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) throw new Error(`${url} returned ${response.status}`);

    return response.json();
}

export async function loadGameData() {
    const source = process.env.GAME_DATA_SOURCE ?? 'fixture';

    if (source === 'fixture') return loadFixtureGameData();

    if (source === 'remote') {
        const [config, tasks] = await Promise.all([
            fetchJson(`${ASSETS_BASE}/${GAME_CONFIG_PATH}`),
            fetchJson(`${ASSETS_BASE}/${GAME_TASKS_PATH}`),
        ]);

        return { source: `remote ${DATA_VERSION_LABEL}`, config, tasks, now: new Date() };
    }

    const dir = path.resolve(ROOT, source);

    return { source: `${dir} ${DATA_VERSION_LABEL}`, ...readDataDir(dir), now: new Date() };
}
