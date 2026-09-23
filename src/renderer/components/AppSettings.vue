<template>
    <Transition name="confirm">
        <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
            <div class="settings-modal">

                <div class="settings-header">
                    <h1 class="settings-title">Settings</h1>
                    <button class="settings-close" @click="showSettings = false" aria-label="Close">×</button>
                </div>

                <div class="settings-body">

                    <div class="settings-section settings-section--plain">
                        <div class="settings-row">
                            <div class="settings-row-label">
                                <span class="settings-row-title">Automation</span>
                                <small>Look for active game processes to automatically check daily tasks</small>
                            </div>
                            <label class="toggle">
                                <input type="checkbox" v-model="settings.checkGachaProcesses">
                                <span class="toggle-box">
                                    <svg class="toggle-check" viewBox="0 0 16 16" width="10" height="10">
                                        <path d="M2 8.5L6 12L14 3" fill="none" stroke="currentColor" stroke-width="2.2"
                                            stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="settings-section settings-section--plain">
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

                    <div class="settings-section">
                        <p class="settings-section-title">Account settings</p>
                        <p class="settings-section-desc">Configure automatic dailies and notifications per account</p>
                        <div class="game-groups">
                            <div v-for="game in props.accountsPerGame" :key="game.name" class="game-group">
                                <p class="game-group-title">{{ game.name }}</p>
                                <div class="account-grid">
                                    <div v-for="account in game.accounts" :key="account.id" class="account-chip-row">
                                        <span class="account-chip-label">{{ account.label || account.uid }}</span>
                                        <span class="account-chip-server">{{ account.server }}</span>
                                        <div class="chip-toggles">
                                            <button type="button" class="text-toggle"
                                                :class="{ active: settings.automaticDailies[game.name]?.includes(account.id) }"
                                                v-if="settings.checkGachaProcesses"
                                                @click="toggleSetting(settings.automaticDailies, game.name, account.id)">
                                                Auto
                                            </button>
                                            <button type="button" class="text-toggle"
                                                :class="{ active: settings.windowsNotifications[game.name]?.includes(account.id) }"
                                                @click="toggleSetting(settings.windowsNotifications, game.name, account.id)">
                                                Notify
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div class="settings-footer">
                    <button class="cancel-btn" @click="showSettings = false">Cancel</button>
                    <button class="apply-btn" @click="saveChanges">Apply changes</button>
                </div>

            </div>
        </div>
    </Transition>
</template>

<script setup>
import { useSettings } from '../composables/useSettings.js'

const { settings, showSettings, toggleSetting, saveSettings } = useSettings()

const props = defineProps({
    accountsPerGame: {
        type: Array,
        default: () => []
    }
})

const saveChanges = async () => {
    await saveSettings();
    showSettings.value = !showSettings.value
}

const deleteCacheAssets = async () => {
    try {
        const response = await window.api.deleteCacheAssets()
        if (response.success) {
            createNotification('success', 'Cache deleted!', 1000)
        } else {
            createNotification('error', `Error: ${response.error || 'Unknown error'}`, 2000)
        }
    } catch (err) {
        createNotification('error', `Critical Error: ${err.message}`, 2000)
    }
}
</script>

<style scoped>
.settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
}

.settings-modal {
    width: min(660px, 90vw);
    max-height: 82vh;
    border-radius: 10px;
    border: 1px solid var(--border-hover);
    background: var(--bg);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 28px 18px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.settings-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
}

.settings-close {
    border: none;
    background: transparent;
    color: var(--muted2);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 6px;
    transition: color 0.15s;
}

.settings-close:hover {
    color: var(--text);
}

.settings-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 28px 20px;
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
    border-bottom: 1px solid var(--border);
    padding: 16px 2px;
}

.settings-section--plain:last-of-type {
    border-bottom: none;
}

.settings-section {
    padding-top: 22px;
}

.settings-section:not(.settings-section--plain) {
    background: var(--card-solid);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
    margin-top: 14px;
}

.settings-section-title {
    margin: 0 0 4px;
    font-size: 14px;
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
    font-size: 14px;
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
    border-radius: 5px;
    border: 1.5px solid var(--border-hover);
    background: var(--task-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: background 0.15s, border-color 0.15s, color 0.1s;
}

.toggle input:checked+.toggle-box {
    background: var(--accent);
    border-color: var(--accent);
    color: #000;
}

.toggle-check {
    transform: scale(0.6);
    transition: transform 0.15s;
}

.toggle input:checked+.toggle-box .toggle-check {
    transform: scale(1);
}

.game-groups {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.game-group-title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted2);
}

.account-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}

.account-chip-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--task-bg);
    width: 100%;
    transition: border-color 0.15s;
}

.account-chip-row:hover {
    border-color: var(--border-hover);
}

.account-chip-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
}

.account-chip-server {
    font-size: 11px;
    color: var(--muted);
    font-family: 'Space Mono', monospace;
}

.chip-toggles {
    margin-left: auto;
    display: flex;
    gap: 14px;
}

.text-toggle {
    border: none;
    background: none;
    padding: 2px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted2);
    cursor: pointer;
    border-bottom: 1.5px solid transparent;
    transition: color 0.15s, border-color 0.15s;
}

.text-toggle:hover {
    color: var(--text);
}

.text-toggle.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
}

.settings-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 14px 28px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.cancel-btn {
    padding: 8px 18px;
    border-radius: 6px;
    border: 1px solid var(--border-hover);
    background: transparent;
    color: var(--muted2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}

.cancel-btn:hover {
    background: var(--panel-hover);
    color: var(--text);
}

.apply-btn {
    padding: 8px 20px;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: var(--accent-glow);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
}

.apply-btn:hover {
    background: var(--accent);
    color: #000;
}

.delete-cache-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-hover);
    background: var(--task-bg);
    color: var(--muted2);
    font-family: 'Sora', sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
}

.delete-cache-btn:hover {
    border-color: var(--urgent);
    background: color-mix(in srgb, var(--urgent) 12%, transparent);
    color: var(--urgent);
}

.confirm-enter-active,
.confirm-leave-active {
    transition: opacity 0.18s, transform 0.18s;
}

.confirm-enter-from,
.confirm-leave-to {
    opacity: 0;
    transform: scale(0.98) translateY(4px);
}
</style>