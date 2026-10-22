import {
    DAY,
    compileGameClock,
    secondPhaseDay,
    shiftDate,
    toDateKey,
    weekdayOf,
    zonedInstant,
} from '../../shared/serverTime.js';

import { slugify } from '../../shared/format.js';

export function createScheduleProcessor(GAME_CONFIG) {
    const CLOCKS = Object.fromEntries(
        Object.entries(GAME_CONFIG).map(([game, data]) => [game, compileGameClock(game, data)]),
    );

    const PATCHES = ['previous', 'current', 'next'];

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

    function patchImgs(game, gameData, version) {
        return [...new Set([gameImg(game, version), gameImg(game, gameData.current.version), defaultImg(game)])];
    }

    function getPhaseCharacters(patchData, phase) {
        return (patchData.phase_characters?.[phase] ?? []).filter(Boolean);
    }

    function formatCharacterLabel(characters) {
        return characters.join(' & ');
    }

    function buildTimeline(gameData, clock, server) {
        const globalAt = (dateKey, minutes) => zonedInstant(dateKey, minutes, clock.globalOffset);

        const openAt = (dateKey) =>
            globalAt(
                dateKey,
                clock.maintenance.first_phase.startMinutes + clock.maintenance.first_phase.durationMinutes,
            );

        const secondPhaseAt = (dateKey) => {
            const offset = clock.secondPhase.scope === 'server' ? clock.servers[server].offset : clock.globalOffset;

            return zonedInstant(dateKey, clock.secondPhase.minutes, offset);
        };

        const currentStart = toDateKey(gameData.current.version_start);
        const previousStart = shiftDate(currentStart, -gameData.previous.version_duration);
        const nextStart = shiftDate(currentStart, gameData.current.version_duration);
        const previousSecond = shiftDate(previousStart, secondPhaseDay(gameData.previous));
        const currentSecond = shiftDate(currentStart, secondPhaseDay(gameData.current));
        const nextSecond = shiftDate(nextStart, secondPhaseDay(gameData.next));

        return {
            globalAt,
            secondPhaseAt,
            dates: { previousStart, previousSecond, currentStart, currentSecond, nextStart, nextSecond },
            phases: {
                previous: { open: openAt(previousStart), secondPhase: secondPhaseAt(previousSecond) },
                current: { open: openAt(currentStart), secondPhase: secondPhaseAt(currentSecond) },
                next: { open: openAt(nextStart), secondPhase: secondPhaseAt(nextSecond) },
            },
        };
    }

    function getLivestreamDateKey(gameData, anchorDate, overrideDate = null) {
        if (overrideDate) return toDateKey(overrideDate);

        if (gameData.livestream.schedule === 'hoyo') {
            const weekLater = shiftDate(anchorDate, 7);
            return shiftDate(weekLater, (5 - weekdayOf(weekLater) + 7) % 7 || 7);
        }

        if (gameData.livestream.schedule === 'distance') {
            return shiftDate(anchorDate, gameData.livestream.distance);
        }

        return anchorDate;
    }

    function buildLivestreamKeys(gameData, timeline) {
        const anchorSuffix = gameData.livestream.schedule === 'hoyo' ? 'Second' : 'Start';
        const { is_predictable } = gameData.livestream;

        return Object.fromEntries(
            PATCHES.map((prefix) => {
                const override = gameData[prefix].livestream_date;

                return [
                    prefix,
                    is_predictable || override
                        ? getLivestreamDateKey(gameData, timeline.dates[`${prefix}${anchorSuffix}`], override)
                        : null,
                ];
            }),
        );
    }

    function buildCharacterTrailers(game, gameData, clock, timeline) {
        if (!gameData.character_trailer) return {};

        const { dates, globalAt } = timeline;

        const trailerEntries = PATCHES.flatMap((prefix) => {
            const patchData = gameData[prefix];

            return [
                {
                    phaseKey: `${prefix}_phase1`,
                    date: dates[`${prefix}Start`],
                    characters: getPhaseCharacters(patchData, '1'),
                },
                {
                    phaseKey: `${prefix}_phase2`,
                    date: dates[`${prefix}Second`],
                    characters: getPhaseCharacters(patchData, '2'),
                },
                ...(patchData.special_phases ?? []).map(({ date, characters }, index) => ({
                    phaseKey: `${prefix}_special${index + 1}`,
                    date,
                    characters,
                })),
            ].map((entry) => ({ ...entry, patchData }));
        });

        const characterTrailers = {};

        for (const { phaseKey, date, patchData, characters } of trailerEntries) {
            if (characters.length === 0) continue;

            const label = `${formatCharacterLabel(characters)} Trailer`;
            const rumored = label.includes('?');

            characterTrailers[`trailer_${phaseKey}`] = {
                date: globalAt(shiftDate(date, -gameData.character_trailer.distance), clock.trailerMinutes),
                type: 'trailer',
                portrait: !rumored,
                label,
                title: label,
                imgFiles: rumored
                    ? patchImgs(game, gameData, patchData.version)
                    : [characterImg(characters[0]), ...patchImgs(game, gameData, patchData.version)],
                confirmed: false,
            };
        }

        return characterTrailers;
    }

    function buildPhaseReleaseEvents(game, gameData, timeline) {
        const { phases } = timeline;
        const now = Date.now();
        const currentConfirmed = gameData.current.is_version_duration_confirmed;

        const phaseEntries = [
            {
                phaseDate: phases.previous.open,
                patchData: gameData.previous,
                phaseNum: '1',
                baseKey: 'previousRelease',
                confirmed: true,
            },
            {
                phaseDate: phases.previous.secondPhase,
                patchData: gameData.previous,
                phaseNum: '2',
                baseKey: 'previousSecondPhase',
                confirmed: true,
            },
            {
                phaseDate: phases.current.open,
                patchData: gameData.current,
                phaseNum: '1',
                baseKey: 'release',
                confirmed: true,
            },
            {
                phaseDate: phases.current.secondPhase,
                patchData: gameData.current,
                phaseNum: '2',
                baseKey: 'secondPhase',
                confirmed: currentConfirmed || phases.current.secondPhase.getTime() <= now,
            },
            {
                phaseDate: phases.next.open,
                patchData: gameData.next,
                phaseNum: '1',
                baseKey: 'nextPatchRelease',
                confirmed: currentConfirmed || phases.next.open.getTime() <= now,
            },
            {
                phaseDate: phases.next.secondPhase,
                patchData: gameData.next,
                phaseNum: '2',
                baseKey: 'nextPatchSecondPhase',
                confirmed: currentConfirmed && gameData.next.is_version_duration_confirmed,
            },
        ];

        const releaseEvents = {};

        for (const { phaseDate, patchData, phaseNum, baseKey, confirmed } of phaseEntries) {
            const characters = getPhaseCharacters(patchData, phaseNum);
            const version = patchData.version;
            const isPhase1 = phaseNum === '1';

            if (characters.length > 1) {
                for (const character of characters) {
                    releaseEvents[`${baseKey}_${slugify(character)}`] = {
                        date: phaseDate,
                        type: 'release',
                        portrait: true,
                        label: `${character} Release`,
                        title: `${character}`,
                        imgFiles: [characterImg(character), ...patchImgs(game, gameData, patchData.version)],
                        confirmed,
                    };
                }
            } else if (characters.length === 1) {
                const [character] = characters;
                releaseEvents[baseKey] = {
                    date: phaseDate,
                    type: 'release',
                    portrait: true,
                    label: isPhase1
                        ? `${gameData.abbr} ${version} - ${character} Release`
                        : `${gameData.abbr} ${version} 2nd Phase - ${character} Release`,
                    title: isPhase1 ? `${gameData.abbr} ${version}` : `${gameData.abbr} ${version} 2nd Phase`,
                    imgFiles: [characterImg(character), ...patchImgs(game, gameData, patchData.version)],
                    confirmed,
                };
            } else {
                releaseEvents[baseKey] = {
                    date: phaseDate,
                    type: isPhase1 ? 'release' : 'phase',
                    portrait: false,
                    label: `${gameData.abbr} ${version}${isPhase1 ? ' Release' : ' Second Phase'}`,
                    title: `${gameData.abbr} ${version}${isPhase1 ? '' : ' 2nd Phase'}`,
                    imgFiles: [gameImg(game, patchData.version), defaultImg(game)],
                    confirmed,
                };
            }
        }

        return releaseEvents;
    }

    function buildSpecialPhaseEvents(game, gameData, timeline) {
        const specialEvents = {};

        for (const prefix of PATCHES) {
            const patchData = gameData[prefix];

            for (const [index, { date, characters }] of (patchData.special_phases ?? []).entries()) {
                const phaseDate = timeline.secondPhaseAt(date);
                const baseKey = `${prefix}SpecialPhase${index + 1}`;
                const title = `${gameData.abbr} ${patchData.version} Special Phase`;

                if (characters.length === 0) {
                    specialEvents[baseKey] = {
                        date: phaseDate,
                        type: 'phase',
                        portrait: false,
                        label: title,
                        title,
                        imgFiles: [gameImg(game, patchData.version), defaultImg(game)],
                        confirmed: true,
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
                        imgFiles: [characterImg(character), ...patchImgs(game, gameData, patchData.version)],
                        confirmed: true,
                    };
                }
            }
        }

        return specialEvents;
    }

    function buildPatchTrailers(game, gameData, clock, timeline) {
        if (!gameData.patch_trailer_distance) return {};

        const patchTrailer = (startDate, duration, version) => ({
            date: timeline.globalAt(
                shiftDate(startDate, duration - gameData.patch_trailer_distance),
                clock.trailerMinutes,
            ),
            type: 'trailer',
            portrait: false,
            label: `${gameData.abbr} ${version} Trailer`,
            title: `${gameData.abbr} ${version} Trailer`,
            imgFiles: [gameImg(game, version), defaultImg(game)],
            confirmed: true,
        });

        const trailers = {};
        const hasLivestream = (patchData) => gameData.livestream.is_predictable || Boolean(patchData.livestream_date);

        if (!hasLivestream(gameData.previous)) {
            trailers.currentPatchTrailer = patchTrailer(
                timeline.dates.previousStart,
                gameData.previous.version_duration,
                gameData.current.version,
            );
        }

        if (!hasLivestream(gameData.current)) {
            trailers.nextPatchTrailer = patchTrailer(
                timeline.dates.currentStart,
                gameData.current.version_duration,
                gameData.next.version,
            );
        }

        return trailers;
    }

    function buildDripMarketing(game, gameData, clock, timeline, livestreamKeys) {
        if (!gameData.drip) return {};

        const { dates, globalAt } = timeline;
        const { anchor, distance, week_start_rule, same_day } = gameData.drip;

        const dripMarketingEntries = [
            {
                key: 'previous',
                anchors: {
                    patch: dates.previousStart,
                    secondPhase: dates.previousSecond,
                    livestream: livestreamKeys.previous,
                },
                versionNumber: gameData.current.version,
                imgVersion: gameData.current.version,
            },
            {
                key: 'current',
                anchors: {
                    patch: dates.currentStart,
                    secondPhase: dates.currentSecond,
                    livestream: livestreamKeys.current,
                },
                versionNumber: gameData.next.version,
                imgVersion: gameData.next.version,
            },
            {
                key: 'next',
                anchors: { patch: dates.nextStart, secondPhase: dates.nextSecond, livestream: livestreamKeys.next },
                versionNumber: gameData.next.future_livestream_version,
                imgVersion: gameData.next.version,
            },
        ];

        const dripMarketingDates = {};

        for (const { key, anchors, versionNumber, imgVersion } of dripMarketingEntries) {
            const anchorDate = anchors[anchor];
            if (!anchorDate) continue;

            let base = shiftDate(anchorDate, distance);

            if (week_start_rule) {
                base = shiftDate(base, -((weekdayOf(base) + 6) % 7));
            }

            for (let dayOffset = 0; dayOffset < (same_day ? 1 : 2); dayOffset++) {
                dripMarketingDates[`${key}DripMarketing_day${dayOffset + 1}`] = {
                    date: globalAt(shiftDate(base, dayOffset), clock.dripMinutes),
                    type: 'drip',
                    portrait: false,
                    label: `${gameData.abbr} ${versionNumber} 5★ Drip Marketing`,
                    title: `${gameData.abbr} ${versionNumber} Drip`,
                    imgFiles: patchImgs(game, gameData, imgVersion),
                    confirmed: true,
                };
            }
        }

        return dripMarketingDates;
    }

    function buildLivestreamEvents(game, gameData, clock, livestreamKeys) {
        const livestreamAt = (dateKey) =>
            dateKey ? zonedInstant(dateKey, clock.livestreamMinutes, clock.globalOffset) : null;

        const previousLivestreamDate = livestreamAt(livestreamKeys.previous);
        const livestreamDate = livestreamAt(livestreamKeys.current);
        const nextLivestreamDate = livestreamAt(livestreamKeys.next);

        const bothConfirmed =
            gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed;
        const showNextLivestream = bothConfirmed || Boolean(gameData.next.livestream_date);

        const livestreamEvents = {};

        if (previousLivestreamDate) {
            livestreamEvents.previousLivestream = {
                date: previousLivestreamDate,
                type: 'livestream',
                portrait: false,
                label: `${gameData.abbr} ${gameData.current.version} Livestream`,
                title: `${gameData.abbr} ${gameData.current.version} Livestream`,
                imgFiles: [
                    livestreamImg(game, gameData.current.version),
                    gameImg(game, gameData.previous.version),
                    defaultImg(game),
                ],
                confirmed: true,
            };
        }

        if (livestreamDate) {
            livestreamEvents.livestream = {
                date: livestreamDate,
                type: 'livestream',
                portrait: false,
                label: `${gameData.abbr} ${gameData.next.version} Livestream`,
                title: `${gameData.abbr} ${gameData.next.version} Livestream`,
                imgFiles: [
                    livestreamImg(game, gameData.next.version),
                    gameImg(game, gameData.current.version),
                    defaultImg(game),
                ],
                confirmed:
                    Boolean(gameData.current.livestream_date) || livestreamDate.getTime() - Date.now() <= 3 * DAY,
            };
        }

        if (showNextLivestream && nextLivestreamDate) {
            livestreamEvents.nextLivestream = {
                date: nextLivestreamDate,
                type: 'livestream',
                portrait: false,
                label: `${gameData.abbr} ${gameData.next.future_livestream_version} Livestream`,
                title: `${gameData.abbr} ${gameData.next.future_livestream_version} Livestream`,
                imgFiles: [
                    livestreamImg(game, gameData.next.future_livestream_version),
                    gameImg(game, gameData.next.version),
                    gameImg(game, gameData.current.version),
                    defaultImg(game),
                ],
                confirmed: Boolean(gameData.next.livestream_date),
            };
        }

        return livestreamEvents;
    }

    function buildGameSchedule(game, gameData, server) {
        const clock = CLOCKS[game];

        if (clock.secondPhase.scope === 'server' && !clock.servers[server]) {
            return {};
        }

        const timeline = buildTimeline(gameData, clock, server);
        const livestreamKeys = buildLivestreamKeys(gameData, timeline);

        return {
            ...buildCharacterTrailers(game, gameData, clock, timeline),
            ...buildPatchTrailers(game, gameData, clock, timeline),
            ...buildPhaseReleaseEvents(game, gameData, timeline),
            ...buildSpecialPhaseEvents(game, gameData, timeline),
            ...buildDripMarketing(game, gameData, clock, timeline, livestreamKeys),
            ...buildLivestreamEvents(game, gameData, clock, livestreamKeys),
        };
    }

    function computeScheduleData(server) {
        const entries = Object.entries(GAME_CONFIG).map(([game, gameData]) => {
            try {
                return [game, buildGameSchedule(game, gameData, server)];
            } catch (err) {
                console.error(`Failed to build ${game} schedule:`, err);
                return [game, {}];
            }
        });

        return Object.fromEntries(entries);
    }

    return { computeScheduleData };
}
