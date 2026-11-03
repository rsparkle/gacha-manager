<template>
    <Transition name="confirm">
        <div v-if="showSettings" class="settings-overlay" @click.self="closeSettings">
            <div class="settings-modal">
                <div class="settings-header">
                    <h1 class="settings-title">Settings</h1>
                    <button class="settings-close" aria-label="Close" @click="closeSettings">×</button>
                </div>

                <div class="settings-body">
                    <div v-if="desktop" class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Automatic Updates</span>
                                <small>Download and install new versions in the background</small>
                            </div>
                            <label class="toggle">
                                <input v-model="draft.automaticUpdates" type="checkbox" />
                                <span class="toggle-box">
                                    <svg class="toggle-check" viewBox="0 0 16 16" width="10" height="10">
                                        <path
                                            d="M2 8.5L6 12L14 3"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div v-if="desktop" class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Start Automatically</span>
                                <small>Launch when your computer starts</small>
                            </div>
                            <label class="toggle">
                                <input v-model="draft.launchAtStartup" type="checkbox" />
                                <span class="toggle-box">
                                    <svg class="toggle-check" viewBox="0 0 16 16" width="10" height="10">
                                        <path
                                            d="M2 8.5L6 12L14 3"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div v-if="desktop" class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Hardware Acceleration</span>
                                <small
                                    >For smoother animations (but uses more memory in the background). Requires a
                                    restart</small
                                >
                            </div>
                            <label class="toggle">
                                <input v-model="draft.hardwareAcceleration" type="checkbox" />
                                <span class="toggle-box">
                                    <svg class="toggle-check" viewBox="0 0 16 16" width="10" height="10">
                                        <path
                                            d="M2 8.5L6 12L14 3"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Monthly Sub Tracking</span>
                                <small>Choose when to reduce the remaining day count</small>
                            </div>
                        </div>

                        <div class="radio-group">
                            <label>
                                <input
                                    v-model="draft.monthlySubCheck"
                                    type="radio"
                                    name="monthlySubCheck"
                                    value="calendar"
                                />
                                Count each calendar day even when the app is closed
                            </label>

                            <label>
                                <input
                                    v-model="draft.monthlySubCheck"
                                    type="radio"
                                    name="monthlySubCheck"
                                    value="dailyTask"
                                />
                                Count a day only when its daily task is checked
                            </label>
                        </div>
                    </div>

                    <div v-if="desktop" class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Auto-complete dailies</span>
                                <small>Look for active game processes to automatically check daily tasks</small>
                            </div>
                            <label class="toggle">
                                <input v-model="draft.checkGachaProcesses" type="checkbox" />
                                <span class="toggle-box">
                                    <svg class="toggle-check" viewBox="0 0 16 16" width="10" height="10">
                                        <path
                                            d="M2 8.5L6 12L14 3"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div v-if="desktop" class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Cached assets</span>
                                <small>Remove downloaded images stored locally</small>
                            </div>
                            <button type="button" class="delete-cache-btn" @click="deleteCacheAssets()">
                                Delete cache
                            </button>
                        </div>
                    </div>

                    <div class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Accounts backup</span>
                                <small>Save your accounts to a file, or load them on another device or browser</small>
                            </div>
                            <div class="backup-actions">
                                <button type="button" class="backup-btn" @click="exportBackup">Export</button>
                                <button type="button" class="backup-btn" @click="importBackup">Import</button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-section">
                        <p class="settings-section-title">Account settings</p>
                        <p class="settings-section-desc">Configure automatic dailies and notifications per account</p>
                        <div class="game-groups">
                            <div v-for="game in accountsPerGame" :key="game.name" class="game-group">
                                <p class="game-group-title">{{ game.displayName ?? game.name }}</p>
                                <div class="account-grid">
                                    <div v-for="account in game.accounts" :key="account.id" class="account-chip-row">
                                        <span class="account-chip-label">{{
                                            account.label || account.uid || 'New Account'
                                        }}</span>
                                        <span v-if="account.server" class="account-chip-server">{{
                                            account.server
                                        }}</span>
                                        <div class="chip-toggles">
                                            <button
                                                v-if="!game.custom && (!desktop || draft.checkGachaProcesses)"
                                                type="button"
                                                class="text-toggle"
                                                :class="{
                                                    active: draft.automaticDailies[game.name]?.includes(account.id),
                                                }"
                                                :title="
                                                    desktop
                                                        ? 'Mark dailies done when the game is detected running'
                                                        : 'Only supported in the Windows app'
                                                "
                                                :disabled="!desktop"
                                                @click="toggleSetting(draft.automaticDailies, game.name, account.id)"
                                            >
                                                Auto
                                            </button>
                                            <button
                                                type="button"
                                                class="text-toggle"
                                                :class="{
                                                    active: draft.deadlineNotifications[game.name]?.includes(
                                                        account.id,
                                                    ),
                                                }"
                                                title="Notify when tasks are near their deadline"
                                                @click="
                                                    toggleSetting(draft.deadlineNotifications, game.name, account.id)
                                                "
                                            >
                                                Tasks
                                            </button>
                                            <button
                                                v-if="!game.custom"
                                                type="button"
                                                class="text-toggle"
                                                :class="{
                                                    active: draft.monthlySubNotifications[game.name]?.includes(
                                                        account.id,
                                                    ),
                                                }"
                                                title="Notify when the monthly sub is about to run out"
                                                @click="
                                                    toggleSetting(draft.monthlySubNotifications, game.name, account.id)
                                                "
                                            >
                                                Monthly Sub
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-footer">
                    <button class="cancel-btn" @click="closeSettings">Cancel</button>
                    <button class="apply-btn" @click="saveChanges">Apply changes</button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { ref, watch } from 'vue';
import platform from '#platform';
import { useNotification } from '../composables/useNotification.js';
import { useSettings } from '../composables/useSettings.js';
import { useAccounts } from '../composables/useAccounts.js';
import { useConfirm } from '../composables/useConfirm.js';

const { settings, showSettings, toggleSetting, saveSettings } = useSettings();
const { createNotification } = useNotification();
const { accountsPerGame, loadAccounts, exportAccounts, importAccounts } = useAccounts();
const { confirm } = useConfirm();
const desktop = platform.desktop;
const draft = ref(null);

watch(
    showSettings,
    (open) => {
        if (open) draft.value = JSON.parse(JSON.stringify(settings.value));
    },
    { immediate: true },
);

const closeSettings = () => {
    showSettings.value = false;
};

const saveChanges = async () => {
    const accelerationChanged = draft.value.hardwareAcceleration !== settings.value.hardwareAcceleration;
    const response = await saveSettings(false, draft.value);

    if (!response) return;

    showSettings.value = false;

    if (response.accountsChanged) await loadAccounts();

    if (
        accelerationChanged &&
        response.restartRequired &&
        (await confirm('Restart now to apply the hardware acceleration change?', {
            confirmText: 'Restart',
            cancelText: 'Later',
        }))
    ) {
        desktop.relaunch();
    }
};

const deleteCacheAssets = async () => {
    try {
        await desktop.clearImageCache();
        createNotification('success', 'Cache deleted!', 1000);
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2000);
    }
};

const exportBackup = async () => {
    try {
        if (await exportAccounts()) createNotification('success', 'Accounts exported!', 1500);
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2500);
    }
};

const importBackup = async () => {
    const ok = await confirm('Importing replaces all your current accounts with the ones in the file. Continue?', {
        confirmText: 'Import',
    });

    if (!ok) return;

    try {
        if (!(await importAccounts())) return;

        draft.value = JSON.parse(JSON.stringify(settings.value));
        createNotification('success', 'Accounts imported!', 1500);
    } catch (err) {
        createNotification('error', `Error: ${err.message}`, 2500);
    }
};
</script>

<style scoped>
.settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
}

.settings-modal {
    width: min(660px, 90vw);
    max-height: 82vh;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: var(--shadow-modal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 26px 32px 6px;
    flex-shrink: 0;
}

.settings-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
}

.settings-close {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted2);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}

.settings-close:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
}

.settings-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 32px 24px;
    display: flex;
    flex-direction: column;
}

.settings-body::-webkit-scrollbar {
    width: 8px;
}

.settings-body::-webkit-scrollbar-track {
    background: transparent;
}

.settings-body::-webkit-scrollbar-thumb {
    background: var(--border-hover);
    border-radius: 4px;
}

.settings-section--plain {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    padding: 18px 0;
}

.settings-section--plain:last-of-type {
    border-bottom: none;
}

.settings-section:not(.settings-section--plain) {
    padding-top: 22px;
}

.settings-section-title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}

.settings-section-desc {
    margin: 0 0 16px;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.55;
}

.settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
}

.settings-row-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.settings-row-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}

.settings-row-label small {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.5;
}

.toggle {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    cursor: pointer;
}

.toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
}

.toggle-box {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid var(--border-hover);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition:
        background 120ms,
        border-color 120ms,
        color 120ms;
}

.toggle input:checked + .toggle-box {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--check-fg);
}

.toggle-check {
    transform: scale(0.6);
    transition: transform 120ms;
}

.toggle input:checked + .toggle-box .toggle-check {
    transform: scale(1);
}

.game-groups {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.game-group-title {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
}

.account-grid {
    display: flex;
    flex-direction: column;
}

.account-chip-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.account-chip-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
}

.account-chip-server {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--font-mono);
}

.chip-toggles {
    margin-left: auto;
    display: flex;
    gap: 4px;
}

.text-toggle {
    padding: 3px 9px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}

.text-toggle:not(:disabled):hover {
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: var(--text);
}

.text-toggle.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text);
}

.text-toggle.active:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.text-toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.settings-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    padding: 12px 32px 24px;
    flex-shrink: 0;
}

.cancel-btn {
    padding: 8px 4px;
    border: 0;
    background: transparent;
    color: var(--muted2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 120ms ease;
}

.cancel-btn:hover {
    color: var(--text);
}

.apply-btn {
    padding: 9px 22px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--check-fg);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 120ms ease;
}

.apply-btn:hover {
    background: var(--accent-hover);
}

.delete-cache-btn,
.backup-btn {
    padding: 6px 14px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--muted2);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}

.delete-cache-btn {
    flex-shrink: 0;
}

.delete-cache-btn:hover {
    background: color-mix(in srgb, var(--urgent) 14%, transparent);
    color: var(--urgent);
}

.backup-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.backup-btn:hover {
    background: color-mix(in srgb, var(--text) 12%, transparent);
    color: var(--text);
}

.confirm-enter-active,
.confirm-leave-active {
    transition: opacity 120ms;
}

.confirm-enter-from,
.confirm-leave-to {
    opacity: 0;
}

.radio-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
}

.radio-group label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 12px;
    color: var(--text);
    line-height: 1.5;
    cursor: pointer;
}

.radio-group input {
    flex-shrink: 0;
    margin-top: 2px;
    accent-color: var(--accent);
}
</style>
