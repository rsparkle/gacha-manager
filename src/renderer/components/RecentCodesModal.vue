<template>
    <Transition name="codes">
        <div v-if="open" class="codes-overlay" @click.self="close">
            <div class="codes-modal" role="dialog" aria-labelledby="codes-title">
                <div class="codes-header">
                    <h2 id="codes-title" class="codes-title">Recent Codes</h2>
                    <button class="codes-close" aria-label="Close" @click="close">×</button>
                </div>

                <nav class="codes-tabs">
                    <button
                        v-for="tab in games"
                        :key="tab.name"
                        class="codes-tab"
                        :class="{ active: selectedGame === tab.name, empty: tab.codes.length === 0 }"
                        :style="{ '--game-color': tab.color }"
                        :title="tab.name"
                        @click="selectedGame = tab.name"
                    >
                        <img v-if="icons[tab.name]" class="codes-tab-icon" :src="icons[tab.name]" :alt="tab.abbr" />
                        <span v-else class="codes-tab-fallback">{{ tab.abbr }}</span>
                    </button>
                </nav>

                <ul v-if="codes.length > 0" class="codes-list">
                    <li v-for="entry in codes" :key="entry.code" class="code-row">
                        <span class="code-value">{{ entry.code }}</span>
                        <span v-if="entry.deadline" class="code-deadline" :class="{ soon: isSoon(entry.deadline) }">
                            {{ timeLeft(entry.deadline) }}
                        </span>
                        <div class="code-actions">
                            <ReportFlag
                                :context="{
                                    game: selectedGame,
                                    topic: 'codes',
                                    targetId: entry.code,
                                    targetLabel: entry.code,
                                }"
                            />
                            <button
                                class="code-icon"
                                :class="{ done: copiedCode === entry.code }"
                                :title="copiedCode === entry.code ? 'Copied' : 'Copy code'"
                                @click="copyCode(entry.code)"
                            >
                                <svg
                                    v-if="copiedCode === entry.code"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.4"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <svg
                                    v-else
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            </button>
                            <a
                                v-if="redeemUrl(entry.code)"
                                class="code-icon"
                                :href="redeemUrl(entry.code)"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Redeem on the website"
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
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                            </a>
                        </div>
                    </li>
                </ul>

                <p v-else class="codes-empty">Nothing to redeem right now</p>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import platform from '#platform';
import ReportFlag from './ReportFlag.vue';
import { useAccounts } from '../composables/useAccounts.js';
import { useNotification } from '../composables/useNotification.js';
import { formatCountdown, slugify } from '../../shared/format.js';

const SOON_MS = 86_400_000;

const props = defineProps({
    open: { type: Boolean, default: false },
    game: { type: String, default: null },
});

const emit = defineEmits(['close']);

const { gameConfig } = useAccounts();
const { createNotification } = useNotification();

const selectedGame = ref(null);
const now = ref(Date.now());
const copiedCode = ref(null);
const icons = ref({});
let copiedTimeout;

const activeCodes = (config) =>
    (config?.active_codes ?? []).filter((entry) => !entry.deadline || Date.parse(entry.deadline) > now.value);

const games = computed(() =>
    Object.entries(gameConfig.value ?? {}).map(([name, config]) => ({
        name,
        abbr: config.abbr ?? name,
        color: config.color ?? 'var(--accent)',
        codes: activeCodes(config),
    })),
);

const selected = computed(() => games.value.find((game) => game.name === selectedGame.value));

const codes = computed(() => selected.value?.codes ?? []);

const loadIcons = () =>
    Promise.all(
        games.value
            .filter((game) => !icons.value[game.name])
            .map(async (game) => {
                const url = await platform.images.getUrl(`games/${slugify(game.name)}_icon.webp`);

                if (url) icons.value[game.name] = url;
            }),
    );

const close = () => emit('close');

const onKeydown = (event) => {
    if (event.key === 'Escape') close();
};

watch(
    () => props.open,
    (open) => {
        if (open) {
            now.value = Date.now();
            selectedGame.value = games.value.some((game) => game.name === props.game)
                ? props.game
                : games.value[0]?.name;
            document.addEventListener('keydown', onKeydown);
            loadIcons();
        } else {
            document.removeEventListener('keydown', onKeydown);
        }
    },
    { immediate: true },
);

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    clearTimeout(copiedTimeout);
});

const timeLeft = (deadline) => `${formatCountdown(Date.parse(deadline) - now.value)} left`;

const isSoon = (deadline) => Date.parse(deadline) - now.value < SOON_MS;

const redeemUrl = (code) => {
    const url = gameConfig.value?.[selectedGame.value]?.redemption_codes_url;

    return url ? url.replace('{code}', encodeURIComponent(code)) : null;
};

const copyCode = async (code) => {
    try {
        await navigator.clipboard.writeText(code);
    } catch {
        createNotification('error', "Couldn't copy the code", 2000);
        return;
    }

    copiedCode.value = code;
    clearTimeout(copiedTimeout);
    copiedTimeout = setTimeout(() => {
        copiedCode.value = null;
    }, 1500);
};
</script>

<style scoped>
.codes-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
}

.codes-modal {
    display: flex;
    flex-direction: column;
    width: min(400px, 90vw);
    max-height: 80vh;
    border: 1px solid var(--border-hover);
    border-radius: 10px;
    background: var(--bg);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.codes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 2px 20px;
}

.codes-title {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
}

.codes-close {
    padding: 2px 4px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    transition: color 0.15s;
}

.codes-close:hover {
    color: var(--text);
}

.codes-tabs {
    display: flex;
    gap: 2px;
    padding: 4px 14px 0;
    border-bottom: 1px solid var(--border);
}

.codes-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: -1px;
    padding: 8px 6px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: border-color 120ms ease;
}

.codes-tab-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    object-fit: cover;
    opacity: 0.7;
    transition:
        opacity 120ms ease,
        filter 120ms ease;
}

.codes-tab-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    color: var(--muted2);
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    font-weight: 700;
}

.codes-tab:hover .codes-tab-icon {
    opacity: 1;
}

.codes-tab.empty .codes-tab-icon {
    filter: grayscale(1);
    opacity: 0.35;
}

.codes-tab.active {
    border-bottom-color: var(--game-color);
}

.codes-tab.active .codes-tab-icon {
    filter: none;
    opacity: 1;
}

.codes-list {
    margin: 0;
    padding: 8px;
    overflow-y: auto;
    list-style: none;
}

.code-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 12px;
    border-radius: 6px;
    transition: background-color 120ms ease;
}

.code-row:hover {
    background: var(--panel-hover);
}

.code-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-family: 'Space Mono', monospace;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.code-deadline {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 11px;
}

.code-deadline.soon {
    color: var(--urgent);
}

.code-actions {
    display: flex;
    flex-shrink: 0;
}

.code-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color 120ms ease;
}

.code-icon:hover {
    color: var(--text);
}

.code-icon.done {
    color: var(--accent);
}

.code-icon:focus-visible,
.codes-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}

.codes-empty {
    margin: 0;
    padding: 28px 20px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
}

.codes-enter-active,
.codes-leave-active {
    transition: opacity 0.12s;
}

.codes-enter-from,
.codes-leave-to {
    opacity: 0;
}
</style>
