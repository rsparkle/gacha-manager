import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResetProcessor } from '../../src/shared/resetProcessor.js';
import { createScheduleProcessor } from '../../src/renderer/lib/scheduleProcessor.js';
import { SCHEDULE_SERVERS } from '../../src/shared/gameData.js';
import { DAY, HOUR } from '../../src/shared/serverTime.js';
import { makeAccount } from '../helpers/builders.js';
import { DATA_VERSION_LABEL, loadFixtureGameData } from '../helpers/gameDataSource.js';

const { config, tasks, now } = loadFixtureGameData();
const snapshot = (name) => `./__snapshots__/${DATA_VERSION_LABEL}/${name}`;

const RESET_INSTANTS = [
    now,
    new Date(now.getTime() + 7 * DAY + 9 * HOUR),
    new Date('2026-11-01T12:00:00Z'),
    new Date('2027-01-01T00:00:00Z'),
    new Date('2027-03-29T03:00:00Z'),
];

function describeEvent(event) {
    const confirmed = { true: 'confirmed', false: 'estimated', null: 'unknown' }[String(event.confirmed)];

    return [
        event.date.toISOString(),
        event.type,
        event.label,
        `title: ${event.title}`,
        confirmed,
        event.portrait ? 'portrait' : 'landscape',
        event.imgFiles.join(', '),
    ].join(' | ');
}

function hours(ms) {
    const minutes = Math.round(ms / 60_000);

    return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`;
}

function describeTask(task, nowMs) {
    if (task.isDisabled) return 'disabled';

    const completed = task.isCompleted ? ' (completed)' : '';

    if (task.nextReset === null) return `open${completed}`;

    return `${new Date(nowMs + task.nextReset).toISOString()} after ${hours(task.duration)}${completed}`;
}

describe(`golden output for the ${DATA_VERSION_LABEL} fixture`, () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(now);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each(SCHEDULE_SERVERS)('schedule on %s', async (server) => {
        const data = createScheduleProcessor(config).computeScheduleData(server);
        const output = Object.fromEntries(
            Object.entries(data).map(([game, events]) => [
                game,
                Object.fromEntries(
                    Object.entries(events)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, event]) => [key, describeEvent(event)]),
                ),
            ]),
        );

        await expect(`${JSON.stringify(output, null, 2)}\n`).toMatchFileSnapshot(
            snapshot(`schedule.${server.toLowerCase()}.json`),
        );
    });

    it('task resets on every server', async () => {
        vi.useRealTimers();

        const processor = createResetProcessor(config, tasks);
        const completed = Object.fromEntries(
            Object.values(tasks)
                .flatMap((game) => game.tasks)
                .map((task) => [task.id, new Date(now.getTime() - HOUR).toISOString()]),
        );
        const output = {};

        for (const [game, gameConfig] of Object.entries(config)) {
            for (const server of Object.keys(gameConfig.servers)) {
                for (const instant of RESET_INSTANTS) {
                    const account = makeAccount(tasks[game], { server, completed });

                    processor.computeSingleAccountResetData(account, game, instant);

                    output[`${game} / ${server} @ ${instant.toISOString()}`] = Object.fromEntries(
                        Object.values(account.tasks)
                            .flat()
                            .map((task) => [task.id, describeTask(task, instant.getTime())]),
                    );
                }
            }
        }

        await expect(`${JSON.stringify(output, null, 2)}\n`).toMatchFileSnapshot(snapshot('resets.json'));
    });
});
