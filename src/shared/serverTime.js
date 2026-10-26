export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

export function mod(value, size) {
    return ((value % size) + size) % size;
}

export function addDays(date, days) {
    return new Date(date.getTime() + days * DAY);
}

export function parseMinutes(text, label) {
    const match = typeof text === 'string' ? CLOCK_PATTERN.exec(text) : null;

    if (!match || Number(match[2]) > 59) {
        throw new Error(`Invalid ${label}: "${text}" (expected "HH:MM")`);
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

export function parseClock(text, label) {
    const minutes = parseMinutes(text, label);

    if (minutes >= 24 * 60) {
        throw new Error(`Invalid ${label}: "${text}" (must be before 24:00)`);
    }

    return minutes;
}

export function toDateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
}

export function shiftDate(dateKey, days) {
    return toDateKey(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY);
}

export function weekdayOf(dateKey) {
    return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function secondPhaseDay(patch) {
    return Math.ceil(patch.version_duration / 2) + (patch.second_phase_offset ?? 0);
}

const ZONE_FORMATTERS = new Map();

function zoneFormatter(zone) {
    let formatter = ZONE_FORMATTERS.get(zone);

    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
        });
        ZONE_FORMATTERS.set(zone, formatter);
    }

    return formatter;
}

export function offsetAt(zone, instant) {
    if (typeof zone === 'number') return zone;

    const time = Math.floor(new Date(instant).getTime() / MINUTE) * MINUTE;
    const parts = Object.fromEntries(
        zoneFormatter(zone)
            .formatToParts(new Date(time))
            .map(({ type, value }) => [type, Number(value)]),
    );
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

    return (wall - time) / HOUR;
}

export function zonedInstant(dateKey, minutes, zone) {
    const wall = Date.parse(`${dateKey}T00:00:00Z`) + minutes * MINUTE;

    if (typeof zone === 'number') return new Date(wall - zone * HOUR);

    const guess = wall - offsetAt(zone, wall) * HOUR;

    return new Date(wall - offsetAt(zone, guess) * HOUR);
}

export function localDate(instant, zone) {
    return new Date(instant.getTime() + offsetAt(zone, instant) * HOUR);
}

export function addZonedDays(instant, days, zone) {
    const local = localDate(instant, zone);
    const dateKey = toDateKey(local);
    const minutes = (local.getTime() - Date.parse(`${dateKey}T00:00:00Z`)) / MINUTE;

    return zonedInstant(shiftDate(dateKey, days), minutes, zone);
}

export function compileGameClock(name, game) {
    const fail = (message) => {
        throw new Error(`${name}: ${message}`);
    };

    const readOffset = (value, label) => {
        if (!Number.isFinite(value)) fail(`${label} must be a number`);
        return value;
    };

    const readZone = (server, serverName) => {
        if (server.timezone === undefined) return readOffset(server.utc_offset, `${serverName} utc_offset`);

        try {
            zoneFormatter(server.timezone);
        } catch {
            fail(`${serverName} timezone "${server.timezone}" is not a valid IANA time zone`);
        }

        return server.timezone;
    };

    const globalOffset = readOffset(game.global_utc_offset, 'global_utc_offset');

    const maintenance = {
        first_phase: null,
        second_phase: null,
    };
    if (game.maintenance) {
        for (const [phaseKey, data] of Object.entries(game.maintenance)) {
            if (data) {
                maintenance[phaseKey] = {
                    startMinutes: parseClock(data.start, `${name} maintenance.${phaseKey}.start`),
                    durationMinutes: parseMinutes(data.duration, `${name} maintenance.${phaseKey}.duration`),
                };
            }
        }
    }

    if (!maintenance.first_phase) fail('missing maintenance.first_phase');

    const trailerMinutes = game.character_trailer
        ? parseClock(game.character_trailer.time, `${name} trailer.time`)
        : parseClock(game.trailer_time, `${name} trailer_time`);

    const needsLivestream = Boolean(
        game.livestream.is_predictable ||
        [game.previous, game.current, game.next].some((patch) => patch?.livestream_date),
    );
    const livestreamMinutes = game.livestream.time ? parseClock(game.livestream.time, `${name} livestream.time`) : null;

    if (needsLivestream && livestreamMinutes === null) fail('livestream.time is required');

    const dripMinutes = game.drip ? parseClock(game.drip.time, `${name} drip.time`) : null;

    const secondPhase = game.second_phase;

    if (secondPhase && !['server', 'global'].includes(secondPhase.scope)) {
        fail('second_phase.scope must be "server" or "global"');
    }

    if (!secondPhase && !maintenance.second_phase) {
        fail('missing second_phase or maintenance.second_phase');
    }

    const secondPhaseClock = maintenance.second_phase
        ? {
              minutes: maintenance.second_phase.startMinutes + maintenance.second_phase.durationMinutes,
              scope: 'global',
          }
        : { minutes: parseClock(secondPhase.time, `${name} second_phase.time`), scope: secondPhase.scope };

    const readScopedClock = (key) => {
        const spec = game[key];

        if (spec === undefined) return null;

        if (!spec || !['server', 'global'].includes(spec.scope)) {
            fail(`${key}.scope must be "server" or "global"`);
        }

        return { minutes: parseClock(spec.time, `${name} ${key}.time`), scope: spec.scope };
    };

    if (!game.servers || typeof game.servers !== 'object' || Object.keys(game.servers).length === 0) {
        fail('missing servers');
    }

    const servers = {};

    for (const [serverName, server] of Object.entries(game.servers)) {
        const zone = readZone(server, serverName);
        const resetMinutes = parseClock(server.daily_reset ?? game.daily_reset, `${name} ${serverName} daily_reset`);

        servers[serverName] = { zone, resetMinutes };
    }

    return {
        globalOffset,
        maintenance,
        trailerMinutes,
        livestreamMinutes,
        dripMinutes,
        secondPhase: secondPhaseClock,
        eventStart: readScopedClock('event_start'),
        eventEnd: readScopedClock('event_end'),
        servers,
    };
}
