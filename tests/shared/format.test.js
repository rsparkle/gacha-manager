import { describe, expect, it } from 'vitest';
import { customGameAbbr, formatCountdown, formatDuration, slugify, thumbnailPath } from '../../src/shared/format.js';

describe('slugify', () => {
    it.each([
        ['Genshin Impact', 'genshin_impact'],
        ['Honkai: Star Rail', 'honkai_star_rail'],
        ['Zenless Zone Zero', 'zenless_zone_zero'],
        ['Neverness To Everness', 'neverness_to_everness'],
        ['Infinity Nikki', 'infinity_nikki'],
        ['Robin Summeretto', 'robin_summeretto'],
        ['Aeon Aha', 'aeon_aha'],
        ['  Leading & trailing!  ', 'leading_trailing'],
        ['Aeon?', 'aeon'],
    ])('%s -> %s', (name, slug) => {
        expect(slugify(name)).toBe(slug);
    });

    it('game slugs stay the same', () => {
        const games = [
            'Genshin Impact',
            'Honkai: Star Rail',
            'Zenless Zone Zero',
            'Neverness To Everness',
            'Infinity Nikki',
        ];

        expect(games.map(slugify)).toMatchInlineSnapshot(`
          [
            "genshin_impact",
            "honkai_star_rail",
            "zenless_zone_zero",
            "neverness_to_everness",
            "infinity_nikki",
          ]
        `);
    });
});

describe('thumbnailPath', () => {
    it.each([
        ['characters/robin.webp', 'characters/thumbs/robin.webp'],
        ['games/genshin_impact_7.2.webp', 'games/thumbs/genshin_impact_7.2.webp'],
        ['games/honkai_star_rail_4.7_livestream.webp', 'games/thumbs/honkai_star_rail_4.7_livestream.webp'],
        ['robin.webp', 'thumbs/robin.webp'],
    ])('%s -> %s', (file, thumb) => {
        expect(thumbnailPath(file)).toBe(thumb);
    });
});

describe('formatCountdown', () => {
    const MINUTE = 60_000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    it.each([
        [0, '0m'],
        [59_999, '0m'],
        [MINUTE, '1m'],
        [59 * MINUTE, '59m'],
        [HOUR, '1h 0m'],
        [HOUR + 5 * MINUTE, '1h 5m'],
        [23 * HOUR + 59 * MINUTE, '23h 59m'],
        [DAY, '1d 0h'],
        [DAY + 3 * HOUR + 59 * MINUTE, '1d 3h'],
        [41 * DAY + 23 * HOUR, '41d 23h'],
    ])('%i ms -> %s', (ms, text) => {
        expect(formatCountdown(ms)).toBe(text);
    });
});

describe('formatDuration', () => {
    const MINUTE = 60_000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    it.each([
        [14 * DAY, '14 days'],
        [DAY + HOUR + MINUTE, '1 day 1 hour 1 minute'],
        [27 * DAY + 2 * HOUR + 34 * MINUTE, '27 days 2 hours 34 minutes'],
        [12 * HOUR + 30 * MINUTE, '12 hours 30 minutes'],
        [MINUTE, '1 minute'],
    ])('%i → %s', (ms, text) => {
        expect(formatDuration(ms)).toBe(text);
    });
});

describe('customGameAbbr', () => {
    it.each([
        ['My Game', 'MG'],
        ['My Game 2', 'MG2'],
        ['Arknights', 'AR'],
        ['  blue   archive  ', 'BA'],
        ['Honkai Impact 3rd Part 2', 'HI3'],
        ['X', 'X'],
        ['', '?'],
        [null, '?'],
    ])('%j -> %s', (name, expected) => {
        expect(customGameAbbr(name)).toBe(expected);
    });
});
