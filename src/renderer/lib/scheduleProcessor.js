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

        const { previous } = gameData;
        const currentStart = toDateKey(gameData.current.version_start);
        const previousStart = previous ? shiftDate(currentStart, -previous.version_duration) : null;
        const nextStart = shiftDate(currentStart, gameData.current.version_duration);
        const previousSecond = previous ? shiftDate(previousStart, secondPhaseDay(previous)) : null;
        const currentSecond = shiftDate(currentStart, secondPhaseDay(gameData.current));
        const nextSecond = shiftDate(nextStart, secondPhaseDay(gameData.next));

        return {
            globalAt,
            dates: { previousStart, previousSecond, currentStart, currentSecond, nextStart, nextSecond },
            phases: {
                previous: previous ? { open: openAt(previousStart), secondPhase: secondPhaseAt(previousSecond) } : null,
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
            ...(gameData.previous
                ? [
                      {
                          phaseKey: 'previous_phase1',
                          date: dates.previousStart,
                          patchData: gameData.previous,
                          phaseNum: '1',
                      },
                      {
                          phaseKey: 'previous_phase2',
                          date: dates.previousSecond,
                          patchData: gameData.previous,
                          phaseNum: '2',
                      },
                  ]
                : []),
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
            ...(phases.previous
                ? [
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
                  ]
                : []),
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

        if (gameData.previous && !gameData.livestream.is_predictable) {
            trailers.currentPatchTrailer = patchTrailer(
                timeline.dates.previousStart,
                gameData.previous.version_duration,
                gameData.current.version,
            );
        }

        if (!gameData.livestream.is_predictable || !gameData.livestream.date) {
            trailers.nextPatchTrailer = patchTrailer(
                timeline.dates.currentStart,
                gameData.current.version_duration,
                gameData.next.version,
            );
        }

        return trailers;
    }

    function buildDripMarketing(game, gameData, clock, timeline, livestreams) {
        const dripMarketingDates = {};

        const dripMarketingEntries = [
            ...(timeline.phases.previous
                ? [
                      {
                          key: 'previous',
                          openDate: timeline.phases.previous.open,
                          associatedLivestream: livestreams.previous,
                          versionNumber: gameData.current.version,
                          imgVersion: gameData.current.version,
                      },
                  ]
                : []),
            {
                key: 'current',
                openDate: timeline.phases.current.open,
                associatedLivestream: livestreams.current,
                versionNumber: gameData.next.version,
                imgVersion: gameData.next.version,
            },
            {
                key: 'next',
                openDate: timeline.phases.next.open,
                associatedLivestream: livestreams.next,
                versionNumber: gameData.next.future_livestream_version,
                imgVersion: gameData.next.version,
            },
        ];

        for (const { key, openDate, associatedLivestream, versionNumber, imgVersion } of dripMarketingEntries) {
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
                    imgFiles: [gameImg(game, imgVersion), defaultImg(game)],
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

        const [anchorPrevious, anchorNow, anchorNext] =
            gameData.livestream.schedule === 'hoyo'
                ? [dates.previousSecond, dates.currentSecond, dates.nextSecond]
                : [dates.previousStart, dates.currentStart, dates.nextStart];

        const previousLivestreamDate =
            gameData.previous && gameData.livestream.is_predictable
                ? getLivestreamDate(gameData, clock, anchorPrevious)
                : null;

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
        const dripMarketingDates = buildDripMarketing(game, gameData, clock, timeline, {
            previous: previousLivestreamDate,
            current: livestreamDate,
            next: nextLivestreamDate,
        });

        const bothConfirmed =
            gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed;

        const livestreamEvents = {
            ...(previousLivestreamDate
                ? {
                      previousLivestream: {
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
                      },
                  }
                : {}),
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
