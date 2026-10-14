export const URGENT_PROGRESS = 80;

export function taskProgress(task) {
    if (!task.duration) return 0;

    return Math.max(0, Math.floor(((task.duration - task.nextReset) / task.duration) * 100));
}

export function isUrgent(task) {
    return taskProgress(task) > URGENT_PROGRESS;
}
