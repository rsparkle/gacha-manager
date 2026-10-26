import { describe, expect, it } from 'vitest';
import {
    DAY,
    HOUR,
    addDays,
    addZonedDays,
    compileGameClock,
    localDate,
    mod,
    offsetAt,
    parseClock,
    parseMinutes,
    secondPhaseDay,
    shiftDate,
    toDateKey,
    weekdayOf,
    zonedInstant,
} from '../../src/shared/serverTime.js';
import { makeGame } from '../helpers/builders.js';

describe('mod', () => {
    it.each([
        [5, 7, 5],
        [7, 7, 0],
        [-1, 7, 6],
        [-8, 7, 6],
    ])('mod(%i, %i) = %i', (value, size, expected) => {
        expect(mod(value, size)).toBe(expected);
    });
});

describe('addDays', () => {
    it('adds whole 24h days', () => {
        expect(addDays(new Date('2026-10-25T12:00:00Z'), 2).toISOString()).toBe('2026-10-27T12:00:00.000Z');
        expect(addDays(new Date('2026-10-25T12:00:00Z'), -1).toISOString()).toBe('2026-10-24T12:00:00.000Z');
    });
});

describe('parseMinutes / parseClock', () => {
    it.each([
        ['00:00', 0],
        ['4:00', 240],
        ['04:00', 240],
        ['23:59', 1439],
    ])('parses %s', (text, minutes) => {
        expect(parseMinutes(text, 'x')).toBe(minutes);
        expect(parseClock(text, 'x')).toBe(minutes);
    });

    it('durations can go past 24h, clock times cannot', () => {
        expect(parseMinutes('24:00', 'duration')).toBe(1440);
        expect(parseMinutes('30:30', 'duration')).toBe(1830);
        expect(() => parseClock('24:00', 'daily_reset')).toThrow('Invalid daily_reset: "24:00" (must be before 24:00)');
    });

    it.each([['4'], ['04:60'], ['4h'], ['04:00:00'], [''], [null], [undefined], [400]])('rejects %j', (text) => {
        expect(() => parseMinutes(text, 'field')).toThrow(/Invalid field: .* \(expected "HH:MM"\)/);
    });
});

describe('date keys', () => {
    it('toDateKey uses the UTC date', () => {
        expect(toDateKey('2026-10-25')).toBe('2026-10-25');
        expect(toDateKey('2026-10-25T23:59:59Z')).toBe('2026-10-25');
        expect(toDateKey(Date.UTC(2026, 0, 1))).toBe('2026-01-01');
        expect(toDateKey(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
    });

    it.each([
        ['2026-10-25', 1, '2026-10-26'],
        ['2026-10-31', 1, '2026-11-01'],
        ['2026-12-31', 1, '2027-01-01'],
        ['2028-02-28', 1, '2028-02-29'],
        ['2027-02-28', 1, '2027-03-01'],
        ['2026-03-01', -1, '2026-02-28'],
        ['2026-10-25', 0, '2026-10-25'],
        ['2026-10-25', 42, '2026-12-06'],
    ])('shiftDate(%s, %i) = %s', (dateKey, days, expected) => {
        expect(shiftDate(dateKey, days)).toBe(expected);
    });

    it('shiftDate ignores DST', () => {
        expect(shiftDate('2026-10-24', 2)).toBe('2026-10-26');
        expect(shiftDate('2027-03-13', 2)).toBe('2027-03-15');
    });

    it('weekdayOf', () => {
        expect(weekdayOf('2026-10-25')).toBe(0);
        expect(weekdayOf('2026-10-26')).toBe(1);
        expect(weekdayOf('2026-10-31')).toBe(6);
    });
});

describe('secondPhaseDay', () => {
    it.each([
        [42, undefined, 21],
        [42, -1, 20],
        [41, 0, 21],
        [44, 1, 23],
        [33, 1, 18],
        [28, 0, 14],
    ])('duration %i offset %j -> day %i', (version_duration, second_phase_offset, day) => {
        expect(secondPhaseDay({ version_duration, second_phase_offset })).toBe(day);
    });
});

describe('offsetAt', () => {
    it('numeric offsets', () => {
        expect(offsetAt(8, Date.now())).toBe(8);
        expect(offsetAt(-5, Date.now())).toBe(-5);
    });

    it.each([
        ['America/New_York', '2026-07-01T12:00:00Z', -4],
        ['America/New_York', '2026-12-01T12:00:00Z', -5],
        ['Europe/Berlin', '2026-07-01T12:00:00Z', 2],
        ['Europe/Berlin', '2026-12-01T12:00:00Z', 1],
        ['Asia/Shanghai', '2026-07-01T12:00:00Z', 8],
        ['UTC', '2026-07-01T12:00:00Z', 0],
    ])('%s at %s is %d', (zone, instant, offset) => {
        expect(offsetAt(zone, new Date(instant))).toBe(offset);
    });

    it('switches at the DST instant', () => {
        expect(offsetAt('America/New_York', new Date('2026-11-01T05:59:00Z'))).toBe(-4);
        expect(offsetAt('America/New_York', new Date('2026-11-01T06:00:00Z'))).toBe(-5);
        expect(offsetAt('Europe/Berlin', new Date('2026-10-25T00:59:00Z'))).toBe(2);
        expect(offsetAt('Europe/Berlin', new Date('2026-10-25T01:00:00Z'))).toBe(1);
    });

    it('numeric timestamps', () => {
        expect(offsetAt('America/New_York', Date.parse('2026-11-01T05:59:59.999Z'))).toBe(-4);
    });
});

describe('zonedInstant', () => {
    it('fixed offset', () => {
        expect(zonedInstant('2026-10-25', 4 * 60, 8).toISOString()).toBe('2026-10-24T20:00:00.000Z');
        expect(zonedInstant('2026-10-25', 4 * 60, -5).toISOString()).toBe('2026-10-25T09:00:00.000Z');
        expect(zonedInstant('2026-10-25', 0, 0).toISOString()).toBe('2026-10-25T00:00:00.000Z');
    });

    it('IANA zones follow DST', () => {
        expect(zonedInstant('2026-10-31', 5 * 60, 'America/New_York').toISOString()).toBe('2026-10-31T09:00:00.000Z');
        expect(zonedInstant('2026-11-01', 5 * 60, 'America/New_York').toISOString()).toBe('2026-11-01T10:00:00.000Z');
        expect(zonedInstant('2026-10-24', 5 * 60, 'Europe/Berlin').toISOString()).toBe('2026-10-24T03:00:00.000Z');
        expect(zonedInstant('2026-10-25', 5 * 60, 'Europe/Berlin').toISOString()).toBe('2026-10-25T04:00:00.000Z');
        expect(zonedInstant('2027-03-15', 5 * 60, 'America/New_York').toISOString()).toBe('2027-03-15T09:00:00.000Z');
    });

    it('ambiguous fall-back time uses the first one', () => {
        expect(zonedInstant('2026-11-01', 90, 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
    });

    it('times around midnight', () => {
        expect(zonedInstant('2026-11-01', 23 * 60 + 59, 'America/New_York').toISOString()).toBe(
            '2026-11-02T04:59:00.000Z',
        );
        expect(zonedInstant('2026-10-25', 0, 'Europe/Berlin').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    });

    it('round-trips with localDate on a DST day', () => {
        for (let hour = 0; hour < 24; hour++) {
            if (hour === 1) continue;

            const instant = zonedInstant('2026-11-01', hour * 60, 'America/New_York');
            const wall = localDate(instant, 'America/New_York');

            expect(wall.toISOString()).toBe(`2026-11-01T${String(hour).padStart(2, '0')}:00:00.000Z`);
        }
    });
});

describe('localDate', () => {
    it('converts to server wall-clock time', () => {
        expect(localDate(new Date('2026-10-24T20:00:00Z'), 8).toISOString()).toBe('2026-10-25T04:00:00.000Z');
        expect(localDate(new Date('2026-11-01T10:00:00Z'), 'America/New_York').toISOString()).toBe(
            '2026-11-01T05:00:00.000Z',
        );
    });
});

describe('addZonedDays', () => {
    it('keeps wall-clock time across DST', () => {
        const start = new Date('2026-10-31T09:00:00Z');

        expect(addZonedDays(start, 1, 'America/New_York').toISOString()).toBe('2026-11-01T10:00:00.000Z');
        expect(addZonedDays(start, 7, 'America/New_York').toISOString()).toBe('2026-11-07T10:00:00.000Z');
        expect(addZonedDays(new Date('2026-11-01T10:00:00Z'), -1, 'America/New_York').toISOString()).toBe(
            '2026-10-31T09:00:00.000Z',
        );
    });

    it('24h days for fixed offsets', () => {
        const start = new Date('2026-10-31T20:00:00Z');

        for (const days of [-30, -1, 0, 1, 7, 365]) {
            expect(addZonedDays(start, days, 8).getTime()).toBe(start.getTime() + days * DAY);
        }
    });

    it('DST days are 23h or 25h', () => {
        const before = zonedInstant('2027-03-13', 5 * 60, 'America/New_York');
        const fallBefore = zonedInstant('2026-10-31', 5 * 60, 'America/New_York');

        expect(addZonedDays(before, 1, 'America/New_York') - before).toBe(23 * HOUR);
        expect(addZonedDays(fallBefore, 1, 'America/New_York') - fallBefore).toBe(25 * HOUR);
    });
});

describe('compileGameClock', () => {
    it('typical game', () => {
        const clock = compileGameClock('Test', makeGame());

        expect(clock).toEqual({
            globalOffset: 8,
            maintenance: {
                first_phase: { startMinutes: 360, durationMinutes: 300 },
                second_phase: null,
            },
            trailerMinutes: 720,
            livestreamMinutes: 1200,
            dripMinutes: 720,
            secondPhase: { minutes: 1080, scope: 'server' },
            eventStart: { minutes: 600, scope: 'server' },
            eventEnd: { minutes: 239, scope: 'server' },
            servers: {
                America: { zone: -5, resetMinutes: 240 },
                Europe: { zone: 1, resetMinutes: 240 },
                Asia: { zone: 8, resetMinutes: 240 },
            },
        });
    });

    it('timezone wins over utc_offset', () => {
        const clock = compileGameClock(
            'Test',
            makeGame({
                servers: {
                    America: { timezone: 'America/New_York', utc_offset: -4 },
                    Europe: { timezone: 'Europe/Berlin' },
                },
            }),
        );

        expect(clock.servers.America.zone).toBe('America/New_York');
        expect(clock.servers.Europe.zone).toBe('Europe/Berlin');
        expect(clock.servers.Asia.zone).toBe(8);
    });

    it('per-server daily_reset', () => {
        const clock = compileGameClock('Test', makeGame({ servers: { America: { daily_reset: '05:00' } } }));

        expect(clock.servers.America.resetMinutes).toBe(300);
        expect(clock.servers.Asia.resetMinutes).toBe(240);
    });

    it('second phase from maintenance.second_phase', () => {
        const clock = compileGameClock(
            'Test',
            makeGame({
                second_phase: undefined,
                maintenance: { second_phase: { start: '10:00', duration: '01:00' } },
            }),
        );

        expect(clock.secondPhase).toEqual({ minutes: 660, scope: 'global' });
    });

    it('trailer_time without character trailers', () => {
        const clock = compileGameClock('Test', makeGame({ character_trailer: undefined, trailer_time: '13:00' }));

        expect(clock.trailerMinutes).toBe(780);
    });

    it('optional clocks are null', () => {
        const clock = compileGameClock(
            'Test',
            makeGame({
                drip: undefined,
                event_start: undefined,
                event_end: undefined,
                livestream: { is_predictable: false, time: undefined },
            }),
        );

        expect(clock.dripMinutes).toBeNull();
        expect(clock.eventStart).toBeNull();
        expect(clock.eventEnd).toBeNull();
        expect(clock.livestreamMinutes).toBeNull();
    });

    it('livestream_date needs livestream.time', () => {
        const game = makeGame({
            livestream: { is_predictable: false, time: undefined },
            next: { livestream_date: '2026-11-20' },
        });

        expect(() => compileGameClock('Test', game)).toThrow('Test: livestream.time is required');
    });

    it.each([
        ['global_utc_offset missing', { global_utc_offset: undefined }, 'Test: global_utc_offset must be a number'],
        ['global_utc_offset as text', { global_utc_offset: '8' }, 'Test: global_utc_offset must be a number'],
        ['no first maintenance', { maintenance: { first_phase: null } }, 'Test: missing maintenance.first_phase'],
        ['no maintenance at all', { maintenance: undefined }, 'Test: missing maintenance.first_phase'],
        [
            'bad maintenance start',
            { maintenance: { first_phase: { start: '25:00' } } },
            'Invalid Test maintenance.first_phase.start',
        ],
        [
            'bad second phase scope',
            { second_phase: { time: '12:00', scope: 'local' } },
            'Test: second_phase.scope must be "server" or "global"',
        ],
        [
            'no second phase at all',
            { second_phase: undefined },
            'Test: missing second_phase or maintenance.second_phase',
        ],
        [
            'bad event_start scope',
            { event_start: { time: '10:00', scope: 'nope' } },
            'Test: event_start.scope must be "server" or "global"',
        ],
        ['null event_end', { event_end: null }, 'Test: event_end.scope must be "server" or "global"'],
        ['bad drip time', { drip: { time: 'noon' } }, 'Invalid Test drip.time'],
        ['no trailer time', { character_trailer: undefined }, 'Invalid Test trailer_time'],
        ['empty servers', { servers: null }, 'Test: missing servers'],
        ['bad server offset', { servers: { Asia: { utc_offset: 'UTC+8' } } }, 'Test: Asia utc_offset must be a number'],
        [
            'bad server timezone',
            { servers: { Asia: { timezone: 'Mars/Olympus' } } },
            'Test: Asia timezone "Mars/Olympus" is not a valid IANA time zone',
        ],
        ['bad daily reset', { daily_reset: '4am' }, 'Invalid Test America daily_reset'],
    ])('rejects %s', (_, overrides, message) => {
        expect(() => compileGameClock('Test', makeGame(overrides))).toThrow(message);
    });

    it('rejects empty servers', () => {
        const game = makeGame();
        game.servers = {};

        expect(() => compileGameClock('Test', game)).toThrow('Test: missing servers');
    });
});
