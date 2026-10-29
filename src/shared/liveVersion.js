import { currentPatchIndex, isDated, maintenanceMinutes, patchEndDate, patchStartDate } from './patches.js';
import { zonedInstant } from './serverTime.js';

export function getLiveVersion(game, now = new Date()) {
    const patches = game.patches ?? [];
    const index = currentPatchIndex(game, now);
    const current = patches[index];

    if (!current) return null;

    const minutes = maintenanceMinutes(game);

    if (!minutes) return current.version;

    const opensAt = (dateKey) => zonedInstant(dateKey, minutes.open, game.global_utc_offset);

    if (now < opensAt(patchStartDate(current))) {
        return patches[index - 1]?.version ?? current.version;
    }

    const successor = patches[index + 1];

    if (successor && !isDated(successor) && now >= opensAt(patchEndDate(current))) {
        return successor.version;
    }

    return current.version;
}
