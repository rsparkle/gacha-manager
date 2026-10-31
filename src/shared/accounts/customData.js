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

const MINUTE_MS = 60_000;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isDateString(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
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

export function isValidCustomTask(task) {
    return (
        isPlainObject(task) &&
        isCustomKey(task.id) &&
        isNonEmptyString(task.label, CUSTOM_TASK_LABEL_MAX) &&
        isNonEmptyString(task.category, CUSTOM_TASK_CATEGORY_MAX) &&
        isDateString(task.createdAt) &&
        isDateString(task.endsAt) &&
        Date.parse(task.endsAt) > Date.parse(task.createdAt)
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
    return new Date(now.getTime() + minutes * MINUTE_MS);
}

export function computeCustomTask(task, lastCompleted, now = new Date()) {
    const endsAt = Date.parse(task.endsAt);
    const ended = now.getTime() >= endsAt;
    const isCompleted = lastCompleted != null;

    return {
        id: task.id,
        label: task.label,
        type: task.category,
        custom: true,
        endsAt: task.endsAt,
        last_completed: lastCompleted ?? null,
        ended,
        isCompleted,
        isDisabled: ended && !isCompleted,
        duration: ended ? 0 : endsAt - Date.parse(task.createdAt),
        nextReset: ended ? 0 : endsAt - now.getTime(),
    };
}
