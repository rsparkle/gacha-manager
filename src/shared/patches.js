import { parseClock, parseMinutes, secondPhaseDay, shiftDate, toDateKey, zonedInstant } from './serverTime.js';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value) {
    if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;

    const time = Date.parse(`${value}T00:00:00Z`);

    return Number.isFinite(time) && toDateKey(time) === value;
}

export function isDated(patch) {
    return Boolean(patch?.version_start);
}

export function validatePatches(name, game) {
    const fail = (message) => {
        throw new Error(`${name}: ${message}`);
    };

    const patches = game.patches;

    if (!Array.isArray(patches) || patches.length === 0) fail('missing patches');

    let previousEnd = null;
    let undatedSeen = false;

    for (const [index, patch] of patches.entries()) {
        const where = `patches[${index}]`;

        if (!patch || typeof patch.version !== 'string' || patch.version === '') fail(`${where} needs a version`);

        if (!isDated(patch)) {
            undatedSeen = true;
            continue;
        }

        if (undatedSeen) fail(`${where} (${patch.version}) is dated but comes after a version-only row`);

        if (!isDateKey(patch.version_start)) {
            fail(`${where} (${patch.version}) version_start must be YYYY-MM-DD`);
        }

        if (!Number.isInteger(patch.version_duration) || patch.version_duration <= 0) {
            fail(`${where} (${patch.version}) version_duration must be a whole number above 0`);
        }

        if (previousEnd && patch.version_start < previousEnd) {
            fail(`${where} (${patch.version}) starts before the previous patch ends`);
        }

        previousEnd = patchEndDate(patch);
    }

    if (!patches.some(isDated)) fail('needs at least one dated patch');
}

export function patchStartDate(patch) {
    return toDateKey(patch.version_start);
}

export function patchSecondPhaseDate(patch) {
    return shiftDate(patchStartDate(patch), secondPhaseDay(patch));
}

export function patchEndDate(patch) {
    return shiftDate(patchStartDate(patch), patch.version_duration);
}

export function maintenanceMinutes(game, phase = 'first_phase') {
    const maintenance = game.maintenance?.[phase];

    if (!maintenance) return null;

    const start = parseClock(maintenance.start, `maintenance.${phase}.start`);

    return { start, open: start + parseMinutes(maintenance.duration, `maintenance.${phase}.duration`) };
}

export function currentPatchIndex(game, now = new Date()) {
    const patches = game.patches ?? [];
    const minutes = maintenanceMinutes(game)?.start ?? 0;
    let found = -1;

    for (const [index, patch] of patches.entries()) {
        if (!isDated(patch)) break;

        if (found === -1 || zonedInstant(patchStartDate(patch), minutes, game.global_utc_offset) <= now) {
            found = index;
        }
    }

    return found;
}

export function patchOn(game, dateKey) {
    const patches = game.patches ?? [];
    let found = null;

    for (const patch of patches) {
        if (!isDated(patch)) break;
        if (!found || patchStartDate(patch) <= dateKey) found = patch;
    }

    return found;
}

export function currentPatch(game, now = new Date()) {
    return game.patches?.[currentPatchIndex(game, now)] ?? null;
}

export function earliestPatchStart(game) {
    const first = (game.patches ?? []).find(isDated);

    return first ? patchStartDate(first) : null;
}
