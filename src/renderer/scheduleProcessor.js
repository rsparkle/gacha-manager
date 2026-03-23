import { GAME_CONFIG } from "../game-config";

// UTC hour at which 2nd phase banners go live (per server region)
const SECOND_PHASE_UTC_HOURS = {
    "America": 17,
    "Europe": 11,
    "Asia": 4
};

function formatVersion(v) {
    return Number(v).toFixed(1);
}

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
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

// Returns the Friday after 7 days from the given date
function getLivestreamDate(date, hourArray) {
    const livestream = new Date(date);
    livestream.setUTCDate(livestream.getUTCDate() + 7);
    const distanceToFriday = (5 - livestream.getUTCDay() + 7) % 7 || 7;
    livestream.setUTCDate(livestream.getUTCDate() + distanceToFriday);

    livestream.setUTCHours(...hourArray, 0, 0)
    return livestream;
}

// Returns three days before the given phase date at 04:00 UTC
function getTrailerDate(phaseDate) {
    const trailer = new Date(phaseDate);
    trailer.setUTCDate(trailer.getUTCDate() - 3);
    trailer.setUTCHours(4, 0, 0, 0);
    return trailer;
}

// Computes the key phase dates for current and next patch
function computePhaseDates(gameData, server) {
    const secondPhaseUTCHour = SECOND_PHASE_UTC_HOURS[server];

    const currentOpen = new Date(gameData.current.version_start);
    const serverOpenHour = (gameData.maintenance_start + gameData.maintenance_estimation) % 24;
    currentOpen.setUTCHours(serverOpenHour, 0, 0, 0);

    const currentSecondPhase = new Date(currentOpen);
    currentSecondPhase.setUTCDate(currentSecondPhase.getUTCDate() + gameData.current.version_duration / 2);
    currentSecondPhase.setUTCHours(secondPhaseUTCHour, 0, 0, 0);

    const nextOpen = new Date(currentOpen);
    nextOpen.setUTCDate(currentOpen.getUTCDate() + gameData.current.version_duration);

    const nextSecondPhase = new Date(nextOpen);
    nextSecondPhase.setUTCDate(nextSecondPhase.getUTCDate() + gameData.next.version_duration / 2);
    nextSecondPhase.setUTCHours(secondPhaseUTCHour, 0, 0, 0);

    return {
        current: { open: currentOpen, secondPhase: currentSecondPhase },
        next: { open: nextOpen, secondPhase: nextSecondPhase },
    };
}

export function computeScheduleData(server) {
    const scheduleData = {};

    for (const [game, gameData] of Object.entries(GAME_CONFIG)) {
        const { current, next } = computePhaseDates(gameData, server);

        const [char1, char2] = gameData.current.characters;
        const [nextChar1, nextChar2] = gameData.next.characters;

        // Character trailer entries: 2 days before each phase goes live
        const trailerEntries = [
            { phase: current.open, character: char1 },
            { phase: current.secondPhase, character: char2 },
            { phase: next.open, character: nextChar1 },
            { phase: next.secondPhase, character: nextChar2 },
        ];

        const characterTrailers = {};
        for (const { phase, character } of trailerEntries) {
            if (character) {
                characterTrailers[character] = {
                    date: getTrailerDate(phase),
                    label: `${character} Trailer`,
                    img: characterImg(character),
                };
            }
        }

        const livestreamDate = getLivestreamDate(current.secondPhase, gameData.livestream_hour);
        const nextLivestreamDate = getLivestreamDate(next.secondPhase, gameData.livestream_hour);

        scheduleData[game] = {
            ...characterTrailers,

            release: {
                date: current.open,
                label: `${game} ${formatVersion(gameData.current.version)} Release - ${char1}`,
                img: characterImg(char1),
            },

            secondPhase: {
                date: current.secondPhase,
                label: char2 ? `${char2} Release` : `${game} ${formatVersion(gameData.current.version)} Second Phase`,
                img: char2 ? characterImg(char2) : gameImg(game, gameData.current.version),
            },

            nextPatchRelease: {
                date: next.open,
                label: `${game} ${formatVersion(gameData.next.version)} Release - ${nextChar1}`,
                img: characterImg(nextChar1),
            },

            nextPatchSecondPhase: {
                date: next.secondPhase,
                label: nextChar2 ? `${nextChar2} Release` : `${game} ${formatVersion(gameData.next.version)} Second Phase`,
                img: nextChar2 ? characterImg(nextChar2) : gameImg(game, gameData.next.version),
            },

            livestream: {
                date: livestreamDate,
                label: `${game} ${formatVersion(gameData.next.version)} Livestream`,
                img: livestreamImg(game, gameData.next.version),
                unconfirmed: (livestreamDate - new Date()) > ((1000 * 60 * 60 * 24 * 3))
            },

            nextLivestream: {
                date: nextLivestreamDate,
                label: `${game} ${formatVersion(gameData.next.future_livestream_version)} Livestream`,
                img: livestreamImg(game, gameData.next.future_livestream_version),
                unconfirmed: true
            },
        };
    }

    return scheduleData;
}