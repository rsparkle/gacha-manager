import {
    DAY,
    HOUR,
    MINUTE,
    addDays,
    compileGameClock,
    localDate,
    mod,
    parseClock,
    secondPhaseDay,
    shiftDate,
    toDateKey,
    zonedInstant,
} from './serverTime.js';

const LITERAL_TIME = /^(\d{1,2}:\d{2})@(server|global)$/;
const PATCH_DATE = /^(patchStart|secondPhase|patchEnd)([+-]\d+)?$/;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

const TIMES = ['dailyReset', 'maintenanceStart', 'maintenanceEnd', 'secondPhase', 'eventStart', 'eventEnd'];
const CONFIG_KEYS = { eventStart: 'event_start', eventEnd: 'event_end' };

const KIND_FIELDS = {
    daily: [],
    weekly: ['weekday'],
    monthly: ['monthDays'],
    interval: ['anchor', 'intervalDays', 'startTime', 'patchCollision'],
    window: ['startDate', 'endDate', 'startTime', 'endTime'],
};

export function createResetProcessor(GAME_CONFIG, GAME_TASKS) {
    const CLOCKS = new Map();

    function literalTime(time) {
        const match = LITERAL_TIME.exec(time);

        return match ? { minutes: parseClock(match[1], 'time'), scope: match[2] } : null;
    }

    function clockFor(time, { clock, server }) {
        const scoped = (spec) => ({
            minutes: spec.minutes,
            offset: spec.scope === 'server' ? server.offset : clock.globalOffset,
        });

        const literal = literalTime(time);

        if (literal) return scoped(literal);

        const maintenance = clock.maintenance.first_phase;

        switch (time) {
            case 'maintenanceStart':
                return { minutes: maintenance.startMinutes, offset: clock.globalOffset };
            case 'maintenanceEnd':
                return { minutes: maintenance.startMinutes + maintenance.durationMinutes, offset: clock.globalOffset };
            case 'secondPhase':
                return scoped(clock.secondPhase);
            case 'eventStart':
                return scoped(clock.eventStart);
            case 'eventEnd':
                return scoped(clock.eventEnd);
            default:
                return { minutes: server.resetMinutes, offset: server.offset };
        }
    }

    function atLabel(label, time, context) {
        const { minutes, offset } = clockFor(time, context);

        return zonedInstant(toDateKey(label), minutes, offset);
    }

    function resolveDate(value, { gameConfig }) {
        const match = PATCH_DATE.exec(value);

        if (!match) return value;

        const patch = gameConfig.current;
        const patchStart = toDateKey(patch.version_start);
        const base = {
            patchStart,
            secondPhase: shiftDate(patchStart, secondPhaseDay(patch)),
            patchEnd: shiftDate(patchStart, patch.version_duration),
        }[match[1]];

        return shiftDate(base, Number(match[2] ?? 0));
    }

    function getNextPatchMaintenanceStart(context) {
        return atLabel(resolveDate('patchEnd', context), 'maintenanceStart', context);
    }

    function getLastDailyReset(now, server) {
        const offsetMs = server.offset * HOUR;
        const localDayStart = Math.floor((now.getTime() + offsetMs) / DAY) * DAY;
        const reset = localDayStart + server.resetMinutes * MINUTE - offsetMs;

        return new Date(reset > now.getTime() ? reset - DAY : reset);
    }

    function getWeeklyWindow({ gameConfig, lastDailyReset, server, reset }) {
        const weekday = reset.weekday ?? gameConfig.weekly_reset_weekday;
        const serverWeekday = localDate(lastDailyReset, server.offset).getUTCDay();
        const last = addDays(lastDailyReset, -mod(serverWeekday - weekday, 7));

        return { last, next: addDays(last, 7) };
    }

    function getMonthlyWindow({ now, server, lastDailyReset, reset }) {
        const local = localDate(lastDailyReset, server.offset);
        const year = local.getUTCFullYear();
        const month = local.getUTCMonth();
        const boundaries = [];

        for (const offset of [-1, 0, 1]) {
            const monthLength = new Date(Date.UTC(year, month + offset + 1, 0)).getUTCDate();

            for (const day of reset.monthDays) {
                boundaries.push(
                    new Date(
                        Date.UTC(year, month + offset, Math.min(day, monthLength), 0, server.resetMinutes) -
                            server.offset * HOUR,
                    ),
                );
            }
        }

        boundaries.sort((a, b) => a - b);

        const nextIndex = boundaries.findIndex((date) => date > now);

        return {
            last: boundaries[nextIndex - 1],
            next: boundaries[nextIndex],
        };
    }

    function getIntervalWindow(context) {
        const { now, reset } = context;

        const anchor = atLabel(reset.anchor, reset.startTime ?? 'dailyReset', context);
        const intervalMs = reset.intervalDays * DAY;
        const cycles = Math.floor((now - anchor) / intervalMs);

        const last = new Date(anchor.getTime() + cycles * intervalMs);

        let next = addDays(last, reset.intervalDays);

        if (reset.patchCollision) {
            const maintenanceStart = getNextPatchMaintenanceStart(context);

            if (Math.abs(next.getTime() - maintenanceStart.getTime()) <= DAY) {
                next = maintenanceStart;
            }
        }

        return { last, next, isDisabled: now >= next };
    }

    function getWindow(context) {
        const { now, reset } = context;

        const last = atLabel(resolveDate(reset.startDate, context), reset.startTime ?? 'eventStart', context);
        const next = reset.endDate
            ? atLabel(resolveDate(reset.endDate, context), reset.endTime ?? 'eventEnd', context)
            : null;

        return {
            last,
            next,
            isDisabled: now < last || (next !== null && now >= next),
        };
    }

    const RESET_HANDLERS = {
        daily: ({ lastDailyReset }) => ({
            last: lastDailyReset,
            next: addDays(lastDailyReset, 1),
        }),
        weekly: getWeeklyWindow,
        monthly: getMonthlyWindow,
        interval: getIntervalWindow,
        window: getWindow,
    };

    function validateTime(time, taskId, clock) {
        if (LITERAL_TIME.test(time)) {
            try {
                literalTime(time);
            } catch {
                throw new Error(`Invalid time "${time}" for task: ${taskId}`);
            }

            return;
        }

        if (!TIMES.includes(time)) {
            throw new Error(`Invalid time "${time}" for task: ${taskId}`);
        }

        if (CONFIG_KEYS[time] && !clock[time]) {
            throw new Error(`Task ${taskId} uses ${time}, but the game has no ${CONFIG_KEYS[time]} setting`);
        }
    }

    function validateReset(reset, taskId, clock, gameConfig) {
        const fail = () => {
            throw new Error(`Invalid reset configuration for task: ${taskId}`);
        };

        if (!reset || !Object.hasOwn(RESET_HANDLERS, reset.kind)) fail();

        for (const key of Object.keys(reset)) {
            if (key !== 'kind' && !KIND_FIELDS[reset.kind].includes(key)) {
                throw new Error(`Task ${taskId}: "${key}" is not used by kind "${reset.kind}"`);
            }
        }

        const validWeekday = (value) => Number.isInteger(value) && value >= 0 && value <= 6;
        const validDay = (day) => Number.isInteger(day) && day >= 1 && day <= 31;
        const validDate = (value) =>
            typeof value === 'string' && PLAIN_DATE.test(value) && Number.isFinite(Date.parse(value));
        const validWindowDate = (value) => typeof value === 'string' && (PATCH_DATE.test(value) || validDate(value));

        if (reset.kind === 'weekly') {
            if (reset.weekday === undefined && gameConfig.weekly_reset_weekday === undefined) {
                throw new Error(`Task ${taskId} has no weekday and the game has no weekly_reset_weekday setting`);
            }

            if (!validWeekday(reset.weekday ?? gameConfig.weekly_reset_weekday)) fail();
        }

        if (
            reset.kind === 'monthly' &&
            (!Array.isArray(reset.monthDays) || !reset.monthDays.length || !reset.monthDays.every(validDay))
        ) {
            fail();
        }

        if (reset.kind === 'interval') {
            if (
                !validDate(reset.anchor) ||
                !Number.isInteger(reset.intervalDays) ||
                reset.intervalDays <= 0 ||
                (reset.patchCollision !== undefined && typeof reset.patchCollision !== 'boolean')
            ) {
                fail();
            }

            validateTime(reset.startTime ?? 'dailyReset', taskId, clock);
        }

        if (reset.kind === 'window') {
            if (!validWindowDate(reset.startDate) || (reset.endDate != null && !validWindowDate(reset.endDate))) {
                throw new Error(`Invalid window dates for task: ${taskId}`);
            }

            validateTime(reset.startTime ?? 'eventStart', taskId, clock);
            validateTime(reset.endTime ?? 'eventEnd', taskId, clock);
        }
    }

    for (const gameName of Object.keys(GAME_TASKS)) {
        if (!GAME_CONFIG[gameName]) {
            throw new Error(`Missing game configuration: ${gameName}`);
        }
    }

    for (const [gameName, gameConfig] of Object.entries(GAME_CONFIG)) {
        if (!GAME_TASKS[gameName]) {
            throw new Error(`Missing task configuration: ${gameName}`);
        }

        CLOCKS.set(gameName, compileGameClock(gameName, gameConfig));
    }

    const tasksByGame = new Map();

    for (const [gameName, gameTasks] of Object.entries(GAME_TASKS)) {
        const tasks = new Map();

        for (const task of gameTasks.tasks) {
            if (tasks.has(task.id)) {
                throw new Error(`Duplicate task ID: ${task.id}`);
            }

            validateReset(task.reset, task.id, CLOCKS.get(gameName), GAME_CONFIG[gameName]);
            tasks.set(task.id, task);
        }

        tasksByGame.set(gameName, tasks);
    }

    function serverContext(gameName, serverName, now) {
        const clock = CLOCKS.get(gameName);
        const server = clock?.servers[serverName];

        if (!server) {
            throw new Error(`Unknown server for ${gameName} / ${serverName}`);
        }

        return {
            now,
            gameConfig: GAME_CONFIG[gameName],
            clock,
            server,
            lastDailyReset: getLastDailyReset(now, server),
        };
    }

    function getResetWindow(gameName, taskId, context) {
        const definition = tasksByGame.get(gameName)?.get(taskId);

        if (!definition) {
            throw new Error(`Unknown task: ${gameName} / ${taskId}`);
        }

        const reset = definition.reset;
        const resetWindow = RESET_HANDLERS[reset.kind]({ ...context, reset });
        const { last, next } = resetWindow;

        if (!Number.isFinite(last?.getTime())) {
            throw new Error(`Invalid reset start for task: ${taskId}`);
        }

        if (next !== null && (!Number.isFinite(next?.getTime()) || next <= last)) {
            throw new Error(`Invalid reset end for task: ${taskId}`);
        }

        return resetWindow;
    }

    function disableTask(task) {
        task.isDisabled = true;
        task.duration = 0;
        task.nextReset = 0;
        task.isCompleted = false;
    }

    function applyResetWindow(task, { last, next, isDisabled }, now) {
        task.isDisabled = Boolean(isDisabled);

        task.duration = task.isDisabled ? 0 : next ? next - last : null;

        task.nextReset = task.isDisabled ? 0 : next ? next - now : null;

        const completedAt = task.last_completed == null ? NaN : new Date(task.last_completed).getTime();

        task.isCompleted =
            !task.isDisabled &&
            Number.isFinite(completedAt) &&
            completedAt >= last.getTime() &&
            (next === null || completedAt < next.getTime()) &&
            completedAt <= now.getTime();
    }

    function assertValidNow(now) {
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
            throw new Error('Invalid current date');
        }
    }

    function computeSingleAccountResetData(account, gameName, now = new Date()) {
        assertValidNow(now);

        const tasks = Object.values(account.tasks).flat();
        let context;

        try {
            context = serverContext(gameName, account.server, now);
        } catch (err) {
            console.error(err.message);
            tasks.forEach(disableTask);
            return account;
        }

        for (const task of tasks) {
            try {
                applyResetWindow(task, getResetWindow(gameName, task.id, context), now);
            } catch (err) {
                console.error(err.message);
                disableTask(task);
            }
        }

        return account;
    }

    function dryRun(now = new Date()) {
        for (const [gameName, tasks] of tasksByGame) {
            for (const serverName of Object.keys(CLOCKS.get(gameName).servers)) {
                const context = serverContext(gameName, serverName, now);

                for (const taskId of tasks.keys()) {
                    getResetWindow(gameName, taskId, context);
                }
            }
        }
    }

    dryRun();

    function computeTaskResetData(gameGroups, now = new Date()) {
        gameGroups.forEach((gameGroup) => {
            gameGroup.accounts.forEach((account) => {
                computeSingleAccountResetData(account, gameGroup.name, now);
            });
        });

        return gameGroups;
    }

    function getLastDailyResetFor(gameName, serverName, now = new Date()) {
        const server = CLOCKS.get(gameName)?.servers[serverName];

        if (!server) {
            throw new Error(`Unknown server for ${gameName} / ${serverName}`);
        }

        return getLastDailyReset(now, server);
    }

    return { computeTaskResetData, computeSingleAccountResetData, getLastDailyReset: getLastDailyResetFor };
}
