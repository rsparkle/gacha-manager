import { currentPatchIndex, maintenanceMinutes, patchStartDate } from './patches.js';
import { zonedInstant } from './serverTime.js';

export function getLiveVersion(game, now = new Date()) {
    const patches = game.patches ?? [];
    const index = currentPatchIndex(game, now);
    const current = patches[index];

    if (!current) return null;

    const minutes = maintenanceMinutes(game);

    if (!minutes) return current.version;

    const opensAt = zonedInstant(patchStartDate(current), minutes.open, game.global_utc_offset);

    return now < opensAt ? (patches[index - 1]?.version ?? current.version) : current.version;
}
