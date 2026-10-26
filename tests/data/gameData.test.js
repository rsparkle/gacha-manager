import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResetProcessor } from '../../src/shared/resetProcessor.js';
import { createScheduleProcessor } from '../../src/renderer/lib/scheduleProcessor.js';
import { SCHEDULE_SERVERS } from '../../src/shared/gameData.js';
import { DAY, HOUR, compileGameClock, localDate, shiftDate, toDateKey } from '../../src/shared/serverTime.js';
import { makeAccount } from '../helpers/builders.js';
import { loadGameData } from '../helpers/gameDataSource.js';

const { source, config, tasks, now } = await loadGameData();
const games = Object.keys(config);

const TASK_TYPES = ['Daily', 'Weekly', 'Endgame', 'Event', 'Seasonal'];
const EVENT_TYPES = ['release', 'phase', 'trailer', 'drip', 'livestream'];
const PATCHES = ['previous', 'current', 'next'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIMULATED_DAYS = 400;
const SIMULATION_STEP = 5 * HOUR;
const MAX_PROBLEMS = 20;

function isDateKey(value) {
    return typeof value === 'string' && DATE.test(value) && toDateKey(value) === value;
}

function patchStarts(game) {
    const currentStart = toDateKey(game.current.version_start);
    const previousStart = shiftDate(currentStart, -game.previous.version_duration);
    const nextStart = shiftDate(currentStart, game.current.version_duration);
    const afterNext = shiftDate(nextStart, game.next.version_duration);

    return {
        previous: [previousStart, currentStart],
        current: [currentStart, nextStart],
        next: [nextStart, afterNext],
    };
}

function firstEvent(events, baseKey) {
    const match = Object.entries(events).find(([key]) => key === baseKey || key.startsWith(`${baseKey}_`));

    return match?.[1];
}

function wallMinutes(instant, zone) {
    const local = localDate(instant, zone);

    return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function simulateResets(gameName, serverName) {
    const game = config[gameName];
    const processor = createResetProcessor({ [gameName]: game }, { [gameName]: tasks[gameName] });
    const server = compileGameClock(gameName, game).servers[serverName];
    const definitions = new Map(tasks[gameName].tasks.map((task) => [task.id, task.reset]));
    const lastNext = new Map();
    const problems = [];
    const start = now.getTime() - 30 * DAY;
    const end = now.getTime() + SIMULATED_DAYS * DAY;

    const check = (ok, message) => {
        if (!ok && problems.length < MAX_PROBLEMS) problems.push(message);
    };

    for (let time = start; time < end; time += SIMULATION_STEP) {
        const account = makeAccount(tasks[gameName], { server: serverName });

        processor.computeSingleAccountResetData(account, gameName, new Date(time));

        for (const task of Object.values(account.tasks).flat()) {
            if (task.isDisabled) continue;

            const where = `${task.id} at ${new Date(time).toISOString()}`;

            if (task.duration === null) {
                check(task.nextReset === null, `${where}: open window has a next reset`);
                continue;
            }

            check(task.nextReset > 0 && task.nextReset <= task.duration, `${where}: next reset outside its window`);

            const next = new Date(time + task.nextReset);
            const reset = definitions.get(task.id);

            if (['daily', 'weekly', 'monthly'].includes(reset.kind)) {
                check(
                    wallMinutes(next, server.zone) === server.resetMinutes,
                    `${where}: resets at ${localDate(next, server.zone).toISOString()} server time`,
                );
            }

            if (reset.kind === 'daily') {
                check(
                    [23 * HOUR, DAY, 25 * HOUR].includes(task.duration),
                    `${where}: day lasts ${task.duration / HOUR}h`,
                );
            }

            if (reset.kind === 'weekly') {
                const weekday = reset.weekday ?? game.weekly_reset_weekday;

                check(localDate(next, server.zone).getUTCDay() === weekday, `${where}: resets on the wrong weekday`);
                check(Math.abs(task.duration - 7 * DAY) <= HOUR, `${where}: week lasts ${task.duration / HOUR}h`);
            }

            if (reset.kind === 'interval' && !reset.patchCollision) {
                check(
                    Math.abs(task.duration - reset.intervalDays * DAY) <= HOUR,
                    `${where}: cycle lasts ${task.duration / HOUR}h`,
                );
            }

            if (reset.kind !== 'window') {
                check(next.getTime() >= (lastNext.get(task.id) ?? 0), `${where}: next reset moved backwards`);
                lastNext.set(task.id, next.getTime());
            }
        }
    }

    return problems;
}

let errorSpy;

beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    expect(errorSpy, 'something was logged with console.error').not.toHaveBeenCalled();
});

describe(`game data from ${source}`, () => {
    it('same games in config and tasks', () => {
        expect(games.length).toBeGreaterThan(0);
        expect(Object.keys(tasks).sort()).toEqual([...games].sort());
    });

    it('passes app validation', () => {
        expect(() => createResetProcessor(config, tasks)).not.toThrow();
        expect(() => createScheduleProcessor(config)).not.toThrow();
    });

    it('task ids unique across games', () => {
        const ids = Object.values(tasks).flatMap((game) => game.tasks.map((task) => task.id));

        expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    });

    it('unique abbr and color', () => {
        const abbrs = games.map((game) => config[game].abbr);
        const colors = games.map((game) => config[game].color.toLowerCase());

        expect(new Set(abbrs).size).toBe(abbrs.length);
        expect(new Set(colors).size).toBe(colors.length);
    });

    describe.each(games)('%s', (gameName) => {
        const game = config[gameName];
        const gameTasks = tasks[gameName]?.tasks ?? [];
        const clock = compileGameClock(gameName, game);

        describe('config', () => {
            it('required fields', () => {
                expect(game.abbr).toMatch(/^\S+$/);
                expect(game.color).toMatch(/^#[0-9a-f]{6}$/i);
                expect(game.process).toMatch(/\.exe$/i);
                expect(game.monthlySub).toEqual(expect.any(String));
                expect(game.monthlySub.trim()).not.toBe('');
                expect(Number.isInteger(game.uid_digits) && game.uid_digits > 0).toBe(true);
                expect(typeof game.has_uid_pattern).toBe('boolean');
                expect(game.global_utc_offset).toBeGreaterThanOrEqual(-12);
                expect(game.global_utc_offset).toBeLessThanOrEqual(14);
                expect(Number.isInteger(game.weekly_reset_weekday ?? 0)).toBe(true);
            });

            it('servers have a zone and unique uid prefix', () => {
                const servers = Object.entries(game.servers);

                for (const [name, server] of servers) {
                    expect(
                        Number.isFinite(server.utc_offset) || typeof server.timezone === 'string',
                        `${name} needs utc_offset or timezone`,
                    ).toBe(true);
                }

                if (game.has_uid_pattern) {
                    const prefixes = servers.map(([, server]) => server.uid_prefix);

                    for (const prefix of prefixes) {
                        expect(Number.isInteger(prefix) && prefix >= 0 && prefix <= 9).toBe(true);
                    }

                    expect(new Set(prefixes).size).toBe(prefixes.length);
                }
            });

            it.runIf(clock.secondPhase.scope === 'server')('has the schedule servers', () => {
                expect(Object.keys(game.servers)).toEqual(expect.arrayContaining(SCHEDULE_SERVERS));
            });

            it('patches', () => {
                const versions = PATCHES.map((key) => game[key].version);

                expect(new Set([...versions, game.next.future_livestream_version]).size).toBe(4);
                expect(isDateKey(game.current.version_start)).toBe(true);
                expect(typeof game.next.future_livestream_version).toBe('string');

                for (const key of PATCHES) {
                    const patch = game[key];

                    expect(patch.version, key).toMatch(/^\d+\.\d+$/);
                    expect(Number.isInteger(patch.version_duration) && patch.version_duration > 0, key).toBe(true);
                    expect(Number.isInteger(patch.second_phase_offset ?? 0), key).toBe(true);
                    expect(patch.livestream_date == null || isDateKey(patch.livestream_date), key).toBe(true);

                    for (const characters of Object.values(patch.phase_characters ?? {})) {
                        expect(Array.isArray(characters), key).toBe(true);
                        expect(
                            characters.every((name) => typeof name === 'string'),
                            key,
                        ).toBe(true);
                    }

                    for (const phase of patch.special_phases ?? []) {
                        expect(isDateKey(phase.date), `${key} special phase date`).toBe(true);
                        expect(Array.isArray(phase.characters), `${key} special phase characters`).toBe(true);
                        if (patch.special_phase_confirmed !== undefined) {
                            expect(typeof patch.special_phase_confirmed, `${key} special_phase_confirmed`).toBe('boolean');
                        }
                    }
                }

                for (const key of ['current', 'next']) {
                    expect(typeof game[key].is_version_duration_confirmed, key).toBe('boolean');
                }
            });

            it('dates fall inside their patch', () => {
                const starts = patchStarts(game);

                for (const key of PATCHES) {
                    const [start, end] = starts[key];
                    const second = shiftDate(
                        start,
                        Math.ceil(game[key].version_duration / 2) + (game[key].second_phase_offset ?? 0),
                    );
                    const inside = (date) => date > start && date < end;

                    expect(inside(second), `${key} second phase ${second}`).toBe(true);

                    for (const phase of game[key].special_phases ?? []) {
                        expect(phase.date >= start && phase.date < end, `${key} special phase ${phase.date}`).toBe(
                            true,
                        );
                    }

                    if (game[key].livestream_date) {
                        expect(
                            inside(game[key].livestream_date),
                            `${key} livestream ${game[key].livestream_date}`,
                        ).toBe(true);
                    }
                }
            });
        });

        describe('schedule', () => {
            beforeEach(() => {
                vi.useFakeTimers({ toFake: ['Date'] });
                vi.setSystemTime(now);
            });

            afterEach(() => {
                vi.useRealTimers();
            });

            const servers = SCHEDULE_SERVERS.filter(
                (server) => clock.secondPhase.scope === 'global' || Object.hasOwn(game.servers, server),
            );

            it.each(servers)('valid events on %s', (server) => {
                const events = createScheduleProcessor({ [gameName]: game }).computeScheduleData(server)[gameName];

                expect(Object.keys(events).length).toBeGreaterThan(0);

                for (const [key, event] of Object.entries(events)) {
                    expect(Number.isFinite(event.date?.getTime()), `${key} date`).toBe(true);
                    expect(EVENT_TYPES, `${key} type`).toContain(event.type);
                    expect(event.label, `${key} label`).toMatch(/\S/);
                    expect(event.title, `${key} title`).toMatch(/\S/);
                    expect(event.label, `${key} label`).not.toMatch(/undefined|null|NaN/);
                    expect(typeof event.portrait, `${key} portrait`).toBe('boolean');
                    expect([true, false, null], `${key} confirmed`).toContain(event.confirmed);
                    expect(event.imgFiles.length, `${key} images`).toBeGreaterThan(0);

                    for (const file of event.imgFiles) {
                        expect(file, key).toMatch(/^(games|characters)\/[a-z0-9_.]+\.webp$/);
                    }
                }
            });

            it.each(servers)('events in order on %s', (server) => {
                const events = createScheduleProcessor({ [gameName]: game }).computeScheduleData(server)[gameName];
                const order = [
                    'previousRelease',
                    'previousSecondPhase',
                    'release',
                    'secondPhase',
                    'nextPatchRelease',
                    'nextPatchSecondPhase',
                ].map((key) => [key, firstEvent(events, key)?.date.getTime()]);

                for (const [key, time] of order) {
                    expect(Number.isFinite(time), `${key} missing`).toBe(true);
                }

                for (let i = 1; i < order.length; i++) {
                    expect(order[i][1], `${order[i - 1][0]} -> ${order[i][0]}`).toBeGreaterThan(order[i - 1][1]);
                }

                if (events.livestream) {
                    expect(events.livestream.date.getTime()).toBeGreaterThan(
                        firstEvent(events, 'release').date.getTime(),
                    );
                    expect(events.livestream.date.getTime()).toBeLessThan(
                        firstEvent(events, 'nextPatchRelease').date.getTime(),
                    );
                }
            });
        });

        describe('tasks', () => {
            it('task ids, labels and types', () => {
                expect(gameTasks.length).toBeGreaterThan(0);

                for (const task of gameTasks) {
                    expect(task.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
                    expect(task.label, task.id).toMatch(/\S/);
                    expect(TASK_TYPES, task.id).toContain(task.type);
                }
            });

            it('has a daily task', () => {
                expect(gameTasks.some((task) => task.type === 'Daily' && task.reset.kind === 'daily')).toBe(true);
            });

            it.each(Object.keys(game.servers))(
                `every reset window is valid for ${SIMULATED_DAYS} days on %s`,
                (serverName) => {
                    expect(simulateResets(gameName, serverName)).toEqual([]);
                },
            );
        });
    });
});
