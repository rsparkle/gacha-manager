export const DEFAULT_SETTINGS = {
    theme: '',
    server: null,
    scheduleGames: null,
    monthlySubCheck: 'calendar',
    deadlineNotifications: {},
    monthlySubNotifications: {},
    automaticDailies: {},
    checkGachaProcesses: false,
    automaticUpdates: false,
    hardwareAcceleration: false,
    favoriteGame: null,
    scheduleOthers: true,
};

export function migrateSettings(stored) {
    if (!stored || !('windowsNotifications' in stored)) return stored;

    const { windowsNotifications, ...rest } = stored;
    return { deadlineNotifications: windowsNotifications, ...rest };
}
