import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduleProcessor } from '../../src/renderer/lib/scheduleProcessor.js';
import { makeGame, patch } from '../helpers/builders.js';

const GAME = 'Test Game';
const NOW = '2026-10-25T12:00:00Z';

function schedule(overrides = {}, server = 'Asia') {
    return createScheduleProcessor({ [GAME]: makeGame(overrides) }).computeScheduleData(server)[GAME];
}

function dates(events) {
    return Object.fromEntries(Object.entries(events).map(([key, event]) => [key, event.date.toISOString()]));
}

function pick(events, part) {
    return Object.fromEntries(Object.entries(events).filter(([key]) => key.includes(part)));
}

const img = {
    game: (version) => `games/test_game_${version}.webp`,
    livestream: (version) => `games/test_game_${version}_livestream.webp`,
    character: (slug) => `characters/${slug}.webp`,
    fallback: 'games/test_game_default.webp',
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('timeline', () => {
    it('all events, no characters', () => {
        expect(dates(schedule())).toEqual({
            'v1.0_release': '2026-08-26T03:00:00.000Z',
            'v1.0_secondPhase': '2026-09-15T10:00:00.000Z',
            'v1.1_release': '2026-10-07T03:00:00.000Z',
            'v1.1_secondPhase': '2026-10-27T10:00:00.000Z',
            'v1.2_release': '2026-11-18T03:00:00.000Z',
            'v1.2_secondPhase': '2026-12-08T10:00:00.000Z',
            'v1.1_drip_day1': '2026-08-31T04:00:00.000Z',
            'v1.1_drip_day2': '2026-09-01T04:00:00.000Z',
            'v1.2_drip_day1': '2026-10-12T04:00:00.000Z',
            'v1.2_drip_day2': '2026-10-13T04:00:00.000Z',
            'v1.3_drip_day1': '2026-11-23T04:00:00.000Z',
            'v1.3_drip_day2': '2026-11-24T04:00:00.000Z',
            'v1.1_livestream': '2026-09-25T12:00:00.000Z',
            'v1.2_livestream': '2026-11-06T12:00:00.000Z',
            'v1.3_livestream': '2026-12-18T12:00:00.000Z',
        });
    });

    it('patch opens at the same time on every server', () => {
        for (const server of ['America', 'Europe', 'Asia']) {
            expect(schedule({}, server)['v1.1_release'].date.toISOString()).toBe('2026-10-07T03:00:00.000Z');
        }
    });

    it.each([
        ['America', '2026-10-27T23:00:00.000Z'],
        ['Europe', '2026-10-27T17:00:00.000Z'],
        ['Asia', '2026-10-27T10:00:00.000Z'],
    ])('server second phase on %s', (server, expected) => {
        expect(schedule({}, server)['v1.1_secondPhase'].date.toISOString()).toBe(expected);
    });

    it('server second phase follows DST', () => {
        const events = schedule({ servers: { America: { timezone: 'America/New_York' } } }, 'America');

        expect(events['v1.0_secondPhase'].date.toISOString()).toBe('2026-09-15T22:00:00.000Z');
        expect(events['v1.2_secondPhase'].date.toISOString()).toBe('2026-12-08T23:00:00.000Z');
    });

    it('maintenance second phase is global', () => {
        const overrides = {
            second_phase: undefined,
            maintenance: { second_phase: { start: '10:00', duration: '01:00' } },
        };

        for (const server of ['America', 'Europe', 'Asia']) {
            expect(schedule(overrides, server)['v1.1_secondPhase'].date.toISOString()).toBe('2026-10-27T03:00:00.000Z');
        }
    });

    it('global second_phase scope', () => {
        expect(schedule({ second_phase: { scope: 'global' } }, 'America')['v1.1_secondPhase'].date.toISOString()).toBe(
            '2026-10-27T10:00:00.000Z',
        );
    });

    it('durations and second phase offsets', () => {
        const events = schedule({
            previous: { version_duration: 33, second_phase_offset: 1 },
            current: { version_duration: 44, second_phase_offset: 1 },
            next: { version_duration: 41, second_phase_offset: 0 },
        });

        expect(events['v1.0_release'].date.toISOString()).toBe('2026-09-04T03:00:00.000Z');
        expect(events['v1.0_secondPhase'].date.toISOString()).toBe('2026-09-22T10:00:00.000Z');
        expect(events['v1.1_secondPhase'].date.toISOString()).toBe('2026-10-30T10:00:00.000Z');
        expect(events['v1.2_release'].date.toISOString()).toBe('2026-11-20T03:00:00.000Z');
        expect(events['v1.2_secondPhase'].date.toISOString()).toBe('2026-12-11T10:00:00.000Z');
    });

    it('missing server returns nothing', () => {
        expect(schedule({}, 'SEA')).toEqual({});
    });

    it('missing server is fine with global second phase', () => {
        const events = schedule({ second_phase: { scope: 'global' } }, 'SEA');

        expect(events['v1.1_release'].date.toISOString()).toBe('2026-10-07T03:00:00.000Z');
    });
});

describe('release events', () => {
    it('no characters', () => {
        const events = schedule();

        expect(events['v1.1_release']).toEqual({
            date: new Date('2026-10-07T03:00:00Z'),
            type: 'release',
            portrait: false,
            label: 'TG 1.1 Release',
            title: 'TG 1.1',
            imgFiles: [img.game('1.1'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.1_secondPhase']).toMatchObject({
            type: 'phase',
            portrait: false,
            label: 'TG 1.1 Second Phase',
            title: 'TG 1.1 2nd Phase',
        });
    });

    it('single character', () => {
        const events = schedule({
            current: { phase_characters: { 1: ['Alice'], 2: ['Bob Smith'] } },
            next: { phase_characters: { 1: ['Carol'] } },
        });

        expect(events['v1.1_release']).toMatchObject({
            type: 'release',
            portrait: true,
            label: 'TG 1.1 - Alice Release',
            title: 'TG 1.1',
            imgFiles: [img.character('alice'), img.game('1.1'), img.fallback],
        });
        expect(events['v1.1_secondPhase']).toMatchObject({
            type: 'release',
            label: 'TG 1.1 2nd Phase - Bob Smith Release',
            title: 'TG 1.1 2nd Phase',
            imgFiles: [img.character('bob_smith'), img.game('1.1'), img.fallback],
        });
        expect(events['v1.2_release'].imgFiles).toEqual([
            img.character('carol'),
            img.game('1.2'),
            img.game('1.1'),
            img.fallback,
        ]);
    });

    it('multiple characters', () => {
        const events = schedule({ current: { phase_characters: { 1: ['Alice', 'Bob'] } } });

        expect(events['v1.1_release']).toBeUndefined();
        expect(events['v1.1_release_alice']).toMatchObject({ label: 'Alice Release', title: 'Alice', portrait: true });
        expect(events['v1.1_release_bob']).toMatchObject({
            label: 'Bob Release',
            imgFiles: [img.character('bob'), img.game('1.1'), img.fallback],
        });
        expect(events['v1.1_release_alice'].date).toEqual(events['v1.1_release_bob'].date);
    });

    it('ignores empty slots', () => {
        const events = schedule({ current: { phase_characters: { 1: ['', 'Alice', null], 2: [''] } } });

        expect(events['v1.1_release'].label).toBe('TG 1.1 - Alice Release');
        expect(events['v1.1_secondPhase'].type).toBe('phase');
    });

    it('missing phase_characters', () => {
        expect(schedule({ current: { phase_characters: undefined } })['v1.1_release'].label).toBe('TG 1.1 Release');
    });

    it('unconfirmed durations are estimated', () => {
        const events = schedule({
            current: { is_version_duration_confirmed: false },
            next: { is_version_duration_confirmed: false },
        });

        expect(events['v1.0_release'].confirmed).toBe(true);
        expect(events['v1.1_release'].confirmed).toBe(true);
        expect(events['v1.1_secondPhase'].confirmed).toBe(false);
        expect(events['v1.2_release'].confirmed).toBe(false);
        expect(events['v1.2_secondPhase'].confirmed).toBe(false);
    });

    it('confirmed once the date passes', () => {
        vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));

        expect(schedule({ current: { is_version_duration_confirmed: false } })['v1.1_secondPhase'].confirmed).toBe(true);
    });

    it('next 2nd phase needs both confirmed', () => {
        expect(schedule({ next: { is_version_duration_confirmed: false } })['v1.2_secondPhase'].confirmed).toBe(false);
        expect(schedule({ next: { is_version_duration_confirmed: false } })['v1.2_release'].confirmed).toBe(true);
    });
});

describe('special phases', () => {
    it('one release per character', () => {
        const events = schedule(
            { next: { special_phases: [{ date: '2026-12-01', characters: ['Kafka', 'Robin'] }] } },
            'Europe',
        );

        expect(events['v1.2_specialPhase1_kafka']).toEqual({
            date: new Date('2026-12-01T17:00:00Z'),
            type: 'release',
            portrait: true,
            label: 'Kafka Release',
            title: 'Kafka',
            imgFiles: [img.character('kafka'), img.game('1.2'), img.game('1.1'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.2_specialPhase1_robin'].label).toBe('Robin Release');
    });

    it('single character title', () => {
        const events = schedule({ current: { special_phases: [{ date: '2026-10-16', characters: ['Sparkle'] }] } });

        expect(events['v1.1_specialPhase1_sparkle']).toMatchObject({
            label: 'TG 1.1 Special Phase - Sparkle Release',
            title: 'TG 1.1 Special Phase',
        });
    });

    it('no characters shows a phase', () => {
        const events = schedule({
            current: {
                special_phases: [
                    { date: '2026-10-10', characters: ['A'] },
                    { date: '2026-10-16', characters: [] },
                ],
            },
        });

        expect(events['v1.1_specialPhase2']).toMatchObject({
            type: 'phase',
            portrait: false,
            label: 'TG 1.1 Special Phase',
            imgFiles: [img.game('1.1'), img.fallback],
        });
        expect(events['v1.1_specialPhase1_a']).toBeDefined();
    });

    it('unconfirmed special phases are estimated', () => {
        const events = schedule({
            current: {
                special_phases: [
                    { date: '2026-10-10', characters: ['A'] },
                    { date: '2026-10-16', characters: [] },
                ],
                special_phase_confirmed: false,
            },
        });

        expect(events['v1.1_specialPhase1_a'].confirmed).toBe(false);
        expect(events['v1.1_specialPhase2'].confirmed).toBe(false);
    });
});

describe('character trailers', () => {
    it('combined trailer before each phase', () => {
        const events = schedule({
            character_trailer: { distance: 3 },
            current: {
                phase_characters: { 1: ['Alice', 'Bob'], 2: ['Carol'] },
                special_phases: [{ date: '2026-10-16', characters: ['Dan'] }],
            },
        });

        expect(events['v1.1_trailer_phase1']).toEqual({
            date: new Date('2026-10-04T04:00:00Z'),
            type: 'trailer',
            portrait: true,
            label: 'Alice & Bob Trailer',
            title: 'Alice & Bob Trailer',
            imgFiles: [img.character('alice'), img.game('1.1'), img.fallback],
            confirmed: false,
        });
        expect(events['v1.1_trailer_phase2'].date.toISOString()).toBe('2026-10-24T04:00:00.000Z');
        expect(events['v1.1_trailer_special1'].date.toISOString()).toBe('2026-10-13T04:00:00.000Z');
        expect(pick(events, 'v1.0_trailer')).toEqual({});
    });

    it('rumored characters use patch art', () => {
        const events = schedule({ next: { phase_characters: { 1: ['Aeon?'] } } });

        expect(events['v1.2_trailer_phase1']).toMatchObject({
            portrait: false,
            label: 'Aeon? Trailer',
            imgFiles: [img.game('1.2'), img.game('1.1'), img.fallback],
        });
    });

    it('skipped without character_trailer', () => {
        const events = schedule({
            character_trailer: undefined,
            trailer_time: '12:00',
            current: { phase_characters: { 1: ['Alice'] } },
        });

        expect(pick(events, '_trailer_')).toEqual({});
    });
});

describe('patch trailers', () => {
    const noLivestream = {
        character_trailer: undefined,
        trailer_time: '12:00',
        patch_trailer_distance: 5,
        livestream: { is_predictable: false, schedule: undefined },
    };

    it('patches without a livestream', () => {
        const events = schedule(noLivestream);

        expect(events['v1.1_patchTrailer']).toEqual({
            date: new Date('2026-10-02T04:00:00Z'),
            type: 'trailer',
            portrait: false,
            label: 'TG 1.1 Trailer',
            title: 'TG 1.1 Trailer',
            imgFiles: [img.game('1.1'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.2_patchTrailer'].date.toISOString()).toBe('2026-11-13T04:00:00.000Z');
        expect(events['v1.2_patchTrailer'].label).toBe('TG 1.2 Trailer');
        expect(pick(events, '_livestream')).toEqual({});
    });

    it('livestream_date drops that trailer', () => {
        const events = schedule({ ...noLivestream, current: { livestream_date: '2026-11-08' } });

        expect(events['v1.1_patchTrailer']).toBeDefined();
        expect(events['v1.2_patchTrailer']).toBeUndefined();
        expect(events['v1.2_livestream'].date.toISOString()).toBe('2026-11-08T12:00:00.000Z');
    });

    it('skipped for predictable livestreams', () => {
        const events = schedule({ patch_trailer_distance: 5 });

        expect(events['v1.1_patchTrailer']).toBeUndefined();
        expect(events['v1.2_patchTrailer']).toBeUndefined();
    });
});

describe('livestreams', () => {
    it('labels and images', () => {
        const events = schedule();

        expect(events['v1.1_livestream']).toEqual({
            date: new Date('2026-09-25T12:00:00Z'),
            type: 'livestream',
            portrait: false,
            label: 'TG 1.1 Livestream',
            title: 'TG 1.1 Livestream',
            imgFiles: [img.livestream('1.1'), img.game('1.0'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.2_livestream']).toMatchObject({
            label: 'TG 1.2 Livestream',
            imgFiles: [img.livestream('1.2'), img.game('1.1'), img.fallback],
        });
        expect(events['v1.3_livestream']).toMatchObject({
            label: 'TG 1.3 Livestream',
            imgFiles: [img.livestream('1.3'), img.game('1.2'), img.game('1.1'), img.fallback],
            confirmed: false,
        });
    });

    it('hoyo schedule', () => {
        expect(schedule({ current: { second_phase_offset: 2 } })['v1.2_livestream'].date.toISOString()).toBe(
            '2026-11-13T12:00:00.000Z',
        );
        expect(schedule({ current: { second_phase_offset: 1 } })['v1.2_livestream'].date.toISOString()).toBe(
            '2026-11-06T12:00:00.000Z',
        );
        expect(schedule({ current: { second_phase_offset: 3 } })['v1.2_livestream'].date.toISOString()).toBe(
            '2026-11-13T12:00:00.000Z',
        );
    });

    it('distance schedule', () => {
        const events = schedule({ livestream: { schedule: 'distance', distance: 28 } });

        expect(events['v1.1_livestream'].date.toISOString()).toBe('2026-09-23T12:00:00.000Z');
        expect(events['v1.2_livestream'].date.toISOString()).toBe('2026-11-04T12:00:00.000Z');
        expect(events['v1.3_livestream'].date.toISOString()).toBe('2026-12-16T12:00:00.000Z');
    });

    it('livestream_date override', () => {
        const events = schedule({ current: { livestream_date: '2026-11-10' } });

        expect(events['v1.2_livestream'].date.toISOString()).toBe('2026-11-10T12:00:00.000Z');
        expect(events['v1.2_livestream'].confirmed).toBe(true);
        expect(events['v1.1_livestream'].date.toISOString()).toBe('2026-09-25T12:00:00.000Z');
    });

    it('confirmed within 3 days', () => {
        expect(schedule()['v1.2_livestream'].confirmed).toBe(false);

        vi.setSystemTime(new Date('2026-11-03T11:59:59Z'));
        expect(schedule()['v1.2_livestream'].confirmed).toBe(false);

        vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
        expect(schedule()['v1.2_livestream'].confirmed).toBe(true);
    });

    it('next livestream needs confirmed durations or a date', () => {
        expect(schedule({ next: { is_version_duration_confirmed: false } })['v1.3_livestream']).toBeUndefined();
        expect(schedule({ current: { is_version_duration_confirmed: false } })['v1.3_livestream']).toBeUndefined();

        const overridden = schedule({
            next: { is_version_duration_confirmed: false, livestream_date: '2026-12-20' },
        })['v1.3_livestream'];

        expect(overridden.date.toISOString()).toBe('2026-12-20T12:00:00.000Z');
        expect(overridden.confirmed).toBe(true);
    });

    it('unpredictable only shows with a date', () => {
        const unpredictable = { livestream: { is_predictable: false, schedule: undefined } };

        expect(pick(schedule(unpredictable), 'v1.1_livestream')).toEqual({});
        expect(Object.keys(pick(schedule(unpredictable), '_livestream'))).toEqual([]);

        const events = schedule({ ...unpredictable, current: { livestream_date: '2026-11-10' } });

        expect(events['v1.2_livestream'].date.toISOString()).toBe('2026-11-10T12:00:00.000Z');
        expect(events['v1.1_livestream']).toBeUndefined();
        expect(events['v1.3_livestream']).toBeUndefined();
    });

    it('same time on every server', () => {
        expect(schedule({}, 'America')['v1.2_livestream'].date).toEqual(schedule({}, 'Asia')['v1.2_livestream'].date);
    });
});

describe('drip marketing', () => {
    it('labels and images', () => {
        const events = schedule();

        expect(events['v1.1_drip_day1']).toEqual({
            date: new Date('2026-08-31T04:00:00Z'),
            type: 'drip',
            portrait: false,
            label: 'TG 1.1 5★ Drip Marketing',
            title: 'TG 1.1 Drip',
            imgFiles: [img.game('1.1'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.2_drip_day1']).toMatchObject({
            label: 'TG 1.2 5★ Drip Marketing',
            imgFiles: [img.game('1.2'), img.game('1.1'), img.fallback],
        });
        expect(events['v1.3_drip_day1']).toMatchObject({
            label: 'TG 1.3 5★ Drip Marketing',
            imgFiles: [img.game('1.2'), img.game('1.1'), img.fallback],
        });
    });

    it.each([
        [true, true],
        [false, false],
        [undefined, null],
    ])('confirmed: %j shows as %j', (confirmed, expected) => {
        const events = schedule({ drip: { confirmed } });

        for (const event of Object.values(pick(events, 'v1.2_drip'))) {
            expect(event.confirmed).toBe(expected);
        }
    });

    it('week_start_rule moves to Monday', () => {
        expect(dates(pick(schedule({ drip: { distance: 5 } }), 'v1.2_drip'))).toEqual({
            'v1.2_drip_day1': '2026-10-12T04:00:00.000Z',
            'v1.2_drip_day2': '2026-10-13T04:00:00.000Z',
        });
        expect(dates(pick(schedule({ drip: { distance: 4 } }), 'v1.2_drip'))).toEqual({
            'v1.2_drip_day1': '2026-10-05T04:00:00.000Z',
            'v1.2_drip_day2': '2026-10-06T04:00:00.000Z',
        });
    });

    it('secondPhase anchor, single day', () => {
        const events = schedule({
            drip: { anchor: 'secondPhase', distance: 3, week_start_rule: false, same_day: true, time: '11:00' },
        });

        expect(dates(pick(events, 'v1.2_drip'))).toEqual({
            'v1.2_drip_day1': '2026-10-30T03:00:00.000Z',
        });
        expect(events['v1.1_drip_day2']).toBeUndefined();
    });

    it('livestream anchor', () => {
        const events = schedule({ drip: { anchor: 'livestream', distance: -4 } });

        expect(dates(pick(events, 'v1.1_drip'))).toEqual({
            'v1.1_drip_day1': '2026-09-21T04:00:00.000Z',
            'v1.1_drip_day2': '2026-09-22T04:00:00.000Z',
        });
        expect(events['v1.2_drip_day1'].date.toISOString()).toBe('2026-11-02T04:00:00.000Z');
        expect(events['v1.3_drip_day1'].date.toISOString()).toBe('2026-12-14T04:00:00.000Z');
    });

    it('livestream anchor without a livestream', () => {
        const events = schedule({
            livestream: { is_predictable: false, schedule: undefined },
            drip: { anchor: 'livestream', distance: -4 },
            current: { livestream_date: '2026-11-12' },
        });

        expect(Object.keys(pick(events, 'v1.1_drip'))).toEqual([]);
        expect(Object.keys(pick(events, 'v1.3_drip'))).toEqual([]);
        expect(events['v1.2_drip_day1'].date.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    });

    it('skipped without drip', () => {
        expect(pick(schedule({ drip: undefined }), 'v1.2_drip')).toEqual({});
    });
});

describe('patch history', () => {
    const withArchive = {
        patches: [
            patch('0.9', '2026-07-15', { phase_characters: { 1: ['Old'], 2: [] } }),
            patch('1.0', '2026-08-26'),
            patch('1.1', '2026-10-07'),
            patch('1.2', '2026-11-18'),
            { version: '1.3' },
        ],
    };

    it('every dated patch gets its events', () => {
        const events = schedule(withArchive);

        expect(events['v0.9_release']).toMatchObject({
            date: new Date('2026-07-15T03:00:00Z'),
            label: 'TG 0.9 - Old Release',
            imgFiles: [img.character('old'), img.game('0.9'), img.fallback],
            confirmed: true,
        });
        expect(events['v1.0_livestream'].label).toBe('TG 1.0 Livestream');
        expect(events['v1.0_drip_day1'].label).toBe('TG 1.0 5★ Drip Marketing');
        expect(events['v1.3_livestream']).toBeDefined();
    });

    it('current patch follows the date', () => {
        vi.setSystemTime(new Date('2026-11-20T00:00:00Z'));

        const events = schedule({ next: { is_version_duration_confirmed: false } });

        expect(events['v1.2_secondPhase'].confirmed).toBe(false);
        expect(events['v1.3_livestream']).toMatchObject({
            imgFiles: [img.livestream('1.3'), img.game('1.2'), img.fallback],
            confirmed: false,
        });
        expect(events['v1.3_drip_day1'].imgFiles).toEqual([img.game('1.2'), img.fallback]);
    });

    it('past patches never borrow the current patch art', () => {
        const events = schedule({ previous: { phase_characters: { 1: ['Alice'] } } });

        expect(events['v1.0_release'].imgFiles).toEqual([img.character('alice'), img.game('1.0'), img.fallback]);
    });

    it('version-only rows only name the next livestream and drip', () => {
        const events = schedule();

        expect(Object.keys(pick(events, 'v1.3_'))).toEqual([
            'v1.3_drip_day1',
            'v1.3_drip_day2',
            'v1.3_livestream',
        ]);
    });
});

describe('several games', () => {
    it('one broken game does not break others', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const result = createScheduleProcessor({
            Broken: makeGame({ patches: [patch('1.1', 'not a date'), { version: '1.2' }] }),
            Working: makeGame({ abbr: 'OK' }),
        }).computeScheduleData('Asia');

        expect(result.Broken).toEqual({});
        expect(result.Working['v1.1_release'].label).toBe('OK 1.1 Release');
        expect(errorSpy).toHaveBeenCalledWith('Failed to build Broken schedule:', expect.any(Error));
    });

    it('throws on invalid config', () => {
        expect(() => createScheduleProcessor({ Bad: makeGame({ maintenance: undefined }) })).toThrow(
            'Bad: missing maintenance.first_phase',
        );
    });

    it('does not mutate config', () => {
        const config = { [GAME]: makeGame({ current: { phase_characters: { 1: ['Alice', 'Bob'] } } }) };
        const copy = structuredClone(config);

        createScheduleProcessor(config).computeScheduleData('Asia');

        expect(config).toEqual(copy);
    });
});
