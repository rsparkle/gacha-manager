export function createResetProcessor(GAME_CONFIG, GAME_TASKS) {
  const MS_IN_DAY = 86_400_000;

  function addDays(date, days) {
    return new Date(date.getTime() + days * MS_IN_DAY);
  }

  function getTime(time, gameConfig, resetHour) {
    if (time === 'dailyReset') return [resetHour, 0];

    if (time === 'maintenanceStart') {
      return gameConfig.maintenance_start;
    }

    if (time === 'maintenanceEnd') {
      const [hour, minute] = gameConfig.maintenance_start;
      const [durationHours, durationMinutes] = gameConfig.maintenance_duration;
      const totalMinutes = hour * 60 + minute + durationHours * 60 + durationMinutes;

      return [
        Math.floor(totalMinutes / 60) % 24,
        totalMinutes % 60
      ];
    }

    throw new Error(`Unknown reset time: ${time}`);
  }

  function atTime(date, time, context) {
    const result = new Date(date);
    const [hour, minute] = getTime(time, context.gameConfig, context.resetHour);

    result.setUTCHours(hour, minute, 0, 0);

    return result;
  }

  function getLastDailyReset(now, resetHour) {
    const last = new Date(now);
    last.setUTCHours(resetHour, 0, 0, 0);

    return last > now ? addDays(last, -1) : last;
  }

  function getWeeklyWindow({ lastDailyReset, reset }) {
    const daysSinceReset = (lastDailyReset.getUTCDay() - reset.weekday + 7) % 7;
    const last = addDays(lastDailyReset, -daysSinceReset);

    return { last, next: addDays(last, 7) };
  }

  function getCalendarWindow({ now, resetHour }, days) {
    const boundaries = [];
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    for (const offset of [-1, 0, 1]) {
      const monthLength = new Date(Date.UTC(year, month + offset + 1, 0)).getUTCDate();

      for (const day of days) {
        boundaries.push(new Date(Date.UTC(
          year,
          month + offset,
          Math.min(day, monthLength),
          resetHour
        )));
      }
    }

    boundaries.sort((a, b) => a - b);

    const nextIndex = boundaries.findIndex(date => date > now);

    return {
      last: boundaries[nextIndex - 1],
      next: boundaries[nextIndex]
    };
  }

  function getNextPatchMaintenanceStart(context) {
    const { gameConfig } = context;

    const currentPatchStart = new Date(
      `${gameConfig.current.version_start}T00:00:00Z`
    );

    const nextPatchStart = addDays(
      currentPatchStart,
      gameConfig.current.version_duration
    );

    return atTime(
      addDays(nextPatchStart, -1),
      'maintenanceStart',
      context
    );
  }

  function getIntervalWindow(context) {
    const { now, reset } = context;

    const startTime = reset.startTime ?? 'dailyReset';
    const endTime = reset.endTime ?? startTime;

    const anchor = atTime(reset.anchor, startTime, context);
    const intervalMs = reset.intervalDays * MS_IN_DAY;
    const cycles = Math.floor((now - anchor) / intervalMs);

    const last = new Date(
      anchor.getTime() + cycles * intervalMs
    );

    const nextStart = addDays(last, reset.intervalDays);
    let next = atTime(nextStart, endTime, context);

    if (reset.patchCollision === 'maintenanceStart') {
      const maintenanceStart =
        getNextPatchMaintenanceStart(context);

      const collisionDistance =
        Math.abs(next.getTime() - maintenanceStart.getTime());

      if (collisionDistance <= MS_IN_DAY) {
        next = maintenanceStart;
      }
    }

    return { last, next, isDisabled: now >= next };
  }

  function getPatchWindow(context) {
    const { gameConfig, reset, now } = context;
    const patchStart = new Date(`${gameConfig.current.version_start}T00:00:00Z`);

    const last = atTime(
      addDays(patchStart, reset.startOffsetDays),
      reset.startTime ?? 'dailyReset',
      context
    );

    const next = atTime(
      addDays(patchStart, gameConfig.current.version_duration + reset.endOffsetDays),
      reset.endTime ?? 'dailyReset',
      context
    );

    return { last, next, isDisabled: now < last || now >= next };
  }

  function getSeasonalWindow({ reset }) {
    return {
      last: new Date(reset.currentStart),
      next: reset.nextStart
        ? new Date(reset.nextStart)
        : null
    };
  }

  const RESET_HANDLERS = {
    daily: ({ lastDailyReset }) => ({
      last: lastDailyReset,
      next: addDays(lastDailyReset, 1)
    }),
    weekly: getWeeklyWindow,
    monthly: context => getCalendarWindow(context, [context.reset.day]),
    semiMonthly: context => getCalendarWindow(context, context.reset.days),
    interval: getIntervalWindow,
    patchWindow: getPatchWindow,
    seasonal: getSeasonalWindow,
  };

  function validateReset(reset, taskId) {
    const fail = () => {
      throw new Error(`Invalid reset configuration for task: ${taskId}`);
    };

    if (!reset || !RESET_HANDLERS[reset.kind]) fail();

    if (
      reset.kind === 'weekly' &&
      (!Number.isInteger(reset.weekday) || reset.weekday < 0 || reset.weekday > 6)
    ) {
      fail();
    }

    const validDay = day => Number.isInteger(day) && day >= 1 && day <= 31;

    if (reset.kind === 'monthly' && !validDay(reset.day)) fail();

    if (
      reset.kind === 'semiMonthly' &&
      (!Array.isArray(reset.days) || !reset.days.length || !reset.days.every(validDay))
    ) {
      fail();
    }

    if (
      reset.kind === 'interval' &&
      (
        typeof reset.anchor !== 'string' ||
        !Number.isFinite(Date.parse(reset.anchor)) ||
        !Number.isInteger(reset.intervalDays) ||
        reset.intervalDays <= 0
      )
    ) {
      fail();
    }

    if (
      reset.kind === 'patchWindow' &&
      (
        !Number.isInteger(reset.startOffsetDays) ||
        !Number.isInteger(reset.endOffsetDays)
      )
    ) {
      fail();
    }

    for (const time of [reset.startTime, reset.endTime]) {
      if (
        time !== undefined &&
        !['dailyReset', 'maintenanceStart', 'maintenanceEnd'].includes(time)
      ) {
        fail();
      }
    }
  }

  for (const gameName of Object.keys(GAME_TASKS)) {
    if (!GAME_CONFIG[gameName]) {
      throw new Error(`Missing game configuration: ${gameName}`);
    }
  }

  for (const gameName of Object.keys(GAME_CONFIG)) {
    if (!GAME_TASKS[gameName]) {
      throw new Error(`Missing task configuration: ${gameName}`);
    }
  }

  const tasksByGame = new Map();

  for (const [gameName, gameTasks] of Object.entries(GAME_TASKS)) {
    const tasks = new Map();

    for (const task of gameTasks.tasks) {
      if (tasks.has(task.id)) {
        throw new Error(`Duplicate task ID: ${task.id}`);
      }

      validateReset(task.reset, task.id);
      tasks.set(task.id, task);
    }

    tasksByGame.set(gameName, tasks);
  }

  function computeSingleAccountResetData(account, gameName, now = new Date()) {
    const gameConfig = GAME_CONFIG[gameName];
    const resetHour = gameConfig?.servers[account.server]?.daily_reset;

    if (!Number.isInteger(resetHour) || resetHour < 0 || resetHour > 23) {
      throw new Error(`Invalid reset hour for ${gameName} / ${account.server}`);
    }

    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error('Invalid current date');
    }

    const lastDailyReset = getLastDailyReset(now, resetHour);

    Object.values(account.tasks).forEach(taskGroup => {
      taskGroup.forEach(task => {
        const definition = tasksByGame.get(gameName)?.get(task.id);

        if (!definition) {
          throw new Error(`Unknown task: ${gameName} / ${task.id}`);
        }

        const reset = definition.reset;
        const resetWindow = RESET_HANDLERS[reset.kind]({ now, gameConfig, resetHour, lastDailyReset, reset });

        const { last, next } = resetWindow;

        if (!Number.isFinite(last?.getTime())) {
          throw new Error(`Invalid reset start for task: ${task.id}`);
        }

        if (
          next !== null &&
          (
            !Number.isFinite(next?.getTime()) ||
            next <= last
          )
        ) {
          throw new Error(`Invalid reset end for task: ${task.id}`);
        }

        task.isDisabled = Boolean(resetWindow.isDisabled);

        task.duration = task.isDisabled
          ? 0
          : next
            ? next - last
            : null;

        task.nextReset = task.isDisabled
          ? 0
          : next
            ? next - now
            : null;

        const completedAt = task.last_completed == null
          ? NaN
          : new Date(task.last_completed).getTime();

        task.isCompleted =
          !task.isDisabled &&
          Number.isFinite(completedAt) &&
          completedAt >= last.getTime() &&
          (next === null || completedAt < next.getTime()) &&
          completedAt <= now.getTime();
      });
    });

    return account;
  }

  function computeTaskResetData(gameGroups, now = new Date()) {
    gameGroups.forEach(gameGroup => {
      gameGroup.accounts.forEach(account => {
        computeSingleAccountResetData(account, gameGroup.name, now);
      });
    });

    return gameGroups;
  }

  return { computeTaskResetData, computeSingleAccountResetData };
}