export function createScheduleProcessor(GAME_CONFIG) {

  function formatVersion(v) {
    return Number(v).toFixed(1);
  }

  function slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async function defaultImg(game) {
    return await window.api.cacheImage(`games/${slugify(game)}_default.webp`);
  }

  async function characterImg(name) {
    return await window.api.cacheImage(`characters/${slugify(name)}.webp`);
  }

  async function gameImg(game, version) {
    return await window.api.cacheImage(`games/${slugify(game)}_${formatVersion(version)}.webp`);
  }

  async function livestreamImg(game, version) {
    return await window.api.cacheImage(`games/${slugify(game)}_${formatVersion(version)}_livestream.webp`);
  }

  function getLivestreamDate(secondPhaseDate, hourArray, day = null) {
    const livestream = day ? new Date(day) : new Date(secondPhaseDate);
    if (!day) {
      livestream.setUTCDate(livestream.getUTCDate() + 7);
      const distanceToFriday = (5 - livestream.getUTCDay() + 7) % 7 || 7;
      livestream.setUTCDate(livestream.getUTCDate() + distanceToFriday);
    }
    livestream.setUTCHours(...hourArray, 0, 0);
    if (day) console.log(livestream);
    return livestream;
  }

  function getTrailerDate(phaseDate, distance) {
    const trailer = new Date(phaseDate);
    trailer.setUTCDate(trailer.getUTCDate() - distance);
    trailer.setUTCHours(4, 0, 0, 0);
    return trailer;
  }

  function getMondayOfSameWeek(date) {
    const startDate = new Date(date);
    const currentDay = startDate.getUTCDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    startDate.setUTCDate(startDate.getUTCDate() - distanceToMonday);

    return startDate;
  }

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

  async function computeScheduleData(server) {
    const scheduleData = {};

    for (const [game, gameData] of Object.entries(GAME_CONFIG)) {
      const { current, next } = computePhaseDates(gameData, game, server);

      const [char1, char2] = gameData.current.characters;
      const [nextChar1, nextChar2] = gameData.next.characters;

      const trailerEntries = [
        { phase: current.open, character: char1 },
        { phase: current.secondPhase, character: char2 },
        { phase: next.open, character: nextChar1 },
        { phase: next.secondPhase, character: nextChar2 },
      ];

      const characterTrailers = {};
      for (const { phase, character } of trailerEntries) {
        if (character) {
          const trailerDate = getTrailerDate(phase, gameData.character_trailer_distance);
          characterTrailers[character] = {
            date: trailerDate,
            label: `${character} Trailer`,
            img: await characterImg(character),
            fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
            confirmed: trailerDate.getTime() <= Date.now()
          };
        }
      }

      const patchTrailers = {};
      if ((!gameData.is_livestream_predictable || !gameData.livestream_date) && gameData.patch_trailer_distance) {
        const duration = Number(gameData.current.version_duration) || 0;
        const trailer = Number(gameData.patch_trailer_distance);
        const startDate = new Date(current.open);
        startDate.setUTCDate(startDate.getUTCDate() + duration - trailer);
        startDate.setUTCHours(4, 0, 0, 0);

        patchTrailers["nextPatchTrailer"] = {
          date: startDate,
          label: `${game} ${formatVersion(gameData.next.version)} Trailer`,
          img: await gameImg(game, gameData.current.version),
          fallbackImgs: [await defaultImg(game)],
          confirmed: true
        }
      }

      const livestreamDate = (gameData.is_livestream_predictable || gameData.livestream_date)
        ? getLivestreamDate(current.secondPhase, gameData.livestream_hour, gameData.livestream_date)
        : null;

      const nextLivestreamDate = gameData.is_livestream_predictable
        ? getLivestreamDate(next.secondPhase, gameData.livestream_hour, null)
        : null;

      const dripMarketingDates = {};

      const dripMarketingEntries = [
        {
          key: "current",
          openDate: current.open,
          associatedLivestream: livestreamDate,
          versionNumber: formatVersion(gameData.next.version)
        },
        {
          key: "next",
          openDate: next.open,
          associatedLivestream: nextLivestreamDate,
          versionNumber: formatVersion(gameData.next.future_livestream_version)
        }
      ];

      for (const { key, openDate, associatedLivestream, versionNumber } of dripMarketingEntries) {
        let baseAnchorDate = gameData.drip_anchor === "patch"
          ? new Date(openDate)
          : (associatedLivestream ? new Date(associatedLivestream) : null);

        if (!baseAnchorDate || isNaN(baseAnchorDate.getTime())) continue;

        baseAnchorDate.setUTCDate(baseAnchorDate.getUTCDate() + (Number(gameData.drip_distance) || 0));

        baseAnchorDate = gameData.drip_week_start_rule ? getMondayOfSameWeek(baseAnchorDate) : baseAnchorDate;

        for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
          const dripDate = new Date(baseAnchorDate);
          dripDate.setUTCDate(dripDate.getUTCDate() + dayOffset);

          const uniqueKey = `${key}DripMarketing_day${dayOffset + 1}`;

          dripMarketingDates[uniqueKey] = {
            date: dripDate,
            label: `${game} ${versionNumber} 5★ Drip Marketing - Day ${dayOffset + 1}`,
            img: await gameImg(game, gameData.current.version),
            fallbackImgs: [await defaultImg(game)],
            confirmed: true
          };
        }
      }

      scheduleData[game] = {
        ...characterTrailers, ...patchTrailers, ...dripMarketingDates,

        release: {
          date: current.open,
          label: `${game} ${formatVersion(gameData.current.version)} Release${char1 && ` - ${char1}` || ""}`,
          img: char1 ? await characterImg(char1) : await gameImg(game, gameData.current.version),
          fallbackImgs: [await defaultImg(game)],
          confirmed: true
        },

        secondPhase: {
          date: current.secondPhase,
          label: char2 ? `${char2} Release` : `${game} ${formatVersion(gameData.current.version)} Second Phase`,
          img: char2 ? await characterImg(char2) : await gameImg(game, gameData.current.version),
          fallbackImgs: [await defaultImg(game)],
          confirmed: gameData.current.is_version_duration_confirmed || current.secondPhase.getTime() <= Date.now()
        },

        nextPatchRelease: {
          date: next.open,
          label: `${game} ${formatVersion(gameData.next.version)} Release${nextChar1 && ` - ${nextChar1}` || ""}`,
          img: nextChar1 ? await characterImg(nextChar1) : await gameImg(game, gameData.next.version),
          fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
          confirmed: gameData.current.is_version_duration_confirmed || next.open.getTime() <= Date.now()
        },

        nextPatchSecondPhase: {
          date: next.secondPhase,
          label: nextChar2 ? `${nextChar2} Release` : `${game} ${formatVersion(gameData.next.version)} Second Phase`,
          img: nextChar2 ? await characterImg(nextChar2) : await gameImg(game, gameData.next.version),
          fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
          confirmed: gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed
        },

        ...(livestreamDate ? {
          livestream: {
            date: livestreamDate,
            label: `${game} ${formatVersion(gameData.next.version)} Livestream`,
            img: await livestreamImg(game, gameData.next.version),
            fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
            confirmed: (livestreamDate.getTime() - Date.now()) <= (1000 * 60 * 60 * 24 * 3)
          }
        } : {}),

        ...(gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed && nextLivestreamDate ? {
          nextLivestream: {
            date: nextLivestreamDate,
            label: `${game} ${formatVersion(gameData.next.future_livestream_version)} Livestream`,
            img: await livestreamImg(game, gameData.next.future_livestream_version),
            fallbackImgs: [await gameImg(game, gameData.next.version), await gameImg(game, gameData.current.version), await defaultImg(game)],
            confirmed: false
          }
        } : {})
      };
    }
    console.log(scheduleData)
    return scheduleData;
  }

  return { computeScheduleData };
}