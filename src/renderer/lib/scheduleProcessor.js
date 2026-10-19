import {
    DAY,
    compileGameClock,
    localDate,
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
        const nextStart = shiftDate(currentStart, gameData.current.version_duration);
        const currentSecond = shiftDate(currentStart, secondPhaseDay(gameData.current));
        const nextSecond = shiftDate(nextStart, secondPhaseDay(gameData.next));

        return {
            globalAt,
            dates: { currentStart, currentSecond, nextStart, nextSecond },
            phases: {
                current: { open: openAt(currentStart), secondPhase: secondPhaseAt(currentSecond) },
                next: { open: openAt(nextStart), secondPhase: secondPhaseAt(nextSecond) },
            },
        };
    }

    function getLivestreamDate(gameData, clock, anchorDate, overrideDate = null) {
        let dateKey;

        if (overrideDate) {
            dateKey = toDateKey(overrideDate);
        } else if (gameData.livestream.schedule === 'hoyo') {
            const weekLater = shiftDate(anchorDate, 7);
            dateKey = shiftDate(weekLater, (5 - weekdayOf(weekLater) + 7) % 7 || 7);
        } else if (gameData.livestream.schedule === 'distance') {
            dateKey = shiftDate(anchorDate, gameData.livestream.distance);
        } else {
            dateKey = anchorDate;
        }

        return zonedInstant(dateKey, clock.livestreamMinutes, clock.globalOffset);
    }

    function getMondayOfSameWeek(instant, utcOffset) {
        const day = localDate(instant, utcOffset).getUTCDay();
        return new Date(instant.getTime() - (day === 0 ? 6 : day - 1) * DAY);
    }

    function buildCharacterTrailers(game, gameData, clock, timeline) {
        if (!gameData.character_trailer) return {};

        const { dates, globalAt } = timeline;

        const trailerEntries = [
            { phaseKey: 'current_phase1', date: dates.currentStart, patchData: gameData.current, phaseNum: '1' },
            { phaseKey: 'current_phase2', date: dates.currentSecond, patchData: gameData.current, phaseNum: '2' },
            { phaseKey: 'next_phase1', date: dates.nextStart, patchData: gameData.next, phaseNum: '1' },
            { phaseKey: 'next_phase2', date: dates.nextSecond, patchData: gameData.next, phaseNum: '2' },
        ];

        const characterTrailers = {};

        for (const { phaseKey, date, patchData, phaseNum } of trailerEntries) {
            const characters = getPhaseCharacters(patchData, phaseNum);
            if (characters.length === 0) continue;

            const label = `${formatCharacterLabel(characters)} Trailer`;

            characterTrailers[`trailer_${phaseKey}`] = {
                date: globalAt(shiftDate(date, -gameData.character_trailer.distance), clock.trailerMinutes),
                type: 'trailer',
                portrait: true,
                label,
                title: label,
                imgFiles: [characterImg(characters[0]), ...patchImgs(game, gameData, patchData.version)],
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

    function buildPatchTrailers(game, gameData, clock, timeline) {
        const hasPatchTrailerDistance = !!gameData.patch_trailer_distance;
        const needsPatchTrailer = !gameData.livestream.is_predictable || !gameData.livestream.date;

        if (!hasPatchTrailerDistance || !needsPatchTrailer) return {};

        const trailerDay = shiftDate(
            timeline.dates.currentStart,
            gameData.current.version_duration - gameData.patch_trailer_distance,
        );

        return {
            nextPatchTrailer: {
                date: timeline.globalAt(trailerDay, clock.trailerMinutes),
                type: 'trailer',
                portrait: false,
                label: `${gameData.abbr} ${gameData.next.version} Trailer`,
                title: `${gameData.abbr} ${gameData.next.version} Trailer`,
                imgFiles: [gameImg(game, gameData.next.version), defaultImg(game)],
                confirmed: true,
            },
        };
    }

    function buildDripMarketing(game, gameData, clock, timeline, livestreamDate, nextLivestreamDate) {
        const dripMarketingDates = {};

        const dripMarketingEntries = [
            {
                key: 'current',
                openDate: timeline.phases.current.open,
                associatedLivestream: livestreamDate,
                versionNumber: gameData.next.version,
            },
            {
                key: 'next',
                openDate: timeline.phases.next.open,
                associatedLivestream: nextLivestreamDate,
                versionNumber: gameData.next.future_livestream_version,
            },
        ];

        for (const { key, openDate, associatedLivestream, versionNumber } of dripMarketingEntries) {
            if (!gameData.drip) return {};

            const anchor = gameData.drip.anchor === 'patch' ? openDate : associatedLivestream;

            if (!anchor || isNaN(anchor.getTime())) continue;

            let base = new Date(anchor.getTime() + (Number(gameData.drip.distance) || 0) * DAY);

            if (gameData.drip.week_start_rule) {
                base = getMondayOfSameWeek(base, clock.globalOffset);
            }

            for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
                dripMarketingDates[`${key}DripMarketing_day${dayOffset + 1}`] = {
                    date: new Date(base.getTime() + dayOffset * DAY),
                    type: 'drip',
                    portrait: false,
                    label: `${gameData.abbr} ${versionNumber} 5★ Drip Marketing`,
                    title: `${gameData.abbr} ${versionNumber} Drip`,
                    imgFiles: [gameImg(game, gameData.next.version), defaultImg(game)],
                    confirmed: true,
                };
            }
        }

        return dripMarketingDates;
    }

    function buildGameSchedule(game, gameData, server) {
        const clock = CLOCKS[game];

        if (clock.secondPhase.scope === 'server' && !clock.servers[server]) {
            return {};
        }

        const timeline = buildTimeline(gameData, clock, server);
        const { dates } = timeline;

        const [anchorNow, anchorNext] =
            gameData.livestream.schedule === 'hoyo'
                ? [dates.currentSecond, dates.nextSecond]
                : [dates.currentStart, dates.nextStart];

        const livestreamDate =
            gameData.livestream.is_predictable || gameData.livestream.date
                ? getLivestreamDate(gameData, clock, anchorNow, gameData.livestream.date)
                : null;

        const nextLivestreamDate = gameData.livestream.is_predictable
            ? getLivestreamDate(gameData, clock, anchorNext)
            : null;

        const characterTrailers = buildCharacterTrailers(game, gameData, clock, timeline);
        const patchTrailers = buildPatchTrailers(game, gameData, clock, timeline);
        const releaseEvents = buildPhaseReleaseEvents(game, gameData, timeline);
        const dripMarketingDates = buildDripMarketing(
            game,
            gameData,
            clock,
            timeline,
            livestreamDate,
            nextLivestreamDate,
        );

        const bothConfirmed =
            gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed;

        const livestreamEvents = {
            ...(livestreamDate
                ? {
                      livestream: {
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
                          confirmed: livestreamDate.getTime() - Date.now() <= 3 * DAY,
                      },
                  }
                : {}),
            ...(bothConfirmed && nextLivestreamDate
                ? {
                      nextLivestream: {
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
                          confirmed: false,
                      },
                  }
                : {}),
        };

        return {
            ...characterTrailers,
            ...patchTrailers,
            ...releaseEvents,
            ...dripMarketingDates,
            ...livestreamEvents,
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
