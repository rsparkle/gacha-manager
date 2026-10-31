const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

export function thumbnailPath(file) {
    const slash = file.lastIndexOf('/');

    return `${file.slice(0, slash + 1)}thumbs/${file.slice(slash + 1)}`;
}

export function formatCountdown(ms) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;

    return `${minutes}m`;
}

export function customGameAbbr(name) {
    const words = String(name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return '?';

    const abbr = words.length > 1 ? words.map((word) => word[0]).join('') : words[0].slice(0, 2);

    return abbr.slice(0, 3).toUpperCase();
}
