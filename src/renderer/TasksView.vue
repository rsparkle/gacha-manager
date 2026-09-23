<template>
    <div id="tasksApp">
        <div class="sidebar">
            <p class="sidebar-title">Game List</p>
            <div class="game-list">
                <div class="game-item" v-for="gameGroup in trackedGames" :key="gameGroup.name"
                    @click="selectGame(gameGroup)" :class="{ active: selectedGame?.name === gameGroup.name }">
                    <div class="game-name-row">
                        <img class="game-item-icon" :src="sidebarIcons[gameGroup.name]" :alt="gameGroup.name" />
                        <p class="game-name">{{ gameGroup.name }}</p>
                    </div>
                    <span v-if="hasUrgentTasks(gameGroup.name)" class="urgent-orb" />
                </div>
            </div>

            <div class="add-game-wrapper" v-if="missingGames.length > 0">
                <Transition name="popover">
                    <div v-if="showGamePicker" class="game-picker">
                        <div class="game-picker-item" v-for="game in missingGames" :key="game.name"
                            @click="addGame(game)">
                            {{ game.name }}
                        </div>
                    </div>
                </Transition>
                <button class="add-game" @click="showGamePicker = !showGamePicker">
                    + Add Game
                </button>
            </div>
        </div>

        <div class="main">
            <div class="main-inner" v-if="selectedGame && selectedAccount">
                <div class="hero">
                    <img v-if="settings.theme" :src="getCharacterThemeImage()" class="hero-img">
                    <p class="hero-title">{{ selectedGame.name }} {{ selectedGame.game_version }}</p>

                    <div class="hero-bottom">
                        <div class="hero-account-info">
                            <div class="server-wrapper" ref="serverAnchor">
                                <span class="account-server server-clickable" @click="editingServer = !editingServer">
                                    {{ selectedAccount?.server }}
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </span>
                                <Transition name="popover">
                                    <div v-if="editingServer" class="server-picker">
                                        <div class="server-picker-item" v-for="s in availableServers" :key="s"
                                            :class="{ active: s === selectedAccount?.server }" @click="selectServer(s)">
                                            {{ s }}</div>
                                    </div>
                                </Transition>
                            </div>
                            <span class="account-uid" v-if="!editingUid" @click="startUidEdit">{{ selectedAccount?.uid
                                || 0
                                }}</span>
                            <input class="account-uid account-uid-input" v-else type="text" v-model="editUidValue"
                                @keyup.enter="commitUidEdit(selectedAccount.id)"
                                @blur="commitAndCancelUidEdit(selectedAccount.id)" @keyup.escape="cancelUidEdit"
                                ref="uidInput" :maxlength="currentGameConfig?.uid_digits" inputmode="numeric"
                                @input="editUidValue = editUidValue.replace(/\D/g, '')">
                        </div>
                        <div class="hero-progress">
                            <span :class="{ complete: getCompletionPercentage(selectedAccount.tasks) === 100 }">{{
                                getCompletionPercentage(selectedAccount.tasks) }}% Completed</span>
                            <img v-if="getCompletionPercentage(selectedAccount.tasks) === 100 && settings.theme"
                                :src="getCompletionSticker()" class="complete-sticker">
                        </div>
                        <div class="hero-actions">
                            <button class="btn-edit" v-if="!editingUid" @click="startUidEdit">Edit UID</button>
                            <button class="btn-edit" v-else @mousedown.prevent="cancelLabelEdit"
                                @click="cancelUidEdit">Cancel</button>
                            <button class="btn-delete" @click="deleteAccount">Delete Account</button>
                            <button class="btn-bell" :class="{ active: notificationsEnabled }"
                                @click="toggleAndSaveSetting(settings.windowsNotifications, selectedGame.name, selectedAccount.id)"
                                :title="notificationsEnabled ? 'Notifications on' : 'Notifications off'">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                    <line v-if="!notificationsEnabled" x1="2" y1="2" x2="22" y2="22"
                                        stroke="currentColor" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="account-nav">
                    <div class="account-tab" v-for="account in selectedGame.accounts" :key="account.id"
                        @click="selectedAccount = account" :class="{ active: selectedAccount?.id === account.id }">

                        <span v-if="editingLabelId !== account.id" @click.stop="startLabelEdit(account)">
                            {{ account.label || account.uid || 'New Account' }}
                        </span>
                        <input v-else class="account-label-input" type="text" v-model="editLabelValue"
                            @keyup.enter="commitLabelEdit" @keyup.escape="cancelLabelEdit"
                            @keydown.tab.prevent="commitAndMoveToNext(account)" @blur="commitLabelEdit" ref="labelInput"
                            :style="{ width: ((editLabelValue?.length || account.uid?.length) * 7) + 'px' }" />
                    </div>
                    <div class="account-tab-add" @click="insertAccount">+</div>
                </div>

                <div class="tasks-area" :style="{ backgroundImage: getGameImageBackgroundUrl(selectedGame) }">
                    <img :src="gameImages[selectedGame.name]" style="display: none;" :key="selectedGame.name"
                        @error="handleImageError(selectedGame)" />
                    <div class="task-card" v-for="(tasks, taskType) in selectedAccount.tasks" :key="taskType">
                        <div class="task-card-header">
                            <p class="task-card-title">{{ taskType }}</p>
                        </div>
                        <div class="task-list">
                            <div class="task" v-for="task in tasks" :key="task.id"
                                :class="{ done: task.isCompleted, disabled: task.isDisabled }"
                                @click="manageTaskLog(task)">
                                <div class="task-check">
                                    <span v-if="task.isCompleted">✓</span>
                                    <span v-if="task.isDisabled">✗</span>
                                </div>
                                <p class="task-name">{{ task.label }}</p>
                                <div class="task-completion" v-if="!task.isDisabled">
                                    <span class="task-countdown"
                                        :class="{ urgent: !task.isCompleted && isUrgent(task) }">
                                        {{ task.isCompleted ? 'Done' : countdownFormat(task.nextReset) }}
                                    </span>
                                    <div class="task-countdown-bar" v-if="!task.isCompleted">
                                        <div class="task-progress" :style="{ width: taskProgress(task) + '%' }">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

    </div>
</template>

<script setup>
const MS_IN_DAY = 1000 * 60 * 60 * 24
const MS_IN_HOUR = 1000 * 60 * 60
const MS_IN_MIN = 1000 * 60

import '../styles/tasks.css';
import { ref, onMounted, onUnmounted, computed, watchEffect, watch, nextTick } from 'vue';
import { useNotification } from './composables/useNotification.js'
import { useConfirm } from './composables/useConfirm.js'
import { useSettings } from './composables/useSettings.js'
const { settings, saveSettings, toggleSetting } = useSettings()

const { confirm } = useConfirm()
const { createNotification } = useNotification()

const props = defineProps({
    accountsPerGame: {
        type: Array,
        default: () => []
    },
    gameConfig: {
        type: Object,
        default: () => ({})
    }
})

const GAME_CONFIG = props.gameConfig;

const emit = defineEmits(['refreshAccount', 'refresh'])

const missingGames = ref([])
const gameImages = ref({})
const sidebarIcons = ref({})
const showGamePicker = ref(false)
const selectedGame = ref(null)
const selectedAccount = ref(null)
const failedImages = ref(new Set());
const notifiedTaskIds = new Set()

const editUidValue = ref('')
const editingUid = ref(false)
const uidInput = ref(null)

const editLabelValue = ref('')
const editingLabelId = ref(null)
const labelInput = ref(null)

const editingServer = ref(false)
const serverAnchor = ref(null)

const currentGameConfig = computed(() => GAME_CONFIG[selectedGame.value?.name])

const trackedGames = computed(() =>
    props.accountsPerGame.filter(game => game.accounts.length > 0)
)

const notificationsEnabled = computed(() =>
    settings.value.windowsNotifications?.[selectedGame.value?.name]?.includes(selectedAccount.value?.id) ?? false
)

const isUrgent = (task) => {
    return taskProgress(task) > 80
}

const taskProgress = (task) => Math.max(0, Math.floor(((task.duration - task.nextReset) / task.duration) * 100));

const urgentTasks = computed(() =>
    props.accountsPerGame.flatMap(game =>
        game.accounts
            .flatMap(account =>
                Object.values(account.tasks).flatMap(taskGroup =>
                    taskGroup
                        .filter(task => !task.isCompleted && isUrgent(task))
                        .map(task => ({ game: game.name, task, toNotify: (settings.value.windowsNotifications?.[game.name] ?? []).includes(account.id) }))
                )
            )
    )
);

const hasUrgentTasks = (gameName) => {
    return urgentTasks.value.some(({ game }) => game === gameName)
}

const hasFinishedAllTasks = (gameName) => {
    const game = props.accountsPerGame.find(
        game => game.name === gameName
    );

    if (!game?.accounts.length) return false;

    return game.accounts.every(account => {
        const tasks = Object.values(account.tasks ?? {}).flat();

        return tasks.length > 0 &&
            tasks.every(task => task.isCompleted);
    });
};

watchEffect(() => {
    const games = trackedGames.value

    if (!selectedGame.value && games.length > 0) {
        selectedGame.value = games[0]
        selectedAccount.value = games[0].accounts[0]
    }
})

watch(() => props.accountsPerGame, async (newAccountsPerGame) => {
    const missingGameNames = await window.api.getGamesWithoutAccounts()
    missingGames.value = missingGameNames.map(name => ({ name }))

    const games = newAccountsPerGame.filter(game => game.accounts.length > 0)

    if (!selectedGame.value) return

    selectedGame.value = games.find(game => game.name === selectedGame.value.name)

    if (!selectedGame.value) {
        selectedGame.value = games[0] ?? null
        selectedAccount.value = selectedGame.value?.accounts[0] ?? null
        return
    }

    selectedAccount.value = selectedGame.value.accounts.find(account => account.id === selectedAccount.value?.id)

    if (!selectedAccount.value) {
        selectedAccount.value = selectedGame.value.accounts[0] ?? null
    }
}, { deep: true, immediate: true })

watch([selectedGame, selectedAccount], () => {
    cancelLabelEdit()
    cancelUidEdit()
    editingServer.value = false
})

watch(urgentTasks, (urgentEntries) => {
    const newUrgent = urgentEntries.filter(({ task, toNotify }) => !notifiedTaskIds.has(task.id) && toNotify)
    if (newUrgent.length === 0) return;

    newUrgent.forEach(({ task }) => notifiedTaskIds.add(task.id))

    const gameList = new Set();
    newUrgent.forEach(({ game }) => gameList.add(game));
    const games = [...gameList].join(', ');

    const body = newUrgent.length === 1
        ? `There is 1 task approaching its deadline in ${games}`
        : `There are ${newUrgent.length} tasks approaching their deadlines in ${games}`;

    window.api.sendNotification({
        title: 'Some tasks are approaching their deadline!',
        body
    });
});

const selectGame = (gameGroup) => {
    selectedGame.value = gameGroup
    selectedAccount.value = gameGroup.accounts[0]
}

const countdownFormat = (countdown) => {
    const daysLeft = Math.floor(countdown / MS_IN_DAY)
    const hoursLeft = Math.floor((countdown % MS_IN_DAY) / MS_IN_HOUR)
    const minsLeft = Math.floor((countdown % MS_IN_HOUR) / MS_IN_MIN)

    return daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` :
        hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` :
            `00:${String(minsLeft).padStart(2, '0')}`
}

const getCompletionPercentage = (tasks) => {
    const allTasks = Object.values(tasks).flat();
    const completedTasks = allTasks.filter(task => task.isCompleted).length;

    return allTasks.length > 0
        ? Math.floor((completedTasks / allTasks.length) * 100)
        : 0;
}

const insertAccount = async () => {
    const gameName = selectedGame.value.name;

    await apiCall(
        () => window.api.insertAccounts([{ name: gameName, server: 'America' }]),
        () => {
            createNotification("success", "Account created!", 1000);
            emit('refresh');
        }
    )
}

const deleteAccount = async () => {
    const ok = await confirm('Are you sure you want to delete this account?')
    if (!ok) return

    const accountId = selectedAccount.value.id
    const gameName = selectedGame.value.name

    await apiCall(
        () => window.api.deleteAccount({ gameName, id: accountId }),
        () => {
            createNotification('success', 'Account deleted!', 1000)
            settings.value.automaticDailies[gameName] = settings.value.automaticDailies[gameName]?.filter(id => id !== accountId)
            settings.value.windowsNotifications[gameName] = settings.value.windowsNotifications[gameName]?.filter(id => id !== accountId)
            saveSettings(true)
            emit('refresh')
        }
    )
}

const addGame = async (game) => {
    showGamePicker.value = false;

    await apiCall(
        () => window.api.insertAccounts([{ name: game.name, server: 'America' }]),
        () => {
            createNotification('success', 'Account created!', 1000);
            emit('refresh')
        }
    )
}

const manageTaskLog = async (task) => {
    if (task.isDisabled) return

    const taskLogData = {
        gameName: selectedGame.value.name,
        taskId: task.id,
        accountId: selectedAccount.value.id,
        completed: task.isCompleted
    };

    await apiCall(
        () => window.api.updateTaskLog(taskLogData),
        () => {
            createNotification('success', 'Task updated!', 1000)
            task.last_completed = task.isCompleted ? null : new Date().toISOString()
            emit('refreshAccount', selectedGame.value.name, selectedAccount.value.id)
        }
    )
}

const completeTaskLog = async (task, accountId, gameName) => {
    const taskLogData = {
        gameName,
        taskId: task.id,
        accountId,
        completed: false
    };

    await apiCall(
        () => window.api.updateTaskLog(taskLogData),
        () => {
            createNotification('success', 'Task updated!', 1000)
            task.last_completed = new Date().toISOString()
            emit('refreshAccount', gameName, accountId)
        }
    )
}

const startUidEdit = () => {
    editingUid.value = true
    editUidValue.value = selectedAccount.value.uid
    nextTick(() => {
        uidInput.value?.select()
    })
}

const commitUidEdit = async (accountId) => {
    if (!editingUid.value) return

    if (selectedAccount.value.id !== accountId) {
        cancelUidEdit()
        return
    }

    const newUid = editUidValue.value;
    const id = selectedAccount.value.id
    let server;

    if (!newUid) {
        createNotification('error', "Your UID can't be empty!", 2000);
        return
    }

    if (newUid.toString().length !== currentGameConfig.value.uid_digits) {
        createNotification("error", `Your UID should have ${currentGameConfig.value.uid_digits} digits!`, 2000);
        return
    }

    if (currentGameConfig.value.has_uid_pattern) {
        const firstDigit = parseInt(newUid.toString()[0]);
        server = Object.entries(currentGameConfig.value.servers).find(([_, s]) => s.uid_prefix === firstDigit)?.[0];

        if (!server) {
            createNotification('error', 'Your UID is invalid.', 2000);
            return
        }
    } else {
        server = selectedAccount.value.server;
    }

    await apiCall(
        () => window.api.updateAccount({ gameName: selectedGame.value.name, id, server, label: selectedAccount.value.label, uid: newUid }),
        () => {
            createNotification('success', 'Account updated!', 1000);
            selectedAccount.value.server = server
            selectedAccount.value.uid = newUid
            editingUid.value = false
            emit('refreshAccount', selectedGame.value.name, selectedAccount.value.id)
        }
    )
}

const cancelUidEdit = () => {
    editingUid.value = false
    editingServer.value = false
}

const commitAndCancelUidEdit = async (accountId) => {
    await commitUidEdit(accountId)
    cancelUidEdit()
}

const startLabelEdit = (account) => {
    if (selectedAccount.value.id !== account.id) {
        selectedAccount.value = account
        return
    }
    editingLabelId.value = account.id
    editLabelValue.value = account.label
    nextTick(() => {
        labelInput.value?.[0].select()
    })
}

const commitLabelEdit = async () => {
    if (!editingLabelId.value) return

    const newLabel = editLabelValue.value;
    if (newLabel.toString().length === 0) {
        createNotification("error", "Your label can't be empty!", 2000);
        cancelLabelEdit();
        return
    }
    const id = selectedAccount.value.id

    await apiCall(
        () => window.api.updateAccount({ gameName: selectedGame.value.name, id, server: selectedAccount.value.server, uid: selectedAccount.value.uid, label: newLabel }),
        () => {
            createNotification('success', 'Account updated!', 1000);
            selectedAccount.value.label = newLabel
            editingLabelId.value = null
        }
    )
}

const cancelLabelEdit = () => {
    editingLabelId.value = null
}

const commitAndMoveToNext = async (currentAccount) => {
    if (!editingLabelId.value) return
    await commitLabelEdit()

    const accounts = selectedGame.value.accounts
    const accountIndex = accounts.findIndex(a => a.id === currentAccount.id)

    if (accountIndex === -1) return

    const next = accounts[accountIndex + 1]

    if (!next) return

    selectedAccount.value = next
    startLabelEdit(next)
}

const availableServers = computed(() => {
    if (!selectedGame.value) return []
    const config = GAME_CONFIG[selectedGame.value.name]
    if (!config) return []
    return Object.keys(config.servers)
})

const selectServer = async (server) => {
    editingServer.value = false
    if (server === selectedAccount.value.server) return

    const { id, uid, label } = selectedAccount.value

    await apiCall(
        () => window.api.updateAccount({ gameName: selectedGame.value.name, id, server, uid, label }),
        () => {
            createNotification('success', 'Server updated!', 1000)
            selectedAccount.value.server = server
            emit('refreshAccount', selectedGame.value.name, selectedAccount.value.id)
        }
    )
}

const handleClickOutside = (e) => {
    if (serverAnchor.value && !serverAnchor.value.contains(e.target)) {
        editingServer.value = false
    }
}

const toggleAndSaveSetting = (map, gameName, accountId) => {
    toggleSetting(map, gameName, accountId)
    saveSettings()
}

const loadGameImage = async (game) => {
    const slug = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const filename = failedImages.value.has(game.name)
        ? `${slug}_default`
        : `${slug}_${game.game_version}`;

    gameImages.value[game.name] = await window.api.cacheImage(`games/${filename}.webp`);
};

const loadSidebarIcon = async (game) => {
    const slug = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    sidebarIcons.value[game.name] = await window.api.cacheImage(`games/${slug}_icon.webp`);
};

const getGameImageBackgroundUrl = (game) => {
    return gameImages.value[game.name] ? `url(${gameImages.value[game.name]})` : '';
};

const getCharacterThemeImage = () => {
    return new URL(`../assets/themes/${settings.value.theme}/game_theme.webp`, import.meta.url).href;
}

const getCompletionSticker = () => {
    return new URL(`../assets/themes/${settings.value.theme}/tasks_completed.webp`, import.meta.url).href;
}

const handleImageError = (game) => {
    if (failedImages.value.has(game.name)) return

    failedImages.value = new Set([...failedImages.value, game.name]);
    loadGameImage(game);
};

watch(trackedGames, async (games) => {
    for (const game of games) {
        if (!gameImages.value[game.name]) {
            await loadGameImage(game)
        }
        if (!sidebarIcons.value[game.name]) {
            await loadSidebarIcon(game)
        }
    }
}, { immediate: true })

const apiCall = async (fn, onSuccess) => {
    try {
        const response = await fn()
        if (response.success) {
            onSuccess(response)
        } else {
            createNotification('error', `Error: ${response.error || 'Unknown error'}`, 2000)
        }
    } catch (err) {
        createNotification('error', `Critical Error: ${err.message}`, 2000)
    }
}

onMounted(async () => {
    document.addEventListener('mousedown', handleClickOutside);

    const missingGameNames = await window.api.getGamesWithoutAccounts();
    missingGames.value = missingGameNames.map(name => ({ name }));

    window.api.on('game-detected', (event, game) => {
        const gameGroup = props.accountsPerGame.find(g => g.name === game)
        if (!gameGroup) return

        gameGroup.accounts.forEach(account => {
            const toCheck = settings.value.automaticDailies[gameGroup.name]?.includes(account.id)

            if (toCheck) {
                const task = account.tasks.Daily?.[0]

                if (task && task.id && !task.isCompleted) {
                    completeTaskLog(task, account.id, gameGroup.name)
                }
            }
        })
    })
})

onUnmounted(() => {
    window.api.removeAllListeners('game-detected');
    document.removeEventListener('mousedown', handleClickOutside);
})
</script>