import { DAY, compileGameClock, shiftDate, weekdayOf, zonedInstant } from '../../shared/serverTime.js';
import {
    currentPatchIndex,
    isDated,
    patchEndDate,
    patchSecondPhaseDate,
    patchStartDate,
} from '../../shared/patches.js';
import { slugify } from '../../shared/format.js';

export function createScheduleProcessor(GAME_CONFIG) {
    const CLOCKS = Object.fromEntries(
        Object.entries(GAME_CONFIG).map(([game, data]) => [game, compileGameClock(game, data)]),
    );

    function defaultImg(game) {
        return `games/${slugify(game)}_default.webp`;
    }

    function characterImg(name) {
        return `characters/${slugify(name)}.webp`;
    }

    function gameImg(game, version) {
        return `games/${slugify(game)}_${version}.webp`;
    }

    function livestreamImg(game, version) {
        return `games/${slugify(game)}_${version}_livestream.webp`;
    }

    function getPhaseCharacters(patchData, phase) {
        return (patchData.phase_characters?.[phase] ?? []).filter(Boolean);
    }

    function formatCharacterLabel(characters) {
        return characters.join(' & ');
    }

    function buildTimeline(game, gameData, clock, server, now) {
        const globalAt = (dateKey, minutes) => zonedInstant(dateKey, minutes, clock.globalOffset);

        const openAt = (dateKey) =>
            globalAt(
                dateKey,
                clock.maintenance.first_phase.startMinutes + clock.maintenance.first_phase.durationMinutes,
            );

        const secondPhaseAt = (dateKey) => {
            const zone = clock.secondPhase.scope === 'server' ? clock.servers[server].zone : clock.globalOffset;

            return zonedInstant(dateKey, clock.secondPhase.minutes, zone);
        };

        const patches = gameData.patches;
        const current = currentPatchIndex(gameData, now);
        const currentVersion = patches[current].version;

        const imgsFor = (version, index) => [
            ...new Set([
                gameImg(game, version),
                ...(index > current ? [gameImg(game, currentVersion)] : []),
                defaultImg(game),
            ]),
        ];

        const entries = [];
        let startConfirmed = true;

        for (const [index, patch] of patches.entries()) {
            if (!isDated(patch)) break;

            if (index > current) {
                startConfirmed = startConfirmed && Boolean(patches[index - 1].is_version_duration_confirmed);
            }

            const start = patchStartDate(patch);
            const second = patchSecondPhaseDate(patch);

            entries.push({
                index,
                patch,
                successor: patches[index + 1] ?? null,
                relation: Math.sign(index - current),
                start,
                second,
                end: patchEndDate(patch),
                open: openAt(start),
                secondPhase: secondPhaseAt(second),
                startConfirmed,
                imgs: imgsFor(patch.version, index),
            });
        }

        return { globalAt, secondPhaseAt, entries, imgsFor, now };
    }

    function getLivestreamDateKey(gameData, anchorDate, overrideDate = null) {
        if (overrideDate) return overrideDate;

        if (gameData.livestream.schedule === 'hoyo') {
            const weekLater = shiftDate(anchorDate, 7);
            return shiftDate(weekLater, (5 - weekdayOf(weekLater) + 7) % 7 || 7);
        }

        if (gameData.livestream.schedule === 'distance') {
            return shiftDate(anchorDate, gameData.livestream.distance);
        }

        return anchorDate;
    }

    function livestreamKeyFor(gameData, entry) {
        const override = entry.patch.livestream_date;

        if (!gameData.livestream.is_predictable && !override) return null;

        const anchor = gameData.livestream.schedule === 'hoyo' ? entry.second : entry.start;

        return getLivestreamDateKey(gameData, anchor, override);
    }

    function buildCharacterTrailers(game, gameData, clock, timeline) {
        if (!gameData.character_trailer) return {};

        const { globalAt } = timeline;
        const characterTrailers = {};

        for (const entry of timeline.entries) {
            const { patch } = entry;
            const phases = [
                { phaseKey: 'phase1', date: entry.start, characters: getPhaseCharacters(patch, '1') },
                { phaseKey: 'phase2', date: entry.second, characters: getPhaseCharacters(patch, '2') },
                ...(patch.special_phases ?? []).map(({ date, characters }, index) => ({
                    phaseKey: `special${index + 1}`,
                    date,
                    characters,
                })),
            ];

            for (const { phaseKey, date, characters } of phases) {
                if (characters.length === 0) continue;

                const label = `${formatCharacterLabel(characters)} Trailer`;
                const rumored = label.includes('?');

                characterTrailers[`v${patch.version}_trailer_${phaseKey}`] = {
                    date: globalAt(shiftDate(date, -gameData.character_trailer.distance), clock.trailerMinutes),
                    type: 'trailer',
                    portrait: !rumored,
                    label,
                    title: label,
                    imgFiles: rumored ? entry.imgs : [characterImg(characters[0]), ...entry.imgs],
                    confirmed: false,
                };
            }
        }

        return characterTrailers;
    }

    function phaseReleaseEvents(game, gameData, entry, { phaseDate, phaseNum, baseKey, confirmed }) {
        const { patch } = entry;
        const characters = getPhaseCharacters(patch, phaseNum);
        const version = patch.version;
        const isPhase1 = phaseNum === '1';
        const events = {};

        if (characters.length > 1) {
            for (const character of characters) {
                events[`${baseKey}_${slugify(character)}`] = {
                    date: phaseDate,
                    type: 'release',
                    portrait: true,
                    label: `${character} Release`,
                    title: `${character}`,
                    imgFiles: [characterImg(character), ...entry.imgs],
                    confirmed,
                };
            }
        } else if (characters.length === 1) {
            const [character] = characters;
            events[baseKey] = {
                date: phaseDate,
                type: 'release',
                portrait: true,
                label: isPhase1
                    ? `${gameData.abbr} ${version} - ${character} Release`
                    : `${gameData.abbr} ${version} 2nd Phase - ${character} Release`,
                title: isPhase1 ? `${gameData.abbr} ${version}` : `${gameData.abbr} ${version} 2nd Phase`,
                imgFiles: [characterImg(character), ...entry.imgs],
                confirmed,
            };
        } else {
            events[baseKey] = {
                date: phaseDate,
                type: isPhase1 ? 'release' : 'phase',
                portrait: false,
                label: `${gameData.abbr} ${version}${isPhase1 ? ' Release' : ' Second Phase'}`,
                title: `${gameData.abbr} ${version}${isPhase1 ? '' : ' 2nd Phase'}`,
                imgFiles: [gameImg(game, version), defaultImg(game)],
                confirmed,
            };
        }

        return events;
    }

    function buildPhaseReleaseEvents(game, gameData, timeline) {
        const now = timeline.now.getTime();
        const releaseEvents = {};

        for (const entry of timeline.entries) {
            const { patch, relation, startConfirmed } = entry;
            const durationConfirmed = Boolean(patch.is_version_duration_confirmed);

            Object.assign(
                releaseEvents,
                phaseReleaseEvents(game, gameData, entry, {
                    phaseDate: entry.open,
                    phaseNum: '1',
                    baseKey: `v${patch.version}_release`,
                    confirmed: relation <= 0 || startConfirmed || entry.open.getTime() <= now,
                }),
                phaseReleaseEvents(game, gameData, entry, {
                    phaseDate: entry.secondPhase,
                    phaseNum: '2',
                    baseKey: `v${patch.version}_secondPhase`,
                    confirmed:
                        relation < 0 || entry.secondPhase.getTime() <= now || (startConfirmed && durationConfirmed),
                }),
            );
        }

        return releaseEvents;
    }

    function buildSpecialPhaseEvents(game, gameData, timeline) {
        const specialEvents = {};

        for (const entry of timeline.entries) {
            const { patch } = entry;
            const confirmed = patch.special_phase_confirmed ?? true;

            for (const [index, { date, characters }] of (patch.special_phases ?? []).entries()) {
                const phaseDate = timeline.secondPhaseAt(date);
                const baseKey = `v${patch.version}_specialPhase${index + 1}`;
                const title = `${gameData.abbr} ${patch.version} Special Phase`;

                if (characters.length === 0) {
                    specialEvents[baseKey] = {
                        date: phaseDate,
                        type: 'phase',
                        portrait: false,
                        label: title,
                        title,
                        imgFiles: [gameImg(game, patch.version), defaultImg(game)],
                        confirmed,
                    };
                    continue;
                }

                for (const character of characters) {
                    specialEvents[`${baseKey}_${slugify(character)}`] = {
                        date: phaseDate,
                        type: 'release',
                        portrait: true,
                        label: characters.length > 1 ? `${character} Release` : `${title} - ${character} Release`,
                        title: characters.length > 1 ? character : title,
                        imgFiles: [characterImg(character), ...entry.imgs],
                        confirmed,
                    };
                }
            }
        }

        return specialEvents;
    }

    function buildPatchTrailers(game, gameData, clock, timeline) {
        if (!gameData.patch_trailer_distance) return {};

        const trailers = {};

        for (const entry of timeline.entries) {
            const { patch, successor } = entry;

            if (!isDated(successor)) continue;
            if (gameData.livestream.is_predictable || patch.livestream_date) continue;

            trailers[`v${successor.version}_patchTrailer`] = {
                date: timeline.globalAt(shiftDate(entry.end, -gameData.patch_trailer_distance), clock.trailerMinutes),
                type: 'trailer',
                portrait: false,
                label: `${gameData.abbr} ${successor.version} Trailer`,
                title: `${gameData.abbr} ${successor.version} Trailer`,
                imgFiles: [gameImg(game, successor.version), defaultImg(game)],
                confirmed: true,
            };
        }

        return trailers;
    }

    function buildDripMarketing(game, gameData, clock, timeline) {
        if (!gameData.drip) return {};

        const { globalAt } = timeline;
        const { anchor, distance, week_start_rule, same_day, confirmed } = gameData.drip;
        const dripMarketingDates = {};

        for (const entry of timeline.entries) {
            const { successor } = entry;

            if (!successor) continue;

            const anchorDate = {
                patch: entry.start,
                secondPhase: entry.second,
                livestream: livestreamKeyFor(gameData, entry),
            }[anchor];

            if (!anchorDate) continue;

            const imgFiles = isDated(successor) ? timeline.imgsFor(successor.version, entry.index + 1) : entry.imgs;

            let base = shiftDate(anchorDate, distance);

            if (week_start_rule) {
                base = shiftDate(base, -((weekdayOf(base) + 6) % 7));
            }

            for (let dayOffset = 0; dayOffset < (same_day ? 1 : 2); dayOffset++) {
                dripMarketingDates[`v${successor.version}_drip_day${dayOffset + 1}`] = {
                    date: globalAt(shiftDate(base, dayOffset), clock.dripMinutes),
                    type: 'drip',
                    portrait: false,
                    label: `${gameData.abbr} ${successor.version} 5★ Drip Marketing`,
                    title: `${gameData.abbr} ${successor.version} Drip`,
                    imgFiles,
                    confirmed: confirmed ?? null,
                };
            }
        }

        return dripMarketingDates;
    }

    function buildLivestreamEvents(game, gameData, clock, timeline) {
        const now = timeline.now.getTime();
        const livestreamEvents = {};

        for (const entry of timeline.entries) {
            const { patch, successor, relation, startConfirmed } = entry;

            if (!successor) continue;

            const dateKey = livestreamKeyFor(gameData, entry);

            if (!dateKey) continue;

            const hasDate = Boolean(patch.livestream_date);

            if (relation > 0 && !hasDate && !(startConfirmed && patch.is_version_duration_confirmed)) continue;

            const date = zonedInstant(dateKey, clock.livestreamMinutes, clock.globalOffset);
            const label = `${gameData.abbr} ${successor.version} Livestream`;

            livestreamEvents[`v${successor.version}_livestream`] = {
                date,
                type: 'livestream',
                portrait: false,
                label,
                title: label,
                imgFiles: [livestreamImg(game, successor.version), ...entry.imgs],
                confirmed: relation < 0 || hasDate || (relation === 0 && date.getTime() - now <= 3 * DAY),
            };
        }

        return livestreamEvents;
    }

    function buildGameSchedule(game, gameData, server, now) {
        const clock = CLOCKS[game];

        if (clock.secondPhase.scope === 'server' && !clock.servers[server]) {
            return {};
        }

        const timeline = buildTimeline(game, gameData, clock, server, now);

        return {
            ...buildCharacterTrailers(game, gameData, clock, timeline),
            ...buildPatchTrailers(game, gameData, clock, timeline),
            ...buildPhaseReleaseEvents(game, gameData, timeline),
            ...buildSpecialPhaseEvents(game, gameData, timeline),
            ...buildDripMarketing(game, gameData, clock, timeline),
            ...buildLivestreamEvents(game, gameData, clock, timeline),
        };
    }

    function computeScheduleData(server, now = new Date()) {
        const entries = Object.entries(GAME_CONFIG).map(([game, gameData]) => {
            try {
                return [game, buildGameSchedule(game, gameData, server, now)];
            } catch (err) {
                console.error(`Failed to build ${game} schedule:`, err);
                return [game, {}];
            }
        });

        return Object.fromEntries(entries);
    }

    return { computeScheduleData };
}
