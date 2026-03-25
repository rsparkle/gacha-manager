import { GAME_CONFIG } from '../game-config'

// Standard daily reset times (UTC) for most gacha game servers
const UTC_RESET_HOURS = {
  "America": 9,
  "Europe": 3,
  "Asia": 20,
  "TW/HK/MO": 20
}

const HSR_WEEKLY_ANCHORS = Object.fromEntries(
  Object.entries(GAME_CONFIG['Honkai: Star Rail'].weekly_anchors).map(([k, v]) => [k, new Date(v)])
);

const HSR_ENDGAME_ANCHORS = Object.fromEntries(
  Object.entries(GAME_CONFIG['Honkai: Star Rail'].endgame_anchors).map(([k, v]) => [k, new Date(v)])
);

const ZZZ_ENDGAME_ANCHORS = Object.fromEntries(
  Object.entries(GAME_CONFIG['Zenless Zone Zero'].endgame_anchors).map(([k, v]) => [k, new Date(v)])
);

const PATCH_START = Object.fromEntries(
  Object.entries(GAME_CONFIG).map(([k, v]) => [k, new Date(v.current.version_start)])
)

const RESET_CONFIG = {
  "Weekly Bosses": (lastDailyReset) =>
    getWeeklyResetWindow(lastDailyReset),

  "Divergent Universe": (lastDailyReset) =>
    getHSRWeeklyResetWindow(lastDailyReset, "Divergent Universe"),

  "Currency Wars": (lastDailyReset) =>
    getHSRWeeklyResetWindow(lastDailyReset, "Currency Wars"),

  "Hollow Zero": (lastDailyReset) =>
    getWeeklyResetWindow(lastDailyReset),

  "Spiral Abyss": (lastDailyReset) =>
    getMidMonthResetWindow(lastDailyReset),

  "Imaginarium Theater": (lastDailyReset) =>
    getMonthlyResetWindow(lastDailyReset),

  "Stygian Onslaught": (lastDailyReset) =>
    getStygianOnslaughtResetWindow(lastDailyReset),

  "Memory of Chaos": (lastDailyReset) =>
    getHSREndgameResetWindow(lastDailyReset, "Memory of Chaos"),

  "Pure Fiction": (lastDailyReset) =>
    getHSREndgameResetWindow(lastDailyReset, "Pure Fiction"),

  "Apocalyptic Shadow": (lastDailyReset) =>
    getHSREndgameResetWindow(lastDailyReset, "Apocalyptic Shadow"),

  "Anomaly Arbitration": () =>
    getAnomalyArbitrationResetWindow(),

  "Shiyu Defense": (lastDailyReset) =>
    getZZZEndgameResetWindow(lastDailyReset, 'Shiyu Defense'),

  "Deadly Assault": (lastDailyReset) =>
    getZZZEndgameResetWindow(lastDailyReset, 'Deadly Assault'),

  "Battle Trial": (lastDailyReset) =>
    getZZZSeasonalResetWindow(lastDailyReset, 'Battle Trial', 126),

  "Threshold Simulation": (lastDailyReset) =>
    getZZZSeasonalResetWindow(lastDailyReset, 'Threshold Simulation', 126),
};

function getLastDailyReset(now, serverResetHour) {
  const lastReset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    serverResetHour
  ));

  if (now.getTime() < lastReset.getTime()) {
    lastReset.setUTCDate(lastReset.getUTCDate() - 1);
  }

  return lastReset;
}

function getWeeklyResetWindow(lastDailyReset) {
  const lastReset = new Date(lastDailyReset);
  const day = lastReset.getUTCDay()
  const daysUntilLastMonday = day === 0 ? 6 : (day - 1)

  lastReset.setUTCDate(lastReset.getUTCDate() - daysUntilLastMonday);

  const nextReset = new Date(lastReset);
  nextReset.setUTCDate(nextReset.getUTCDate() + 7);

  return { last: lastReset, next: nextReset };
}

function getMonthlyResetWindow(lastDailyReset) {
  const lastReset = new Date(lastDailyReset);

  lastReset.setUTCDate(1);

  const nextReset = new Date(lastReset);
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1);

  return { last: lastReset, next: nextReset };
}

function getMidMonthResetWindow(lastDailyReset) {
  const lastReset = new Date(lastDailyReset);

  if (lastReset.getUTCDate() < 16) {
    lastReset.setUTCMonth(lastReset.getUTCMonth() - 1);
  }

  lastReset.setUTCDate(16);

  const nextReset = new Date(lastReset);
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1);
  nextReset.setUTCDate(16);

  return { last: lastReset, next: nextReset };
}

function getStygianOnslaughtResetWindow(lastDailyReset) {
  const lastReset = new Date(lastDailyReset);
  const now = new Date();

  const patchStart = PATCH_START['Genshin Impact'];
  patchStart.setUTCHours(lastReset.getUTCHours())
  const duration = GAME_CONFIG['Genshin Impact']?.current.version_duration;

  // Starts a week after the patch starts
  const stygianStart = new Date(patchStart);
  stygianStart.setUTCDate(stygianStart.getUTCDate() + 7);
  // Ends a day before the patch ends
  const stygianEnd = new Date(patchStart);
  stygianEnd.setUTCDate(stygianEnd.getUTCDate() + duration - 1)

  if (stygianStart > now || now > stygianEnd) {
    return { isDisabled: true }
  } else {
    return { last: stygianStart, next: stygianEnd }
  }
}

function getAnomalyArbitrationResetWindow() {
  const config = GAME_CONFIG['Honkai: Star Rail']

  const totalMins = config.maintenance_start[1] + config.maintenance_duration[1];
  const resetHour = (config.maintenance_start[0] + config.maintenance_duration[0] + Math.floor(totalMins / 60)) % 24;
  const resetMin = totalMins % 60;

  const patchStart = PATCH_START['Honkai: Star Rail'];

  const anomalyStart = new Date(patchStart);
  anomalyStart.setUTCHours(resetHour, resetMin, 0, 0);

  const anomalyEnd = new Date(patchStart);
  anomalyEnd.setUTCDate(anomalyEnd.getUTCDate() + config.current.version_duration - 1);
  anomalyEnd.setUTCHours(config.maintenance_start[0], config.maintenance_start[1], 0, 0);

  return { last: anomalyStart, next: anomalyEnd }
}

function getHSRWeeklyResetWindow(lastDailyReset, mode) {
  const current = new Date(lastDailyReset);
  return getIntervalResetWindow(
    HSR_WEEKLY_ANCHORS[mode],
    current,
    14
  );
}

function getHSREndgameResetWindow(lastDailyReset, mode) {
  const current = new Date(lastDailyReset);
  return getIntervalResetWindow(
    HSR_ENDGAME_ANCHORS[mode],
    current,
    42
  );
}

function getZZZEndgameResetWindow(lastDailyReset, mode) {
  const current = new Date(lastDailyReset);
  return getIntervalResetWindow(
    ZZZ_ENDGAME_ANCHORS[mode],
    current,
    14
  );
}

function getZZZSeasonalResetWindow(lastDailyReset, mode, intervalDays) {
  // Seasonals start when servers open and end on daily reset
  const config = GAME_CONFIG['Zenless Zone Zero'];

  const totalMins = config.maintenance_start[1] + config.maintenance_duration[1];
  const resetHour = (config.maintenance_start[0] + config.maintenance_duration[0] + Math.floor(totalMins / 60)) % 24;
  const resetMin = totalMins % 60;

  const current = new Date(lastDailyReset);
  current.setUTCHours(resetHour, resetMin, 0, 0);

  const { last, next } = getIntervalResetWindow(
    ZZZ_ENDGAME_ANCHORS[mode],
    current,
    intervalDays
  );

  next.setUTCHours(new Date(lastDailyReset).getUTCHours());

  return { last, next };
}

function getIntervalResetWindow(anchor, current, intervalDays) {
  const anchorDate = new Date(anchor);
  anchorDate.setUTCHours(current.getUTCHours());

  const diffMs = current - anchorDate;
  const intervalMs = intervalDays * 86_400_000;

  const cycles = Math.floor(diffMs / intervalMs);

  const last = new Date(anchorDate.getTime() + cycles * intervalMs);
  const next = new Date(last.getTime() + intervalMs);

  return { last, next };
}

export function computeTaskResetData(gameGroups) {
  gameGroups.forEach(gameGroup => {
    gameGroup.accounts.forEach(account => {
      computeSingleAccountResetData(account);
    });
  });

  return gameGroups;
}

export function computeSingleAccountResetData(account) {
  const now = new Date();

  const resetHour = UTC_RESET_HOURS[account.server];
  const lastDailyReset = getLastDailyReset(now, resetHour);
  const nextDailyReset = new Date(lastDailyReset);
  nextDailyReset.setUTCDate(nextDailyReset.getUTCDate() + 1);

  Object.values(account.tasks).forEach(taskType => {
    taskType.forEach(task => {
      const resetWindow = task.type === 'Daily'
        ? { last: lastDailyReset, next: nextDailyReset }
        : RESET_CONFIG[task.label](lastDailyReset);

      if (!resetWindow.isDisabled) {
        const isDone = task.last_completed !== null && new Date(task.last_completed) > resetWindow.last;

        task.duration = resetWindow.next - resetWindow.last;
        task.nextReset = resetWindow.next - now;
        task.isCompleted = isDone;
      } else {
        task.isDisabled = true
      }
    })
  })
}