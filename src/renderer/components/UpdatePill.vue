<template>
    <Transition name="update-pill">
        <div v-if="visible" class="update-pill">
            <div class="update-pill-body">
                <p class="update-pill-title">{{ title }}</p>
                <p v-if="state.notes && state.status !== 'downloading'" class="update-pill-notes">
                    {{ state.notes }}
                </p>
                <p v-if="state.failed" class="update-pill-error">Download failed. Try again.</p>
                <div v-if="state.status === 'downloading'" class="update-pill-progress">
                    <div class="update-pill-progress-bar" :style="{ width: `${state.percent}%` }"></div>
                </div>
            </div>

            <div class="update-pill-actions">
                <button v-if="state.status === 'available'" class="update-pill-btn" @click="download">Update</button>
                <button v-if="state.status === 'ready'" class="update-pill-btn" @click="install">Restart</button>
                <button v-if="needsManualDownload" class="update-pill-btn" @click="openReleases">Download</button>
                <button class="update-pill-close" aria-label="Dismiss" @click="dismiss">×</button>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import platform from '#platform';

const updates = platform.desktop.updates;
const state = ref({ status: 'idle' });
let stopListener = null;

const needsManualDownload = computed(() => state.value.required && state.value.status === 'idle');

const visible = computed(() => {
    const { status, auto, dismissed, required } = state.value;

    if (dismissed) return false;
    if (required) return true;
    if (status === 'available' || status === 'ready') return true;

    return status === 'downloading' && !auto;
});

const title = computed(() => {
    const { status, version, percent, required } = state.value;

    if (status === 'downloading') return `Downloading ${version}… ${percent}%`;
    if (status === 'ready') return `Version ${version} is ready`;
    if (required) return 'This version is no longer supported, please update';

    return `Version ${version} is available`;
});

const openReleases = () => updates.openReleasesPage();
const download = () => updates.download();
const install = () => updates.install();
const dismiss = () => updates.dismiss();

onMounted(async () => {
    stopListener = updates.onState((next) => {
        state.value = next;
    });

    state.value = await updates.getState();
});

onUnmounted(() => {
    if (stopListener) stopListener();
});
</script>

<style scoped>
.update-pill {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 200;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    width: 320px;
    padding: 12px 12px 12px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.update-pill-body {
    flex: 1;
    min-width: 0;
}

.update-pill-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}

.update-pill-notes {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted2);
}

.update-pill-error {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--danger);
}

.update-pill-progress {
    height: 3px;
    margin-top: 10px;
    border-radius: 2px;
    background: var(--border);
    overflow: hidden;
}

.update-pill-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
}

.update-pill-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.update-pill-btn {
    padding: 5px 12px;
    border: 0;
    border-radius: 6px;
    background: var(--accent);
    color: var(--check-fg);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.update-pill-btn:hover {
    background: var(--accent-hover);
}

.update-pill-close {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}

.update-pill-close:hover {
    background: var(--panel-hover);
    color: var(--text);
}

.update-pill-enter-active,
.update-pill-leave-active {
    transition:
        opacity 200ms ease,
        transform 200ms ease;
}

.update-pill-enter-from,
.update-pill-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
