<template>
    <div id="tasksApp">
        <div class="sidebar">
            <p class="sidebar-title">Game List</p>
            <div class="game-list">
                <div
                    v-for="gameGroup in trackedGames"
                    :key="gameGroup.name"
                    class="game-item"
                    :class="{ active: selectedGame?.name === gameGroup.name }"
                    :title="gameLabel(gameGroup)"
                    @click="selectGame(gameGroup)"
                >
                    <div class="game-name-row">
                        <span
                            v-if="gameGroup.custom"
                            class="game-item-icon game-item-abbr"
                            :style="{ '--game-color': gameGroup.color }"
                            aria-hidden="true"
                        >
                            {{ customGameAbbr(gameGroup.displayName) }}
                        </span>
                        <img v-else class="game-item-icon" :src="sidebarIcons[gameGroup.name]" :alt="gameGroup.name" />
                        <p class="game-name">{{ gameLabel(gameGroup) }}</p>
                    </div>
                    <span v-if="hasUrgentTasks(gameGroup.name)" class="urgent-orb" />
                </div>
            </div>

            <div ref="gamePickerAnchor" class="add-game-wrapper">
                <Transition name="popover">
                    <div v-if="showGamePicker" class="game-picker">
                        <div
                            v-for="game in missingGames"
                            :key="game.name"
                            class="game-picker-item"
                            @click="addGame(game)"
                        >
                            {{ gameLabel(game) }}
                        </div>
                        <div class="game-picker-item game-picker-item--custom" @click="addCustomGame">
                            + Custom game
                        </div>
                    </div>
                </Transition>
                <button
                    class="add-game"
                    aria-label="Add game"
                    :aria-expanded="showGamePicker"
                    @click="showGamePicker = !showGamePicker"
                >
                    <span aria-hidden="true">+</span>
                    <span class="add-game-text">Add Game</span>
                </button>
            </div>

            <div class="recent-codes-wrapper">
                <button class="add-game" aria-label="Recent codes" @click="showRecentCodes = true">
                    <svg
                        class="add-game-short"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M15 12h-5" />
                        <path d="M15 8h-5" />
                        <path d="M19 17V5a2 2 0 0 0-2-2H4" />
                        <path
                            d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
                        />
                    </svg>
                    <span class="add-game-text">Recent Codes</span>
                </button>
            </div>
        </div>

        <div class="main">
            <div v-if="selectedGame && selectedAccount" class="main-inner">
                <div class="hero">
                    <img v-if="heroImage" :src="heroImage" class="hero-img" />
                    <div class="hero-title-row">
                        <button
                            class="btn-favorite"
                            :class="{ active: isFavorite }"
                            :title="isFavorite ? 'Favorite game' : 'Set as favorite game'"
                            :aria-pressed="isFavorite"
                            @click="toggleFavorite"
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                :fill="isFavorite ? 'currentColor' : 'none'"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polygon
                                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                />
                            </svg>
                        </button>
                        <template v-if="isCustomGame">
                            <input
                                v-if="gameNameEdit.editing"
                                :ref="(el) => (gameNameEdit.input = el)"
                                v-model="gameNameEdit.value"
                                class="hero-title hero-title-input"
                                type="text"
                                :maxlength="CUSTOM_GAME_NAME_MAX"
                                aria-label="Game name"
                                @keydown.enter.prevent="gameNameEdit.commit()"
                                @keydown.esc.prevent="gameNameEdit.cancel()"
                                @blur="gameNameEdit.finish()"
                            />
                            <p v-else class="hero-title hero-title--editable" title="Rename" @click="startGameNameEdit">
                                {{ selectedGame.displayName }}
                            </p>
                        </template>
                        <p v-else class="hero-title">{{ selectedGame.name }} {{ selectedGame.game_version }}</p>
                    </div>

                    <div class="hero-bottom">
                        <div class="hero-account-info">
                            <div v-if="!isCustomGame" ref="serverAnchor" class="server-wrapper">
                                <span class="account-server server-clickable" @click="editingServer = !editingServer">
                                    {{ selectedAccount?.server }}
                                    <svg
                                        width="8"
                                        height="8"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="3"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </span>
                                <Transition name="popover">
                                    <div v-if="editingServer" class="server-picker">
                                        <div
                                            v-for="s in availableServers"
                                            :key="s"
                                            class="server-picker-item"
                                            :class="{ active: s === selectedAccount?.server }"
                                            @click="selectServer(s)"
                                        >
                                            {{ s }}
                                        </div>
                                    </div>
                                </Transition>
                            </div>
                            <span v-if="!uidEdit.editing" class="account-uid" @click="startUidEdit">{{
                                selectedAccount?.uid || 0
                            }}</span>
                            <input
                                v-else
                                :ref="(el) => (uidEdit.input = el)"
                                v-model="uidEdit.value"
                                class="account-uid account-uid-input"
                                type="text"
                                :maxlength="uidMaxLength"
                                inputmode="numeric"
                                @keydown.enter.prevent="uidEdit.commit()"
                                @keydown.esc.prevent="uidEdit.cancel()"
                                @blur="uidEdit.finish()"
                                @input="uidEdit.value = uidEdit.value.replace(/\D/g, '')"
                            />
                        </div>
                        <div class="hero-progress">
                            <span :class="{ complete: completionPercentage === 100 }"
                                >{{ completionPercentage }}% Completed</span
                            >
                            <img
                                v-if="completionPercentage === 100 && completionSticker"
                                :src="completionSticker"
                                class="complete-sticker"
                            />
                        </div>
                        <div class="hero-actions">
                            <div
                                v-if="selectedGame.maintenance"
                                class="maintenance-warning"
                                :class="
                                    maintenanceOngoing
                                        ? 'maintenance-warning--ongoing'
                                        : 'maintenance-warning--upcoming'
                                "
                            >
                                <span class="maintenance-dot" />
                                <span class="maintenance-label">{{ maintenanceLabel }}</span>
                                <span class="maintenance-compact">
                                    <span class="maintenance-compact-title">Maintenance</span>
                                    <span class="maintenance-compact-time">{{ maintenanceShort }}</span>
                                </span>
                            </div>
                            <button v-if="taskCategories.length > 0" class="btn-edit" @click="openCustomTaskDialog()">
                                <svg
                                    class="btn-glyph"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    aria-hidden="true"
                                >
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                <span class="btn-text">Add Task</span>
                            </button>
                            <button v-if="!uidEdit.editing" class="btn-edit" @click="startUidEdit">
                                <svg
                                    class="btn-glyph"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                                </svg>
                                <span class="btn-text">Edit UID</span>
                            </button>
                            <button
                                v-else
                                class="btn-edit"
                                @mousedown.prevent="uidEdit.cancel()"
                                @click="uidEdit.cancel()"
                            >
                                <svg
                                    class="btn-glyph"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    aria-hidden="true"
                                >
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                </svg>
                                <span class="btn-text">Cancel</span>
                            </button>
                            <button
                                v-if="!isCustomGame || selectedGame.accounts.length > 1"
                                class="btn-delete"
                                @click="deleteAccount"
                            >
                                <svg
                                    class="btn-glyph"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    aria-hidden="true"
                                >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                                <span class="btn-text">Delete Account</span>
                            </button>
                            <button v-if="isCustomGame" class="btn-delete" @click="deleteGame">Delete Game</button>
                            <button
                                v-if="!isCustomGame"
                                class="btn-icon"
                                title="Report a problem with a task"
                                aria-label="Report a problem with a task"
                                @click="reportTask"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                    <line x1="4" y1="22" x2="4" y2="15" />
                                </svg>
                            </button>
                            <button
                                class="btn-icon"
                                :class="{ active: deadlineNotificationsEnabled }"
                                :title="
                                    deadlineNotificationsEnabled
                                        ? 'Deadline notifications on'
                                        : 'Deadline notifications off'
                                "
                                @click="
                                    toggleAndSaveSetting(
                                        settings.deadlineNotifications,
                                        selectedGame.name,
                                        selectedAccount.id,
                                    )
                                "
                            >
                                <BellIcon :off="!deadlineNotificationsEnabled" />
                            </button>
                            <button
                                v-if="desktop && !isCustomGame"
                                class="btn-icon"
                                :class="{ active: automationEnabled }"
                                :title="automationEnabled ? 'Automatic dailies on' : 'Automatic dailies off'"
                                @click="toggleAutomation"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    <line v-if="!automationEnabled" x1="2" y1="2" x2="22" y2="22" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="account-nav">
                    <div class="account-nav-list">
                        <div
                            v-for="account in selectedGame.accounts"
                            :key="account.id"
                            class="account-tab"
                            :class="{ active: selectedAccount?.id === account.id }"
                            @click="selectedAccountId = account.id"
                        >
                            <span v-if="!labelEdit.isEditing(account.id)" @click.stop="startLabelEdit(account)">
                                {{ account.label || account.uid || 'New Account' }}
                            </span>

                            <input
                                v-else
                                :ref="(el) => (labelEdit.input = el)"
                                v-model="labelEdit.value"
                                class="account-label-input"
                                type="text"
                                :style="{ width: Math.max(labelEdit.value.length, 4) + 1 + 'ch' }"
                                @keydown.enter.prevent="labelEdit.commit()"
                                @keydown.esc.prevent="labelEdit.cancel()"
                                @keydown.tab.prevent="commitAndMoveToNext(account)"
                                @blur="labelEdit.finish()"
                            />
                        </div>

                        <div class="account-tab-add" @click="insertAccount">+</div>
                    </div>

                    <div v-if="!isCustomGame" class="monthly-sub">
                        <div @click="startMonthlySubEdit">
                            <template v-if="!monthlySubEdit.editing">
                                {{ currentGameConfig?.monthlySub ?? 'Monthly Sub' }}:
                                <span
                                    :class="{
                                        'monthly-sub-urgent': isMonthlySubUrgent(
                                            Number(selectedAccount?.monthlySubRemaining),
                                        ),
                                    }"
                                >
                                    {{ selectedAccount?.monthlySubRemaining ?? 0 }}
                                </span>
                            </template>

                            <input
                                v-else
                                :ref="(el) => (monthlySubEdit.input = el)"
                                v-model="monthlySubEdit.value"
                                type="number"
                                min="0"
                                step="1"
                                @click.stop
                                @keydown.enter.prevent="monthlySubEdit.commit()"
                                @keydown.esc.prevent="monthlySubEdit.cancel()"
                                @blur="monthlySubEdit.finish()"
                            />
                        </div>
                        <div>
                            <button
                                class="btn-icon"
                                :class="{ active: monthlySubNotificationsEnabled }"
                                :title="
                                    monthlySubNotificationsEnabled
                                        ? 'Monthly sub notifications on'
                                        : 'Monthly sub notifications off'
                                "
                                @click="
                                    toggleAndSaveSetting(
                                        settings.monthlySubNotifications,
                                        selectedGame.name,
                                        selectedAccount.id,
                                    )
                                "
                            >
                                <BellIcon :off="!monthlySubNotificationsEnabled" />
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    ref="tasksScroll"
                    class="tasks-scroll"
                    :style="{ backgroundImage: getGameImageBackgroundUrl(selectedGame) }"
                >
                    <div class="tasks-area" :class="{ 'tasks-area--maintenance': selectedGame.maintenance }">
                        <img
                            v-if="!isCustomGame"
                            :key="selectedGame.name"
                            :src="gameImages[selectedGame.name]"
                            style="display: none"
                            @error="handleImageError(selectedGame)"
                        />
                        <div v-for="(tasks, taskType) in selectedAccount.tasks" :key="taskType" class="task-card">
                            <div class="task-card-header">
                                <p class="task-card-title">{{ taskType }}</p>
                            </div>
                            <div class="task-list">
                                <div
                                    v-for="task in tasks"
                                    :key="task.id"
                                    class="task"
                                    :class="{
                                        done: task.isCompleted,
                                        disabled: task.isDisabled && !task.ended,
                                        ended: task.ended && !task.isCompleted,
                                        custom: task.custom,
                                    }"
                                    @click="toggleTask(task)"
                                >
                                    <div class="task-check">
                                        <span v-if="task.isCompleted">✓</span>
                                        <span v-if="task.isDisabled">✗</span>
                                    </div>
                                    <p class="task-name">{{ task.label }}</p>
                                    <div v-if="!task.isDisabled" class="task-completion">
                                        <span
                                            class="task-countdown"
                                            :class="{ urgent: !task.isCompleted && isUrgent(task) }"
                                        >
                                            {{
                                                task.isCompleted
                                                    ? 'Done'
                                                    : task.nextReset === null
                                                      ? 'Ongoing'
                                                      : formatCountdown(task.nextReset)
                                            }}
                                        </span>
                                        <div
                                            v-if="!task.isCompleted && task.nextReset !== null"
                                            class="task-countdown-bar"
                                        >
                                            <div
                                                class="task-progress"
                                                :style="{ width: taskProgress(task) + '%' }"
                                            ></div>
                                        </div>
                                    </div>
                                    <div v-else-if="task.startsIn" class="task-completion">
                                        <span class="task-countdown"
                                            >Starts in {{ formatCountdown(task.startsIn) }}</span
                                        >
                                    </div>
                                    <div v-else-if="task.ended" class="task-completion">
                                        <span class="task-countdown">Ended</span>
                                    </div>
                                    <div v-if="task.custom" class="task-actions">
                                        <button
                                            type="button"
                                            class="task-action task-action--edit"
                                            title="Edit task"
                                            aria-label="Edit task"
                                            @click.stop="openCustomTaskDialog(task)"
                                        >
                                            ⚙&#xFE0E;
                                        </button>
                                        <button
                                            type="button"
                                            class="task-action task-action--delete"
                                            title="Delete task"
                                            aria-label="Delete task"
                                            @click.stop="removeCustomTask(task)"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            v-if="taskCategories.length === 0"
                            type="button"
                            class="task-card task-card-add"
                            @click="openCustomTaskDialog()"
                        >
                            + Add task
                        </button>
                    </div>
                    <AppFooter />
                </div>
            </div>
        </div>
    </div>

    <RecentCodesModal :open="showRecentCodes" :game="selectedGame?.name" @close="showRecentCodes = false" />
    <CustomTaskDialog
        :open="showCustomTaskDialog"
        :game-key="selectedGame?.name ?? null"
        :game-name="selectedGame ? gameLabel(selectedGame) : ''"
        :categories="taskCategories"
        :task="editingTask"
        @close="showCustomTaskDialog = false"
    />
</template>

<script setup>
import '../styles/tasks.css';
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import platform from '#platform';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useSettings } from '../composables/useSettings.js';
import { useAccounts } from '../composables/useAccounts.js';
import { taskProgress, isUrgent, isMonthlySubUrgent } from '../../shared/tasks.js';
import { slugify, formatCountdown, customGameAbbr } from '../../shared/format.js';
import { CUSTOM_GAME_NAME_MAX } from '../../shared/accounts/customData.js';
import { themeAsset } from '../themes.js';
import BellIcon from '../components/BellIcon.vue';
import RecentCodesModal from '../components/RecentCodesModal.vue';
import CustomTaskDialog from '../components/CustomTaskDialog.vue';
import { NOT_LISTED_TARGET, useReport } from '../composables/useReport.js';
import { useInlineEdit } from '../composables/useInlineEdit.js';
import AppFooter from '../components/AppFooter.vue';

const { settings, saveSettings, toggleSetting } = useSettings();
const { confirm } = useConfirm();
const { createNotification } = useNotification();
const {
    gameConfig,
    accountsPerGame,
    insertAccounts,
    updateAccount,
    deleteAccount: removeAccount,
    setTaskCompleted,
    createCustomGame,
    renameCustomGame,
    deleteCustomGame,
    deleteCustomTask,
} = useAccounts();
const { openReport } = useReport();

const desktop = platform.desktop;

const defaultServer = (gameName) => Object.keys(gameConfig.value?.[gameName]?.servers ?? {})[0];

const gameImages = ref({});
const sidebarIcons = ref({});
const showGamePicker = ref(false);
const showRecentCodes = ref(false);
const showCustomTaskDialog = ref(false);
const editingTask = ref(null);
const selectedGameName = ref(null);
const selectedAccountId = ref(null);
const failedImages = ref(new Set());

const editingServer = ref(false);
const serverAnchor = ref(null);
const gamePickerAnchor = ref(null);

const tasksScroll = ref(null);

const CUSTOM_UID_MAX = 20;

const gameLabel = (game) => game.displayName ?? game.name;

const findAccount = (accountId) => selectedGame.value?.accounts.find((account) => account.id === accountId);

const detectServer = (uid) => {
    const { has_uid_pattern: hasUidPattern, servers } = currentGameConfig.value;

    if (!hasUidPattern) return selectedAccount.value.server;

    return Object.entries(servers)
        .flatMap(([name, server]) => (server.uid_prefix ?? []).map((prefix) => [name, prefix]))
        .filter(([, prefix]) => uid.startsWith(prefix))
        .sort(([, a], [, b]) => b.length - a.length)[0]?.[0];
};

const saveUid = async (uid, accountId) => {
    if (selectedAccount.value?.id !== accountId) return true;

    if (!uid) {
        createNotification('error', "Your UID can't be empty!", 2000);
        return false;
    }

    if (isCustomGame.value) {
        return run(() => updateAccount(selectedGame.value.name, accountId, { uid }), 'Account updated!');
    }

    const uidDigits = currentGameConfig.value.uid_digits;

    if (!uidDigits.includes(uid.length)) {
        createNotification('error', `Your UID should have ${formatDigitCounts(uidDigits)} digits!`, 2000);
        return false;
    }

    const server = detectServer(uid);

    if (!server) createNotification('error', "Couldn't detect server, pick it manually.", 2000);

    return run(
        () => updateAccount(selectedGame.value.name, accountId, { uid, server }),
        server ? 'Account updated!' : "UID saved, but the server couldn't be detected. Pick it manually.",
        server ? 1000 : 3000,
    );
};

const saveLabel = async (label, accountId) => {
    if (!label) {
        createNotification('error', "Your label can't be empty!", 2000);
        return true;
    }

    if (label === findAccount(accountId)?.label) return true;

    return run(() => updateAccount(selectedGame.value.name, accountId, { label }), 'Account updated!');
};

const saveMonthlySub = async (raw, accountId) => {
    const monthlySubRemaining = Number(raw);

    if (!Number.isInteger(monthlySubRemaining) || monthlySubRemaining < 0) {
        createNotification('error', 'Enter a valid number of days', 2000);
        return false;
    }

    if (monthlySubRemaining === Number(findAccount(accountId)?.monthlySubRemaining ?? 0)) return true;

    return run(
        () => updateAccount(selectedGame.value.name, accountId, { monthlySubRemaining }),
        'Subscription updated!',
    );
};

const saveGameName = async (name, gameKey) => {
    const trimmed = name.trim();
    const game = accountsPerGame.value.find((group) => group.name === gameKey);

    if (!game || trimmed === game.displayName) return true;

    return run(() => renameCustomGame(gameKey, trimmed), 'Game renamed!');
};

const uidEdit = useInlineEdit({ read: () => selectedAccount.value?.uid ?? '', save: saveUid });
const labelEdit = useInlineEdit({ read: (accountId) => findAccount(accountId)?.label ?? '', save: saveLabel });
const monthlySubEdit = useInlineEdit({
    read: () => selectedAccount.value?.monthlySubRemaining ?? 0,
    save: saveMonthlySub,
});
const gameNameEdit = useInlineEdit({ read: () => selectedGame.value?.displayName ?? '', save: saveGameName });

const currentGameConfig = computed(() => gameConfig.value?.[selectedGame.value?.name]);

const trackedGames = computed(() => accountsPerGame.value.filter((game) => game.accounts.length > 0));

const selectedGame = computed(
    () =>
        trackedGames.value.find((g) => g.name === selectedGameName.value) ??
        trackedGames.value.find((g) => g.name === settings.value.favoriteGame) ??
        trackedGames.value[0] ??
        null,
);

const isCustomGame = computed(() => Boolean(selectedGame.value?.custom));

const taskCategories = computed(() => Object.keys(selectedAccount.value?.tasks ?? {}));

const isFavorite = computed(
    () => Boolean(selectedGame.value) && settings.value.favoriteGame === selectedGame.value.name,
);

const selectedAccount = computed(
    () =>
        selectedGame.value?.accounts.find((a) => a.id === selectedAccountId.value) ??
        selectedGame.value?.accounts[0] ??
        null,
);

const missingGames = computed(() => accountsPerGame.value.filter((g) => g.accounts.length === 0));

const deadlineNotificationsEnabled = computed(
    () =>
        settings.value.deadlineNotifications?.[selectedGame.value?.name]?.includes(selectedAccount.value?.id) ?? false,
);

const monthlySubNotificationsEnabled = computed(
    () =>
        settings.value.monthlySubNotifications?.[selectedGame.value?.name]?.includes(selectedAccount.value?.id) ??
        false,
);

const automationEnabled = computed(
    () =>
        (settings.value.checkGachaProcesses &&
            settings.value.automaticDailies?.[selectedGame.value?.name]?.includes(selectedAccount.value?.id)) ??
        false,
);

const heroImage = computed(() => themeAsset(settings.value.theme, 'game_theme'));
const completionSticker = computed(() => themeAsset(settings.value.theme, 'tasks_completed'));

const hasUrgentTasks = (gameName) =>
    accountsPerGame.value
        .find((g) => g.name === gameName)
        ?.accounts.some((account) =>
            Object.values(account.tasks)
                .flat()
                .some((task) => !task.isCompleted && isUrgent(task)),
        ) ?? false;

watch([selectedGameName, selectedAccountId], () => {
    labelEdit.cancel();
    uidEdit.cancel();
    monthlySubEdit.cancel();
    gameNameEdit.cancel();
    editingServer.value = false;
    tasksScroll.value?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
});

const selectGame = (gameGroup) => {
    selectedGameName.value = gameGroup.name;
    selectedAccountId.value = gameGroup.accounts[0]?.id ?? null;
};

const completionPercentage = computed(() => {
    const allTasks = Object.values(selectedAccount.value?.tasks ?? {}).flat();
    const active = allTasks.filter((task) => !task.isDisabled);
    const done = active.filter((task) => task.isCompleted).length;

    return active.length > 0 ? Math.floor((done / active.length) * 100) : 0;
});

const maintenanceOngoing = computed(() => selectedGame.value?.maintenance?.type === 'maintenance_ongoing');

const maintenanceTime = computed(() => {
    const maintenance = selectedGame.value?.maintenance;

    return maintenance ? formatCountdown(maintenance.time) : '';
});

const maintenanceLabel = computed(() =>
    maintenanceOngoing.value
        ? `Maintenance ends in ${maintenanceTime.value}`
        : `Maintenance starts in ${maintenanceTime.value}`,
);

const maintenanceShort = computed(() =>
    maintenanceOngoing.value ? `${maintenanceTime.value} left` : `in ${maintenanceTime.value}`,
);

const run = async (action, successMessage, duration = 1000) => {
    try {
        await action();
        createNotification('success', successMessage, duration);
        return true;
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2000);
        return false;
    }
};

const serverFor = (game) => (game.custom ? '' : defaultServer(game.name));

const insertAccount = async () => {
    const gameName = selectedGame.value.name;
    const server = selectedAccount.value?.server ?? serverFor(selectedGame.value);

    await run(() => insertAccounts([{ name: gameName, server }]), 'Account created!');
};

const deleteAccount = async () => {
    const ok = await confirm('Are you sure you want to delete this account?', { confirmText: 'Delete' });
    if (!ok) return;

    await run(() => removeAccount(selectedGame.value.name, selectedAccount.value.id), 'Account deleted!');
};

const addGame = async (game) => {
    showGamePicker.value = false;

    await run(() => insertAccounts([{ name: game.name, server: serverFor(game) }]), 'Account created!');
};

const addCustomGame = async () => {
    showGamePicker.value = false;

    let created;

    try {
        created = await createCustomGame();
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2000);
        return;
    }

    selectedGameName.value = created.key;
    selectedAccountId.value = created.account.id;
    createNotification('success', 'Game created!', 1000);

    await nextTick();
    startGameNameEdit();
};

const deleteGame = async () => {
    const game = selectedGame.value;
    const ok = await confirm(`Delete ${game.displayName} with all its accounts and tasks?`, { confirmText: 'Delete' });
    if (!ok) return;

    const deleted = await run(() => deleteCustomGame(game.name), 'Game deleted!');

    if (deleted) {
        selectedGameName.value = null;
        selectedAccountId.value = null;
    }
};

const startGameNameEdit = () => {
    if (isCustomGame.value) gameNameEdit.start(selectedGame.value.name);
};

const openCustomTaskDialog = (task = null) => {
    editingTask.value = task;
    showCustomTaskDialog.value = true;
};

const removeCustomTask = async (task) => {
    const ok = await confirm(`Delete the task "${task.label}"?`, { confirmText: 'Delete' });
    if (!ok) return;

    await run(() => deleteCustomTask(selectedGame.value.name, task.id), 'Task deleted!');
};

const toggleTask = async (task) => {
    if (task.isDisabled) return;

    await run(
        () => setTaskCompleted(selectedGame.value.name, selectedAccount.value.id, task.id, !task.isCompleted),
        'Task updated!',
    );
};

const startUidEdit = () => uidEdit.start(selectedAccount.value.id);

const startLabelEdit = (account) => {
    if (selectedAccount.value.id !== account.id) {
        selectedAccountId.value = account.id;
        return;
    }

    labelEdit.start(account.id);
};

const commitAndMoveToNext = async (account) => {
    if (!(await labelEdit.commit())) return;

    const accounts = selectedGame.value.accounts;
    const index = accounts.findIndex((candidate) => candidate.id === account.id);
    const next = index === -1 ? null : accounts[index + 1];

    if (!next) return;

    selectedAccountId.value = next.id;
    await nextTick();
    labelEdit.start(next.id);
};

const startMonthlySubEdit = () => {
    if (!monthlySubEdit.editing) monthlySubEdit.start(selectedAccount.value.id);
};

const availableServers = computed(() => Object.keys(currentGameConfig.value?.servers ?? {}));

const formatDigitCounts = (counts) =>
    counts.length === 1 ? `${counts[0]}` : `${counts.slice(0, -1).join(', ')} or ${counts.at(-1)}`;

const uidMaxLength = computed(() => {
    const digits = currentGameConfig.value?.uid_digits;

    return isCustomGame.value || !digits?.length ? CUSTOM_UID_MAX : Math.max(...digits);
});

const selectServer = async (server) => {
    editingServer.value = false;
    if (server === selectedAccount.value.server) return;

    await run(() => updateAccount(selectedGame.value.name, selectedAccount.value.id, { server }), 'Server updated!');
};

const handleClickOutside = (e) => {
    if (serverAnchor.value && !serverAnchor.value.contains(e.target)) {
        editingServer.value = false;
    }

    if (gamePickerAnchor.value && !gamePickerAnchor.value.contains(e.target)) {
        showGamePicker.value = false;
    }
};

const toggleAndSaveSetting = (map, gameName, accountId) => {
    toggleSetting(map, gameName, accountId);
    saveSettings();
};

const toggleFavorite = () => {
    selectedGameName.value = selectedGame.value.name;
    settings.value.favoriteGame = isFavorite.value ? null : selectedGame.value.name;
    saveSettings(true);
};

const toggleAutomation = async () => {
    const gameName = selectedGame.value.name;
    const accountId = selectedAccount.value.id;

    if (settings.value.checkGachaProcesses) {
        toggleAndSaveSetting(settings.value.automaticDailies, gameName, accountId);
        return;
    }

    const othersActive = Object.entries(settings.value.automaticDailies ?? {}).some(([game, ids]) =>
        ids.some((id) => game !== gameName || id !== accountId),
    );

    const ok = await confirm(
        'Automatic dailies use game detection, which checks your running programs every 30 seconds to see if a game is open. The list of programs is never saved or sent anywhere.' +
            (othersActive ? ' Accounts you set up for it before will be active again too.' : ''),
        { confirmText: 'Turn on' },
    );

    if (!ok) return;

    settings.value.checkGachaProcesses = true;

    if (!Array.isArray(settings.value.automaticDailies[gameName])) settings.value.automaticDailies[gameName] = [];
    if (!settings.value.automaticDailies[gameName].includes(accountId)) {
        settings.value.automaticDailies[gameName].push(accountId);
    }

    saveSettings();
};

const loadGameImage = async (game) => {
    const usingDefault = failedImages.value.has(game.name);
    const version = usingDefault ? 'default' : game.game_version;
    const url = await platform.images.getUrl(`games/${slugify(game.name)}_${version}.webp`);

    if (!url && !usingDefault) {
        handleImageError(game);
        return;
    }

    gameImages.value[game.name] = url;
};

const loadSidebarIcon = async (game) => {
    sidebarIcons.value[game.name] = await platform.images.getUrl(`games/${slugify(game.name)}_icon.webp`);
};

const getGameImageBackgroundUrl = (game) => {
    const src = gameImages.value[game.name];
    return src ? `url("${src}")` : '';
};

const handleImageError = (game) => {
    if (failedImages.value.has(game.name)) return;

    failedImages.value = new Set([...failedImages.value, game.name]);
    loadGameImage(game);
};

const loadedImageVersions = {};

const reportTask = () => {
    const taskTargets = Object.entries(selectedAccount.value.tasks).flatMap(([group, tasks]) =>
        tasks.filter((task) => !task.custom).map((task) => ({ id: String(task.id), label: task.label, group })),
    );

    openReport({
        game: selectedGame.value.name,
        topic: 'tasks',
        server: selectedAccount.value.server,
        targets: [...taskTargets, { id: NOT_LISTED_TARGET, label: 'Not Listed', group: 'Other' }],
    });
};

const imageGames = computed(() => trackedGames.value.filter((game) => !game.custom));

watch(
    () => imageGames.value.map((game) => `${game.name}:${game.game_version}`).join('|'),
    async () => {
        const games = imageGames.value;

        await Promise.all(
            games.flatMap((game) => {
                const loads = [];
                const versionChanged = loadedImageVersions[game.name] !== game.game_version;

                if (versionChanged || !gameImages.value[game.name]) {
                    loadedImageVersions[game.name] = game.game_version;

                    if (failedImages.value.has(game.name)) {
                        const nextFailed = new Set(failedImages.value);
                        nextFailed.delete(game.name);
                        failedImages.value = nextFailed;
                    }

                    loads.push(loadGameImage(game));
                }

                if (!sidebarIcons.value[game.name]) {
                    loads.push(loadSidebarIcon(game));
                }

                return loads;
            }),
        );
    },
    { immediate: true },
);

onMounted(() => {
    document.addEventListener('pointerdown', handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('pointerdown', handleClickOutside);
});
</script>
