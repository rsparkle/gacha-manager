import { ref } from 'vue';

const notifications = ref([]);
const currentTheme = ref('');
let nextId = 0;

export function getStickerUrl(theme, type) {
    const themeKey = theme || 'default';
    try {
        return new URL(`../../assets/themes/${themeKey}/${type}.webp`, import.meta.url).href;
    } catch {
        return null;
    }
}

export function useNotification() {
    function setTheme(theme) {
        currentTheme.value = theme;
    }

    function createNotification(type, message, duration = 0) {
        const id = ++nextId;
        const icon = getStickerUrl(currentTheme.value, `notification_${type}`);
        const createdAt = duration > 0 ? Date.now() : null;

        notifications.value.push({ id, type, message, duration, icon, createdAt, exiting: false });

        if (duration > 0) {
            setTimeout(() => deleteNotification(id), duration);
        }

        return id;
    }

    function deleteNotification(id) {
        const notif = notifications.value.find((n) => n.id === id);
        if (!notif || notif.exiting) return;

        notif.exiting = true;

        setTimeout(() => {
            notifications.value = notifications.value.filter((n) => n.id !== id);
        }, 350);
    }

    return { notifications, createNotification, deleteNotification, currentTheme, setTheme };
}
