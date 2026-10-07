import { computed, watch } from 'vue'
import { useSettings } from './useSettings.js'

export const taskProgress = (task) =>
    Math.max(0, Math.floor(((task.duration - task.nextReset) / task.duration) * 100))

export const isUrgent = (task) => taskProgress(task) > 80

export function useDeadlineNotifications(accountsPerGame) {
    const { settings } = useSettings()
    const notifiedKeys = new Set()

    const urgentTasks = computed(() =>
        accountsPerGame.value.flatMap(game =>
            game.accounts.flatMap(account =>
                Object.values(account.tasks).flatMap(taskGroup =>
                    taskGroup
                        .filter(task => !task.isCompleted && isUrgent(task))
                        .map(task => ({
                            key: `${game.name}:${account.id}:${task.id}`,
                            game: game.name,
                            toNotify: (settings.value.windowsNotifications?.[game.name] ?? []).includes(account.id)
                        }))
                )
            )
        )
    )

    watch(urgentTasks, (urgentEntries) => {
        const currentKeys = new Set(urgentEntries.map(e => e.key))
        for (const key of notifiedKeys) {
            if (!currentKeys.has(key)) notifiedKeys.delete(key)
        }

        const newUrgent = urgentEntries.filter(({ key, toNotify }) => toNotify && !notifiedKeys.has(key))
        if (newUrgent.length === 0) return

        newUrgent.forEach(({ key }) => notifiedKeys.add(key))

        const games = [...new Set(newUrgent.map(e => e.game))].join(', ')
        const body = newUrgent.length === 1
            ? `There is 1 task approaching its deadline in ${games}`
            : `There are ${newUrgent.length} tasks approaching their deadlines in ${games}`

        window.api.sendNotification({
            title: 'Some tasks are approaching their deadline!',
            body
        })
    })
}