import { parseClock, parseMinutes, shiftDate, toDateKey, zonedInstant } from './serverTime.js';

export function getLiveVersion(game, now = new Date()) {
    const { current, next } = game;
    const maintenance = game.maintenance?.first_phase;

    if (!next?.version || !maintenance) return current.version;

    const openMinutes =
        parseClock(maintenance.start, 'maintenance start') + parseMinutes(maintenance.duration, 'maintenance duration');

    const nextStart = shiftDate(toDateKey(current.version_start), current.version_duration);
    const nextOpensAt = zonedInstant(nextStart, openMinutes, game.global_utc_offset);

    if (now < nextOpensAt) return current.version;

    if (next.future_livestream_version && next.version_duration) {
        const afterNextOpensAt = zonedInstant(
            shiftDate(nextStart, next.version_duration),
            openMinutes,
            game.global_utc_offset,
        );

        if (now >= afterNextOpensAt) return next.future_livestream_version;
    }

    return next.version;
}
