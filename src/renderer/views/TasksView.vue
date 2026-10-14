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
                            <span :class="{ complete: completionPercentage === 100 }">{{
                                completionPercentage }}% Completed</span>
                            <img v-if="completionPercentage === 100 && settings.theme" :src="getCompletionSticker()"
                                class="complete-sticker">
                        </div>
                        <div class="hero-actions">
                            <button class="btn-edit" v-if="!editingUid" @click="startUidEdit">Edit UID</button>
                            <button class="btn-edit" v-else @mousedown.prevent="cancelUidEdit"
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
                    <div class="account-nav-list">
                        <div class="account-tab" v-for="account in selectedGame.accounts" :key="account.id"
                            @click="selectedAccountId = account.id"
                            :class="{ active: selectedAccount?.id === account.id }">

                            <span v-if="editingLabelId !== account.id" @click.stop="startLabelEdit(account)">
                                {{ account.label || account.uid || 'New Account' }}
                            </span>

                            <input v-else class="account-label-input" type="text" v-model="editLabelValue"
                                @keyup.enter="commitLabelEdit" @keyup.escape="cancelLabelEdit"
                                @keydown.tab.prevent="commitAndMoveToNext(account)" @blur="commitLabelEdit"
                                ref="labelInput"
                                :style="{ width: (Math.max(editLabelValue?.length ?? 0, 4) * 7) + 'px' }" />
                        </div>

                        <div class="account-tab-add" @click="insertAccount">+</div>
                    </div>

                    <div class="monthly-sub" @click="startMonthlySubEdit">
                        <template v-if="!editingMonthlySub">
                            {{ currentGameConfig?.monthlySub ?? 'Monthly Sub' }}:
                            <span
                                :class="{ 'monthly-sub-urgent': Number(selectedAccount?.monthlySubRemaining ?? 0) < 5 }">
                                {{ selectedAccount?.monthlySubRemaining ?? 0 }}
                            </span>
                        </template>

                        <input v-else ref="monthlySubInput" v-model="monthlySubValue" type="number" min="0" step="1"
                            @click.stop @keydown.enter.prevent="$event.target.blur()"
                            @keydown.esc.prevent="cancelMonthlySubEdit" @blur="saveMonthlySub" />
                    </div>
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
                                @click="toggleTask(task)">
                                <div class="task-check">
                                    <span v-if="task.isCompleted">✓</span>
                                    <span v-if="task.isDisabled">✗</span>
                                </div>
                                <p class="task-name">{{ task.label }}</p>
                                <div class="task-completion" v-if="!task.isDisabled">
                                    <span class="task-countdown"
                                        :class="{ urgent: !task.isCompleted && isUrgent(task) }">
                                        {{ task.isCompleted ? 'Done' : task.nextReset === null ? 'Ongoing' :
                                            formatCountdown(task.nextReset) }}
                                    </span>
                                    <div class="task-countdown-bar" v-if="!task.isCompleted && task.nextReset !== null">
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
import '../styles/tasks.css';
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useNotification } from '../composables/useNotification.js'
import { useConfirm } from '../composables/useConfirm.js'
import { useSettings } from '../composables/useSettings.js'
import { useAccounts } from '../composables/useAccounts.js'
import { taskProgress, isUrgent } from '../../shared/tasks.js'
import { slugify, formatCountdown } from '../../shared/format.js'

const { settings, saveSettings, toggleSetting } = useSettings()
const { confirm } = useConfirm()
const { createNotification } = useNotification()
const {
    gameConfig,
    accountsPerGame,
    insertAccounts,
    updateAccount,
    deleteAccount: removeAccount,
    setTaskCompleted
} = useAccounts()

const defaultServer = (gameName) => Object.keys(gameConfig.value?.[gameName]?.servers ?? {})[0];

const gameImages = ref({})
const sidebarIcons = ref({})
const showGamePicker = ref(false)
const selectedGameName = ref(null)
const selectedAccountId = ref(null)
const failedImages = ref(new Set());

const editUidValue = ref('')
const editingUid = ref(false)
const uidInput = ref(null)

const editLabelValue = ref('')
const editingLabelId = ref(null)
const labelInput = ref(null)

const editingServer = ref(false)
const serverAnchor = ref(null)

const editingMonthlySub = ref(false)
const monthlySubValue = ref('')
const monthlySubInput = ref(null)

const currentGameConfig = computed(() => gameConfig.value?.[selectedGame.value?.name])

const trackedGames = computed(() =>
    accountsPerGame.value.filter(game => game.accounts.length > 0)
)

const selectedGame = computed(() =>
    trackedGames.value.find(g => g.name === selectedGameName.value)
    ?? trackedGames.value[0] ?? null
)

const selectedAccount = computed(() =>
    selectedGame.value?.accounts.find(a => a.id === selectedAccountId.value)
    ?? selectedGame.value?.accounts[0] ?? null
)

const missingGames = computed(() =>
    accountsPerGame.value.filter(g => g.accounts.length === 0)
)

const notificationsEnabled = computed(() =>
    settings.value.windowsNotifications?.[selectedGame.value?.name]?.includes(selectedAccount.value?.id) ?? false
)

const hasUrgentTasks = (gameName) =>
    accountsPerGame.value
        .find(g => g.name === gameName)
        ?.accounts.some(account =>
            Object.values(account.tasks).flat().some(task => !task.isCompleted && isUrgent(task))
        ) ?? false

watch([selectedGameName, selectedAccountId], () => {
    cancelLabelEdit()
    cancelUidEdit()
    editingServer.value = false
})

const selectGame = (gameGroup) => {
    selectedGameName.value = gameGroup.name
    selectedAccountId.value = gameGroup.accounts[0]?.id ?? null
}

const completionPercentage = computed(() => {
    const tasks = selectedAccount.value?.tasks ?? {};
    const allTasks = Object.values(tasks).flat();
    const completedTasks = allTasks.filter(task => task.isCompleted || task.isDisabled).length;

    return allTasks.length > 0
        ? Math.floor((completedTasks / allTasks.length) * 100)
        : 0;
})

const run = async (action, successMessage) => {
    try {
        await action()
        createNotification('success', successMessage, 1000)
        return true
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2000)
        return false
    }
}

const insertAccount = async () => {
    const gameName = selectedGame.value.name;
    const server = selectedAccount.value?.server ?? defaultServer(gameName);

    await run(() => insertAccounts([{ name: gameName, server }]), 'Account created!')
}

const deleteAccount = async () => {
    const ok = await confirm('Are you sure you want to delete this account?', { confirmText: 'Delete' })
    if (!ok) return

    await run(() => removeAccount(selectedGame.value.name, selectedAccount.value.id), 'Account deleted!')
}

const addGame = async (game) => {
    showGamePicker.value = false;

    await run(() => insertAccounts([{ name: game.name, server: defaultServer(game.name) }]), 'Account created!')
}

const toggleTask = async (task) => {
    if (task.isDisabled) return

    await run(
        () => setTaskCompleted(selectedGame.value.name, selectedAccount.value.id, task.id, !task.isCompleted),
        'Task updated!'
    )
}

const startUidEdit = () => {
    editingUid.value = true
    editUidValue.value = selectedAccount.value.uid ? String(selectedAccount.value.uid) : ''
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
    let server;

    if (!newUid) {
        createNotification('error', "Your UID can't be empty!", 2000);
        return
    }

    if (newUid.length !== currentGameConfig.value.uid_digits) {
        createNotification("error", `Your UID should have ${currentGameConfig.value.uid_digits} digits!`, 2000);
        return
    }

    if (currentGameConfig.value.has_uid_pattern) {
        const firstDigit = parseInt(newUid[0]);
        server = Object.entries(currentGameConfig.value.servers).find(([, s]) => s.uid_prefix === firstDigit)?.[0];

        if (!server) {
            createNotification('error', 'Your UID is invalid.', 2000);
            return
        }
    } else {
        server = selectedAccount.value.server;
    }

    const saved = await run(
        () => updateAccount(selectedGame.value.name, accountId, { uid: newUid, server }),
        'Account updated!'
    )

    if (saved) editingUid.value = false
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
        selectedAccountId.value = account.id
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
    if (newLabel.length === 0) {
        createNotification("error", "Your label can't be empty!", 2000);
        cancelLabelEdit();
        return
    }

    const saved = await run(
        () => updateAccount(selectedGame.value.name, selectedAccount.value.id, { label: newLabel }),
        'Account updated!'
    )

    if (saved) editingLabelId.value = null
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

    selectedAccountId.value = next.id
    startLabelEdit(next)
}

const startMonthlySubEdit = () => {
    if (editingMonthlySub.value) return

    monthlySubValue.value = selectedAccount.value?.monthlySubRemaining ?? 0
    editingMonthlySub.value = true
    nextTick(() => monthlySubInput.value?.select())
}

const cancelMonthlySubEdit = () => {
    editingMonthlySub.value = false
}

const saveMonthlySub = async () => {
    if (!editingMonthlySub.value) return
    editingMonthlySub.value = false

    const monthlySubRemaining = Number(monthlySubValue.value)
    if (!Number.isInteger(monthlySubRemaining) || monthlySubRemaining < 0) {
        createNotification('error', 'Enter a valid number of days', 2000)
        return
    }

    const account = selectedAccount.value
    if (monthlySubRemaining === Number(account.monthlySubRemaining ?? 0)) return

    await run(
        () => updateAccount(selectedGame.value.name, account.id, { monthlySubRemaining }),
        'Subscription updated!'
    )
}

const availableServers = computed(() =>
    Object.keys(currentGameConfig.value?.servers ?? {})
)

const selectServer = async (server) => {
    editingServer.value = false
    if (server === selectedAccount.value.server) return

    await run(
        () => updateAccount(selectedGame.value.name, selectedAccount.value.id, { server }),
        'Server updated!'
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
    const slug = slugify(game.name);
    const filename = failedImages.value.has(game.name)
        ? `${slug}_default`
        : `${slug}_${game.game_version}`;

    gameImages.value[game.name] = await window.api.cacheImage(`games/${filename}.webp`);
};

const loadSidebarIcon = async (game) => {
    sidebarIcons.value[game.name] = await window.api.cacheImage(`games/${slugify(game.name)}_icon.webp`);
};

const getGameImageBackgroundUrl = (game) => {
    const src = gameImages.value[game.name]
    return src ? `url("${src}")` : ''
};

const getCharacterThemeImage = () => {
    return new URL(`../../assets/themes/${settings.value.theme}/game_theme.webp`, import.meta.url).href;
}

const getCompletionSticker = () => {
    return new URL(`../../assets/themes/${settings.value.theme}/tasks_completed.webp`, import.meta.url).href;
}

const handleImageError = (game) => {
    if (failedImages.value.has(game.name)) return

    failedImages.value = new Set([...failedImages.value, game.name]);
    loadGameImage(game);
};

const loadedImageVersions = {}

watch(trackedGames, async (games) => {
    await Promise.all(games.flatMap(game => {
        const loads = []

        if (loadedImageVersions[game.name] !== game.game_version) {
            loadedImageVersions[game.name] = game.game_version

            if (failedImages.value.has(game.name)) {
                const nextFailed = new Set(failedImages.value)
                nextFailed.delete(game.name)
                failedImages.value = nextFailed
            }

            loads.push(loadGameImage(game))
        }

        if (!sidebarIcons.value[game.name]) {
            loads.push(loadSidebarIcon(game))
        }

        return loads
    }))
}, { immediate: true })

onMounted(() => {
    document.addEventListener('mousedown', handleClickOutside);
})

onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside);
})
</script>