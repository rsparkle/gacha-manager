import { DAY, addZonedDays, localDate, mod, shiftDate, toDateKey, zonedInstant } from './serverTime.js';

export function getLastDailyReset(now, server) {
    const today = toDateKey(localDate(now, server.zone));
    const reset = zonedInstant(today, server.resetMinutes, server.zone);

    return reset > now ? zonedInstant(shiftDate(today, -1), server.resetMinutes, server.zone) : reset;
}

export function dailyWindow({ lastDailyReset, server }) {
    return {
        last: lastDailyReset,
        next: addZonedDays(lastDailyReset, 1, server.zone),
    };
}

export function weeklyWindow({ gameConfig, lastDailyReset, server, reset }) {
    const weekday = reset.weekday ?? gameConfig.weekly_reset_weekday;
    const serverWeekday = localDate(lastDailyReset, server.zone).getUTCDay();
    const last = addZonedDays(lastDailyReset, -mod(serverWeekday - weekday, 7), server.zone);

    return { last, next: addZonedDays(last, 7, server.zone) };
}

export function monthlyWindow({ now, server, lastDailyReset, reset }) {
    const local = localDate(lastDailyReset, server.zone);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const boundaries = [];

    for (const shift of [-1, 0, 1]) {
        const monthLength = new Date(Date.UTC(year, month + shift + 1, 0)).getUTCDate();

        for (const day of reset.monthDays) {
            const dateKey = toDateKey(Date.UTC(year, month + shift, Math.min(day, monthLength)));

            boundaries.push(zonedInstant(dateKey, server.resetMinutes, server.zone));
        }
    }

    boundaries.sort((a, b) => a - b);

    const nextIndex = boundaries.findIndex((date) => date > now);

    return {
        last: boundaries[nextIndex - 1],
        next: boundaries[nextIndex],
    };
}

export function anchoredWindow({ now, anchor, intervalDays, zone }) {
    const cycles = Math.floor((now - anchor) / (intervalDays * DAY));

    let last = addZonedDays(anchor, cycles * intervalDays, zone);

    if (last > now) last = addZonedDays(last, -intervalDays, zone);

    let next = addZonedDays(last, intervalDays, zone);

    if (next <= now) {
        last = next;
        next = addZonedDays(last, intervalDays, zone);
    }

    return { last, next };
}

export function applyResetWindow(task, { last, next, isDisabled }, now) {
    task.isDisabled = Boolean(isDisabled);

    task.duration = task.isDisabled ? 0 : next ? next - last : null;

    task.nextReset = task.isDisabled ? 0 : next ? next - now : null;

    task.startsIn = task.isDisabled && last > now ? last - now : null;

    const completedAt = task.last_completed == null ? NaN : new Date(task.last_completed).getTime();

    task.isCompleted =
        !task.isDisabled &&
        Number.isFinite(completedAt) &&
        completedAt >= last.getTime() &&
        (next === null || completedAt < next.getTime()) &&
        completedAt <= now.getTime();
}
