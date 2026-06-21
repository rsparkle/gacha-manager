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

  function getLivestreamDate(phaseDate, hourArray, day = null, schedule, distance) {
    const livestream = day ? new Date(day) : new Date(phaseDate);
    if (!day) {
      if (schedule === "hoyo") {
        livestream.setUTCDate(livestream.getUTCDate() + 7);
        const distanceToFriday = (5 - livestream.getUTCDay() + 7) % 7 || 7;
        livestream.setUTCDate(livestream.getUTCDate() + distanceToFriday);
      } else if (schedule === "distance") {
        livestream.setUTCDate(livestream.getUTCDate() + distance);
      }
    }
    livestream.setUTCHours(...hourArray, 0, 0);
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

  function getPhaseCharacters(patchData, phase) {
    return (patchData.phase_characters?.[phase] ?? []).filter(Boolean);
  }

  function formatCharacterLabel(characters) {
    return characters.join(" & ");
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

  async function buildCharacterTrailers(game, gameData, phases) {
    const trailerEntries = [
      { phaseKey: "phase1", phase: phases.current.open,      patchData: gameData.current, phaseNum: "1" },
      { phaseKey: "phase2", phase: phases.current.secondPhase, patchData: gameData.current, phaseNum: "2" },
      { phaseKey: "phase1", phase: phases.next.open,         patchData: gameData.next,    phaseNum: "1" },
      { phaseKey: "phase2", phase: phases.next.secondPhase,  patchData: gameData.next,    phaseNum: "2" },
    ];

    const characterTrailers = {};

    for (const { phaseKey, phase, patchData, phaseNum } of trailerEntries) {
      const characters = getPhaseCharacters(patchData, phaseNum);
      if (characters.length === 0) continue;

      const trailerDate = getTrailerDate(phase, gameData.character_trailer_distance);
      const trailerKey = `trailer_${phaseKey}`;

      if (characterTrailers[trailerKey] && characterTrailers[trailerKey].date <= trailerDate) continue;

      characterTrailers[trailerKey] = {
        date: trailerDate,
        label: `${formatCharacterLabel(characters)} Trailer`,
        img: await characterImg(characters[0]),
        fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
        confirmed: trailerDate.getTime() <= Date.now()
      };
    }

    return characterTrailers;
  }

  async function buildPhaseReleaseEvents(game, gameData, phases) {
    const phaseEntries = [
      {
        phaseDate: phases.current.open,
        patchData: gameData.current,
        phaseNum: "1",
        baseKey: "release",
        confirmed: true
      },
      {
        phaseDate: phases.current.secondPhase,
        patchData: gameData.current,
        phaseNum: "2",
        baseKey: "secondPhase",
        confirmed: gameData.current.is_version_duration_confirmed || phases.current.secondPhase.getTime() <= Date.now()
      },
      {
        phaseDate: phases.next.open,
        patchData: gameData.next,
        phaseNum: "1",
        baseKey: "nextPatchRelease",
        confirmed: gameData.current.is_version_duration_confirmed || phases.next.open.getTime() <= Date.now()
      },
      {
        phaseDate: phases.next.secondPhase,
        patchData: gameData.next,
        phaseNum: "2",
        baseKey: "nextPatchSecondPhase",
        confirmed: gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed
      },
    ];

    const releaseEvents = {};

    for (const { phaseDate, patchData, phaseNum, baseKey, confirmed } of phaseEntries) {
      const characters = getPhaseCharacters(patchData, phaseNum);
      const version = formatVersion(patchData.version);
      const isPhase1 = phaseNum === "1";

      if (characters.length > 1) {
        for (const character of characters) {
          const key = `${baseKey}_${slugify(character)}`;
          releaseEvents[key] = {
            date: phaseDate,
            label: `${character} Release`,
            img: await characterImg(character),
            fallbackImgs: [await gameImg(game, patchData.version), await defaultImg(game)],
            confirmed
          };
        }
      } else if (characters.length === 1) {
        const [character] = characters;
        releaseEvents[baseKey] = {
          date: phaseDate,
          label: isPhase1
            ? `${gameData.abbr} ${version} Release - ${character}`
            : `${character} Release`,
          img: await characterImg(character),
          fallbackImgs: [await gameImg(game, patchData.version), await defaultImg(game)],
          confirmed
        };
      } else {
        releaseEvents[baseKey] = {
          date: phaseDate,
          label: `${gameData.abbr} ${version} ${isPhase1 ? "Release" : "Second Phase"}`,
          img: await gameImg(game, patchData.version),
          fallbackImgs: [await defaultImg(game)],
          confirmed
        };
      }
    }

    return releaseEvents;
  }

  async function buildPatchTrailers(game, gameData, phases) {
    const hasPatchTrailerDistance = !!gameData.patch_trailer_distance;
    const needsPatchTrailer = !gameData.is_livestream_predictable || !gameData.livestream_date;

    if (!hasPatchTrailerDistance || !needsPatchTrailer) return {};

    const startDate = new Date(phases.current.open);
    startDate.setUTCDate(startDate.getUTCDate() + gameData.current.version_duration - gameData.patch_trailer_distance);
    startDate.setUTCHours(4, 0, 0, 0);

    return {
      nextPatchTrailer: {
        date: startDate,
        label: `${gameData.abbr} ${formatVersion(gameData.next.version)} Trailer`,
        img: await gameImg(game, gameData.current.version),
        fallbackImgs: [await defaultImg(game)],
        confirmed: true
      }
    };
  }

  async function buildDripMarketing(game, gameData, phases, livestreamDate, nextLivestreamDate) {
    const dripMarketingDates = {};

    const dripMarketingEntries = [
      {
        key: "current",
        openDate: phases.current.open,
        associatedLivestream: livestreamDate,
        versionNumber: formatVersion(gameData.next.version)
      },
      {
        key: "next",
        openDate: phases.next.open,
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

        dripMarketingDates[`${key}DripMarketing_day${dayOffset + 1}`] = {
          date: dripDate,
          label: `${gameData.abbr} ${versionNumber} 5★ Drip Marketing`,
          img: await gameImg(game, gameData.current.version),
          fallbackImgs: [await defaultImg(game)],
          confirmed: true
        };
      }
    }

    return dripMarketingDates;
  }

  async function computeScheduleData(server) {
    const scheduleData = {};

    for (const [game, gameData] of Object.entries(GAME_CONFIG)) {
      const phases = computePhaseDates(gameData, game, server);

      const livestreamPhaseAnchor = gameData.livestream_schedule === "hoyo"
        ? [phases.current.secondPhase, phases.next.secondPhase]
        : [phases.current.open, phases.next.open];

      const livestreamDate = (gameData.is_livestream_predictable || gameData.livestream_date)
        ? getLivestreamDate(livestreamPhaseAnchor[0], gameData.livestream_hour, gameData.livestream_date, gameData.livestream_schedule, gameData.livestream_distance)
        : null;

      const nextLivestreamDate = gameData.is_livestream_predictable
        ? getLivestreamDate(livestreamPhaseAnchor[1], gameData.livestream_hour, null, gameData.livestream_schedule, gameData.livestream_distance)
        : null;

      const [characterTrailers, patchTrailers, releaseEvents, dripMarketingDates] = await Promise.all([
        buildCharacterTrailers(game, gameData, phases),
        buildPatchTrailers(game, gameData, phases),
        buildPhaseReleaseEvents(game, gameData, phases),
        buildDripMarketing(game, gameData, phases, livestreamDate, nextLivestreamDate),
      ]);

      const livestreamEvents = {
        ...(livestreamDate ? {
          livestream: {
            date: livestreamDate,
            label: `${gameData.abbr} ${formatVersion(gameData.next.version)} Livestream`,
            img: await livestreamImg(game, gameData.next.version),
            fallbackImgs: [await gameImg(game, gameData.current.version), await defaultImg(game)],
            confirmed: (livestreamDate.getTime() - Date.now()) <= (1000 * 60 * 60 * 24 * 3)
          }
        } : {}),
        ...(gameData.current.is_version_duration_confirmed && gameData.next.is_version_duration_confirmed && nextLivestreamDate ? {
          nextLivestream: {
            date: nextLivestreamDate,
            label: `${gameData.abbr} ${formatVersion(gameData.next.future_livestream_version)} Livestream`,
            img: await livestreamImg(game, gameData.next.future_livestream_version),
            fallbackImgs: [await gameImg(game, gameData.next.version), await gameImg(game, gameData.current.version), await defaultImg(game)],
            confirmed: false
          }
        } : {})
      };

      scheduleData[game] = {
        ...characterTrailers,
        ...patchTrailers,
        ...releaseEvents,
        ...dripMarketingDates,
        ...livestreamEvents,
      };
    }

    return scheduleData;
  }

  return { computeScheduleData };
}