import appIcon from '../../../assets/icon.png';

const supported = () => typeof Notification !== 'undefined';

function hasEnabledAccounts(settings) {
    return Object.values(settings.windowsNotifications ?? {}).some((ids) => Object.values(ids ?? {}).length > 0);
}

export async function ensurePermission(settings) {
    if (!hasEnabledAccounts(settings)) return true;
    if (!supported()) return false;

    if (Notification.permission === 'default') {
        try {
            await Notification.requestPermission();
        } catch {
            return false;
        }
    }

    return Notification.permission === 'granted';
}

export function showNotification({ title, body }) {
    if (!supported() || Notification.permission !== 'granted') return;

    try {
        const notification = new Notification(title, { body, icon: appIcon, tag: 'gacha-manager-deadlines' });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch (err) {
        console.error('Notification failed:', err);
    }
}
