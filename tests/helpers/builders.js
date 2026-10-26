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

function patch(version, extra = {}) {
    return {
        version,
        version_duration: 42,
        second_phase_offset: -1,
        phase_characters: { 1: [], 2: [] },
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
    previous: patch('1.0'),
    current: patch('1.1', { version_start: '2026-10-07', is_version_duration_confirmed: true }),
    next: patch('1.2', { future_livestream_version: '1.3', is_version_duration_confirmed: true }),
    has_uid_pattern: true,
    uid_digits: 9,
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

export function makeGame(overrides = {}) {
    return merge(BASE_GAME, overrides);
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
