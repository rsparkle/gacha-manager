import { URGENT_PROGRESS, isUrgent, isMonthlySubUrgent } from './tasks.js';

const TIMER_BUFFER_MS = 1000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function gameList(entries) {
    return [...new Set(entries.map((entry) => entry.game))].join(', ');
}

function describeTasks(entries) {
    return entries.length === 1
        ? `There is 1 task approaching its deadline in ${gameList(entries)}`
        : `There are ${entries.length} tasks approaching their deadlines in ${gameList(entries)}`;
}

function describeSubs(entries) {
    return `Monthly subscription running out in ${gameList(entries)}`;
}

function describe(tasks, subs) {
    if (tasks.length === 0) {
        return { title: 'A monthly subscription is running out!', body: describeSubs(subs) };
    }

    if (subs.length === 0) {
        return { title: 'Some tasks are approaching their deadline!', body: describeTasks(tasks) };
    }

    return {
        title: 'Tasks and subscriptions need your attention!',
        body: `${describeTasks(tasks)}\n${describeSubs(subs)}`,
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
            const taskIds = enabledAccountIds('deadlineNotifications', group.name);
            const subIds = enabledAccountIds('monthlySubNotifications', group.name);

            for (const account of group.accounts) {
                if (subIds.includes(account.id) && isMonthlySubUrgent(account.monthlySubRemaining)) {
                    urgent.push({
                        key: `sub:${group.name}:${account.id}:${account.monthlySubRemaining}`,
                        kind: 'sub',
                        game: group.name,
                        end: Infinity,
                    });
                }

                if (!taskIds.includes(account.id)) continue;

                for (const task of Object.values(account.tasks).flat()) {
                    if (task.isDisabled || !task.duration) continue;

                    const end = nowMs + task.nextReset;
                    const urgentAt = end - task.duration + (task.duration * (URGENT_PROGRESS + 1)) / 100;

                    if (!task.isCompleted && isUrgent(task)) {
                        urgent.push({
                            key: `task:${group.name}:${account.id}:${task.id}:${end}`,
                            kind: 'task',
                            game: group.name,
                            end,
                        });
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
            notify({
                ...describe(
                    fresh.filter((entry) => entry.kind === 'task'),
                    fresh.filter((entry) => entry.kind === 'sub'),
                ),
                deadline: Math.min(...fresh.map((entry) => entry.end)),
            });
        }

        timeout = setTimeout(refresh, Math.min(Math.max(nextWake - nowMs, 0) + TIMER_BUFFER_MS, MAX_TIMEOUT_MS));
    }

    return { refresh, stop };
}
