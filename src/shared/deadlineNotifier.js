import { URGENT_PROGRESS, isUrgent } from './tasks.js';

const TIMER_BUFFER_MS = 1000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function describe(entries) {
    const games = [...new Set(entries.map((entry) => entry.game))].join(', ');

    return {
        title: 'Some tasks are approaching their deadline!',
        body:
            entries.length === 1
                ? `There is 1 task approaching its deadline in ${games}`
                : `There are ${entries.length} tasks approaching their deadlines in ${games}`,
    };
}

export function createDeadlineNotifier({ computeGroups, enabledAccountIds, notify }) {
    const notifiedKeys = new Set();
    let timeout;

    function stop() {
        clearTimeout(timeout);
        timeout = undefined;
    }

    function refresh() {
        stop();

        const now = new Date();
        const nowMs = now.getTime();

        let groups;
        try {
            groups = computeGroups(now);
        } catch (err) {
            console.error('Notification scheduling failed:', err);
            return;
        }

        const urgent = [];
        let nextWake = Infinity;

        for (const group of groups) {
            const enabledIds = enabledAccountIds(group.name);

            for (const account of group.accounts) {
                if (!enabledIds.includes(account.id)) continue;

                for (const task of Object.values(account.tasks).flat()) {
                    if (task.isDisabled || !task.duration) continue;

                    const end = nowMs + task.nextReset;
                    const urgentAt = end - task.duration + (task.duration * (URGENT_PROGRESS + 1)) / 100;

                    if (!task.isCompleted && isUrgent(task)) {
                        urgent.push({ key: `${group.name}:${account.id}:${task.id}:${end}`, game: group.name, end });
                        nextWake = Math.min(nextWake, end);
                    } else {
                        nextWake = Math.min(nextWake, task.isCompleted ? end : urgentAt);
                    }
                }
            }
        }

        const urgentKeys = new Set(urgent.map((entry) => entry.key));
        for (const key of notifiedKeys) {
            if (!urgentKeys.has(key)) notifiedKeys.delete(key);
        }

        const fresh = urgent.filter((entry) => !notifiedKeys.has(entry.key));
        if (fresh.length > 0) {
            fresh.forEach((entry) => notifiedKeys.add(entry.key));
            notify({ ...describe(fresh), deadline: Math.min(...fresh.map((entry) => entry.end)) });
        }

        timeout = setTimeout(refresh, Math.min(Math.max(nextWake - nowMs, 0) + TIMER_BUFFER_MS, MAX_TIMEOUT_MS));
    }

    return { refresh, stop };
}
