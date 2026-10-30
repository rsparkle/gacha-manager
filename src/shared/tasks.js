export const URGENT_PROGRESS = 80;

export const MONTHLY_SUB_URGENT_DAYS = 5;

export function taskProgress(task) {
    if (!task.duration) return 0;

    return Math.max(0, Math.floor(((task.duration - task.nextReset) / task.duration) * 100));
}

export function isUrgent(task) {
    return taskProgress(task) > URGENT_PROGRESS;
}

export function isMonthlySubUrgent(remaining) {
    return remaining != null && remaining > 0 && remaining < MONTHLY_SUB_URGENT_DAYS;
}
