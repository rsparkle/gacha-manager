export const THEMES = [
    { id: '', name: 'Default' },
    { id: 'furina', name: 'Furina' },
    { id: 'sparkle', name: 'Sparkle' },
];

export function themeAsset(theme, name) {
    if (!theme) return null;

    return new URL(`../assets/themes/${theme}/${name}.webp`, import.meta.url).href;
}
