import { DAY, MINUTE, localDate, parseClock } from '../serverTime.js';
import { anchoredWindow, applyResetWindow, dailyWindow, getLastDailyReset, monthlyWindow } from '../resetWindows.js';

export const CUSTOM_PREFIX = 'custom:';
export const CUSTOM_GAME_NAME = 'My Game';
export const CUSTOM_GAME_COLORS = [
    '#7aa2f7',
    '#9ece6a',
    '#e0af68',
    '#bb9af7',
    '#7dcfff',
    '#f7768e',
    '#73daca',
    '#ff9e64',
];
export const CUSTOM_GAME_NAME_MAX = 40;
export const CUSTOM_TASK_LABEL_MAX = 60;
export const CUSTOM_TASK_CATEGORY_MAX = 30;
export const CUSTOM_TASK_MAX_MINUTES = 366 * 24 * 60;
export const CUSTOM_TASK_MAX_WEEKS = 52;
export const RESET_CATEGORIES = { Daily: 'daily', Weekly: 'weekly', Monthly: 'monthly', Endgame: 'cycle' };

const CUSTOM_TASK_MAX_MS = CUSTOM_TASK_MAX_MINUTES * MINUTE;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isDateString(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function toInstant(value) {
    const time = typeof value === 'string' || value instanceof Date ? new Date(value).getTime() : NaN;

    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function isValidTimeZone(zone) {
    if (typeof zone !== 'string' || zone.length === 0) return false;

    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

export function currentTimeZone() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return isValidTimeZone(zone) ? zone : 'UTC';
}

export function resetKindForCategory(category) {
    const name = String(category ?? '')
        .trim()
        .toLowerCase();

    return Object.entries(RESET_CATEGORIES).find(([label]) => label.toLowerCase() === name)?.[1] ?? null;
}

function normalizeTime(time) {
    try {
        parseClock(time, 'time');
    } catch {
        throw new Error('Set a reset time');
    }

    return time;
}

const RESET_NORMALIZERS = {
    daily: (reset) => ({ time: normalizeTime(reset.time) }),

    weekly: (reset) => {
        const anchor = toInstant(reset.anchor);
        const everyWeeks = Number(reset.everyWeeks);

        if (!anchor) throw new Error('Set the first reset');
        if (!Number.isInteger(everyWeeks) || everyWeeks < 1 || everyWeeks > CUSTOM_TASK_MAX_WEEKS) {
            throw new Error(`Reset every 1 to ${CUSTOM_TASK_MAX_WEEKS} weeks`);
        }

        return { anchor, everyWeeks };
    },

    monthly: (reset) => {
        const days = Array.isArray(reset.monthDays) ? reset.monthDays.map(Number) : [];

        if (days.length === 0) throw new Error('Pick at least one day of the month');
        if (!days.every((day) => Number.isInteger(day) && day >= 1 && day <= 31)) {
            throw new Error('Days of the month go from 1 to 31');
        }

        return { time: normalizeTime(reset.time), monthDays: [...new Set(days)].sort((a, b) => a - b) };
    },

    cycle: (reset) => {
        const startsAt = toInstant(reset.startsAt);
        const endsAt = toInstant(reset.endsAt);

        if (!startsAt || !endsAt) throw new Error('Set a start and an end');

        const length = Date.parse(endsAt) - Date.parse(startsAt);

        if (length < MINUTE) throw new Error('The end must be after the start');
        if (length > CUSTOM_TASK_MAX_MS) throw new Error('A cycle can be at most 366 days long');

        return { startsAt, endsAt };
    },
};

export function normalizeCustomReset(reset) {
    if (!isPlainObject(reset) || !Object.hasOwn(RESET_NORMALIZERS, reset.kind)) {
        throw new Error('Unknown reset rule');
    }

    if (!isValidTimeZone(reset.zone)) throw new Error('Unknown time zone');

    return { kind: reset.kind, zone: reset.zone, ...RESET_NORMALIZERS[reset.kind](reset) };
}

function isValidCustomReset(reset) {
    try {
        normalizeCustomReset(reset);
        return true;
    } catch {
        return false;
    }
}

export function isCustomKey(key) {
    return typeof key === 'string' && key.startsWith(CUSTOM_PREFIX);
}

export function createCustomId() {
    return `${CUSTOM_PREFIX}${crypto.randomUUID()}`;
}

export function emptyCustomData() {
    return { games: {}, tasks: {} };
}

export function isValidCustomGame(game) {
    return (
        isPlainObject(game) &&
        isNonEmptyString(game.name, CUSTOM_GAME_NAME_MAX) &&
        typeof game.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(game.color)
    );
}

function hasValidDeadline(task) {
    return (
        isDateString(task.createdAt) &&
        isDateString(task.endsAt) &&
        Date.parse(task.endsAt) > Date.parse(task.createdAt)
    );
}

export function isValidCustomTask(task) {
    return (
        isPlainObject(task) &&
        isCustomKey(task.id) &&
        isNonEmptyString(task.label, CUSTOM_TASK_LABEL_MAX) &&
        isNonEmptyString(task.category, CUSTOM_TASK_CATEGORY_MAX) &&
        (task.reset === undefined ? hasValidDeadline(task) : isValidCustomReset(task.reset))
    );
}

export function isValidCustomData(custom) {
    if (!isPlainObject(custom) || !isPlainObject(custom.games) || !isPlainObject(custom.tasks)) return false;

    const gamesValid = Object.entries(custom.games).every(([key, game]) => isCustomKey(key) && isValidCustomGame(game));

    const tasksValid = Object.values(custom.tasks).every(
        (tasks) =>
            Array.isArray(tasks) &&
            tasks.every(isValidCustomTask) &&
            new Set(tasks.map((task) => task.id)).size === tasks.length,
    );

    return gamesValid && tasksValid;
}

export function normalizeCustomData(custom) {
    const normalizeTask = (task) => (task.reset ? { ...task, reset: normalizeCustomReset(task.reset) } : task);

    return {
        games: custom.games,
        tasks: Object.fromEntries(Object.entries(custom.tasks).map(([key, tasks]) => [key, tasks.map(normalizeTask)])),
    };
}

export function nextCustomGameName(takenNames) {
    const taken = new Set([...takenNames].map((name) => name.toLowerCase()));

    let name = CUSTOM_GAME_NAME;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${CUSTOM_GAME_NAME} ${i}`;

    return name;
}

export function nextCustomGameColor(usedColors) {
    const used = [...usedColors];
    const unused = CUSTOM_GAME_COLORS.find((color) => !used.includes(color));

    return unused ?? CUSTOM_GAME_COLORS[used.length % CUSTOM_GAME_COLORS.length];
}

export function customTaskEnd(minutes, now = new Date()) {
    return new Date(now.getTime() + minutes * MINUTE);
}

function localDay(instant, zone) {
    const local = localDate(instant, zone);

    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

function localTimeOfDay(instant, zone) {
    return localDate(instant, zone).getTime() - localDay(instant, zone);
}

function cycleDays({ zone, startsAt, endsAt }) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    if (localTimeOfDay(start, zone) !== localTimeOfDay(end, zone)) return null;

    return Math.round((localDay(end, zone) - localDay(start, zone)) / DAY);
}

export function customCycleLength(reset) {
    const days = cycleDays(reset);

    return days === null ? Date.parse(reset.endsAt) - Date.parse(reset.startsAt) : days * DAY;
}

function cycleWindow(reset, now) {
    const start = new Date(reset.startsAt);
    const end = new Date(reset.endsAt);

    if (now < start) return { last: start, next: end, isDisabled: true };

    const intervalDays = cycleDays(reset);

    if (intervalDays !== null) return anchoredWindow({ now, anchor: start, intervalDays, zone: reset.zone });

    const length = end - start;
    const last = new Date(start.getTime() + Math.floor((now - start) / length) * length);

    return { last, next: new Date(last.getTime() + length) };
}

function resetWindow(reset, now) {
    switch (reset.kind) {
        case 'weekly':
            return anchoredWindow({
                now,
                anchor: new Date(reset.anchor),
                intervalDays: reset.everyWeeks * 7,
                zone: reset.zone,
            });
        case 'cycle':
            return cycleWindow(reset, now);
        default: {
            const server = { zone: reset.zone, resetMinutes: parseClock(reset.time, 'time') };
            const context = { now, server, reset, lastDailyReset: getLastDailyReset(now, server) };

            return reset.kind === 'monthly' ? monthlyWindow(context) : dailyWindow(context);
        }
    }
}

export function computeCustomTask(task, lastCompleted, now = new Date()) {
    const computed = {
        id: task.id,
        label: task.label,
        type: task.category,
        custom: true,
        last_completed: lastCompleted ?? null,
    };

    if (task.reset) {
        const window = resetWindow(task.reset, now);

        computed.reset = structuredClone(task.reset);
        computed.ended = false;
        applyResetWindow(computed, window, now);

        return computed;
    }

    const endsAt = Date.parse(task.endsAt);
    const ended = now.getTime() >= endsAt;
    const isCompleted = lastCompleted != null;

    return {
        ...computed,
        endsAt: task.endsAt,
        ended,
        isCompleted,
        isDisabled: ended && !isCompleted,
        duration: ended ? 0 : endsAt - Date.parse(task.createdAt),
        nextReset: ended ? 0 : endsAt - now.getTime(),
    };
}
