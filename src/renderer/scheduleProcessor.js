import { GAME_CONFIG } from "../game-config";

function formatVersion(v) {
    return Number(v).toFixed(1);
}

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

function defaultImg(game) {
    return new URL(`../assets/games/${slugify(game)}_default.webp`, import.meta.url).href;
}

function characterImg(name) {
    return new URL(`../assets/characters/${slugify(name)}_drip.webp`, import.meta.url).href;
}

function gameImg(game, version) {
    return new URL(`../assets/games/${slugify(game)}_${formatVersion(version)}.webp`, import.meta.url).href;
}

function livestreamImg(game, version) {
    return new URL(`../assets/games/${slugify(game)}_${formatVersion(version)}_livestream.webp`, import.meta.url).href;
}

// Returns the Friday after 7 days from the given second phase date, unless day is specified
function getLivestreamDate(secondPhaseDate, hourArray, day = null) {
    const livestream = day ? new Date(day) : new Date(secondPhaseDate);
    if (!day) {
        livestream.setUTCDate(livestream.getUTCDate() + 7);
        const distanceToFriday = (5 - livestream.getUTCDay() + 7) % 7 || 7;
        livestream.setUTCDate(livestream.getUTCDate() + distanceToFriday);
    }

    livestream.setUTCHours(...hourArray, 0, 0)
    if (day) console.log(livestream)
    return livestream;
}

// Returns a date N days before the given phase date at 04:00 UTC
function getTrailerDate(phaseDate, distance) {
    const trailer = new Date(phaseDate);
    trailer.setUTCDate(trailer.getUTCDate() - distance);
    trailer.setUTCHours(4, 0, 0, 0);
    return trailer;
}

// Computes the key phase dates for current and next patch
function computePhaseDates(gameData, game, server) {
    const secondPhaseUTCHour = GAME_CONFIG[game].second_phase_hours[server];

    const currentOpen = new Date(gameData.current.version_start);

    const totalMins = gameData.maintenance_start[1] + gameData.maintenance_duration[1];
    const totalHours = gameData.maintenance_start[0] + gameData.maintenance_duration[0] + Math.floor(totalMins / 60);

    currentOpen.setUTCHours(totalHours % 24, totalMins % 60, 0, 0);

    const currentSecondPhase = new Date(currentOpen);
    currentSecondPhase.setUTCDate(currentSecondPhase.getUTCDate() + gameData.current.version_duration / 2);
    if (gameData.second_phase_offset) currentSecondPhase.setUTCDate(currentSecondPhase.getUTCDate() + gameData.second_phase_offset);
    currentSecondPhase.setUTCHours(secondPhaseUTCHour, 0, 0, 0);

    const nextOpen = new Date(currentOpen);
    nextOpen.setUTCDate(currentOpen.getUTCDate() + gameData.current.version_duration);

    const nextSecondPhase = new Date(nextOpen);
    nextSecondPhase.setUTCDate(nextSecondPhase.getUTCDate() + gameData.next.version_duration / 2);
    if (gameData.second_phase_offset) nextSecondPhase.setUTCDate(nextSecondPhase.getUTCDate() + gameData.second_phase_offset);
    nextSecondPhase.setUTCHours(secondPhaseUTCHour, 0, 0, 0);

    return {
        current: { open: currentOpen, secondPhase: currentSecondPhase },
        next: { open: nextOpen, secondPhase: nextSecondPhase },
    };
}

export function computeScheduleData(server) {
    const scheduleData = {};

    for (const [game, gameData] of Object.entries(GAME_CONFIG)) {
        const { current, next } = computePhaseDates(gameData, game, server);


        const [char1, char2] = gameData.current.characters;
        const [nextChar1, nextChar2] = gameData.next.characters;

        // Character trailer entries: N days before each phase goes live
        const trailerEntries = [
            { phase: current.open, character: char1 },
            { phase: current.secondPhase, character: char2 },
            { phase: next.open, character: nextChar1 },
            { phase: next.secondPhase, character: nextChar2 },
        ];

        const characterTrailers = {};
        for (const { phase, character } of trailerEntries) {
            if (character) {
                const trailerDate = getTrailerDate(phase, gameData.trailer_distance)
                characterTrailers[character] = {
                    date: trailerDate,
                    label: `${character} Trailer`,
                    img: characterImg(character),
                    fallbackImgs: [gameImg(game, gameData.current.version), defaultImg(game)],
                    confirmed: trailerDate.getTime() <= Date.now()
                };
            }
        }

        const livestreamDate = (gameData.livestream_prediction || gameData.livestream_date) ? 
                            getLivestreamDate(current.secondPhase, gameData.livestream_hour, gameData.livestream_date) : null
        
        const nextLivestreamDate = gameData.livestream_prediction ? getLivestreamDate(next.secondPhase, gameData.livestream_hour, null) : null;

        scheduleData[game] = {
            ...characterTrailers,

            release: {
                date: current.open,
                label: `${game} ${formatVersion(gameData.current.version)} Release${char1 && ` - ${char1}` || ""}`,
                img: char1 ? characterImg(char1) : gameImg(game, gameData.current.version),
                fallbackImgs: [defaultImg(game)],
                confirmed: true
            },

            secondPhase: {
                date: current.secondPhase,
                label: char2 ? `${char2} Release` : `${game} ${formatVersion(gameData.current.version)} Second Phase`,
                img: char2 ? characterImg(char2) : gameImg(game, gameData.current.version),
                fallbackImgs: [defaultImg(game)],
                confirmed: gameData.current.version_duration_confirmation || current.secondPhase.getTime() <= Date.now()
            },

            nextPatchRelease: {
                date: next.open,
                label: `${game} ${formatVersion(gameData.next.version)} Release${nextChar1 && ` - ${nextChar1}` || ""}`,
                img: nextChar1 ? characterImg(nextChar1) : gameImg(game, gameData.next.version),
                fallbackImgs: [gameImg(game, gameData.current.version), defaultImg(game)],
                confirmed: gameData.current.version_duration_confirmation || next.open.getTime() <= Date.now()
            },

            nextPatchSecondPhase: {
                date: next.secondPhase,
                label: nextChar2 ? `${nextChar2} Release` : `${game} ${formatVersion(gameData.next.version)} Second Phase`,
                img: nextChar2 ? characterImg(nextChar2) : gameImg(game, gameData.next.version),
                fallbackImgs: [gameImg(game, gameData.current.version), defaultImg(game)],
                confirmed: gameData.current.version_duration_confirmation && gameData.next.version_duration_confirmation
            },

            ...(livestreamDate ? {
                livestream: {
                    date: livestreamDate,
                    label: `${game} ${formatVersion(gameData.next.version)} Livestream`,
                    img: livestreamImg(game, gameData.next.version),
                    fallbackImgs: [gameImg(game, gameData.current.version), defaultImg(game)],
                    confirmed: (livestreamDate.getTime() - Date.now()) <= ((1000 * 60 * 60 * 24 * 3))
                }
            } : {}),

            ...(gameData.current.version_duration_confirmation && gameData.next.version_duration_confirmation && gameData.nextLivestreamDate ? {
                nextLivestream: {
                    date: nextLivestreamDate,
                    label: `${game} ${formatVersion(gameData.next.future_livestream_version)} Livestream`,
                    img: livestreamImg(game, gameData.next.future_livestream_version),
                    fallbackImgs: [gameImg(game, gameData.next.version), gameImg(game, gameData.current.version), defaultImg(game)],
                    confirmed: false
                }
            } : {})
        };
    }

    return scheduleData;
}