import { shiftDate } from '../../src/shared/serverTime.js';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function merge(base, overrides) {
    const result = structuredClone(base);

    for (const [key, value] of Object.entries(overrides ?? {})) {
        if (value === undefined) {
            delete result[key];
        } else if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = merge(result[key], value);
        } else {
            result[key] = structuredClone(value);
        }
    }

    return result;
}

export function patch(version, version_start, extra = {}) {
    return {
        version,
        version_start,
        version_duration: 42,
        second_phase_offset: -1,
        phase_characters: { 1: [], 2: [] },
        is_version_duration_confirmed: true,
        livestream_date: null,
        special_phases: [],
        ...extra,
    };
}

export const BASE_GAME = {
    abbr: 'TG',
    process: 'TestGame.exe',
    color: '#123456',
    monthlySub: 'Test Pass',
    patches: [patch('1.0', '2026-08-26'), patch('1.1', '2026-10-07'), patch('1.2', '2026-11-18'), { version: '1.3' }],
    has_uid_pattern: true,
    uid_digits: [9],
    global_utc_offset: 8,
    daily_reset: '04:00',
    weekly_reset_weekday: 1,
    maintenance: {
        first_phase: { start: '06:00', duration: '05:00' },
    },
    second_phase: { time: '18:00', scope: 'server' },
    event_start: { time: '10:00', scope: 'server' },
    event_end: { time: '03:59', scope: 'server' },
    livestream: { is_predictable: true, schedule: 'hoyo', time: '20:00' },
    character_trailer: { time: '12:00', distance: 1 },
    drip: {
        anchor: 'patch',
        time: '12:00',
        week_start_rule: true,
        distance: 7,
        same_day: false,
        confirmed: true,
    },
    servers: {
        America: { uid_prefix: 6, utc_offset: -5 },
        Europe: { uid_prefix: 7, utc_offset: 1 },
        Asia: { uid_prefix: 8, utc_offset: 8 },
    },
};

export const DST_SERVERS = {
    America: { uid_prefix: null, timezone: 'America/New_York' },
    Europe: { uid_prefix: null, timezone: 'Europe/Berlin' },
    Asia: { uid_prefix: null, utc_offset: 8 },
};

const SLOTS = ['previous', 'current', 'next', 'after'];

export function makeGame(overrides = {}) {
    const slots = SLOTS.map((slot) => overrides[slot]);
    const game = merge(
        BASE_GAME,
        Object.fromEntries(Object.entries(overrides).filter(([key]) => !SLOTS.includes(key))),
    );

    if (overrides.patches) return game;

    game.patches = game.patches.map((entry, index) => merge(entry, slots[index]));

    const [previous, current, next] = game.patches;

    if (slots[0]?.version_start === undefined) {
        previous.version_start = shiftDate(current.version_start, -previous.version_duration);
    }

    if (slots[2]?.version_start === undefined) {
        next.version_start = shiftDate(current.version_start, current.version_duration);
    }

    return game;
}

export function makeConfig(games) {
    return Object.fromEntries(Object.entries(games).map(([name, overrides]) => [name, makeGame(overrides)]));
}

export function makeTask(id, reset, extra = {}) {
    return { id, label: id, type: 'Daily', reset, ...extra };
}

export function makeTasks(tasksByGame) {
    return Object.fromEntries(Object.entries(tasksByGame).map(([name, tasks]) => [name, { tasks }]));
}

export function makeAccount(gameTasks, { server = 'Asia', completed = {} } = {}) {
    const tasks = {};

    for (const task of gameTasks.tasks) {
        (tasks[task.type] ??= []).push({ ...task, last_completed: completed[task.id] ?? null });
    }

    return { id: 'account-1', server, tasks };
}

export function taskById(account, id) {
    return Object.values(account.tasks)
        .flat()
        .find((task) => task.id === id);
}

export function iso(value) {
    return new Date(value).toISOString();
}
