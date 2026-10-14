<template>
    <div class="notif-center" aria-live="polite">
        <TransitionGroup name="notif">
            <div
                v-for="notif in notifications"
                :key="notif.id"
                class="notif"
                :class="[`notif--${notif.type}`, { 'notif--exiting': notif.exiting }]"
                @click="deleteNotification(notif.id)"
            >
                <img
                    v-if="notif.icon"
                    class="notif-icon notif-icon--img"
                    :src="notif.icon"
                    :alt="notif.type"
                    @error="notif.icon = null"
                />
                <span v-else class="notif-icon">{{ icons[notif.type] }}</span>
                <p class="notif-message">{{ notif.message }}</p>
                <div
                    v-if="notif.duration > 0"
                    class="notif-progress"
                    :style="{
                        animationDuration: `${notif.duration}ms`,
                        animationDelay: `-${Date.now() - notif.createdAt}ms`,
                    }"
                ></div>
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup>
import { useNotification } from '../composables/useNotification.js';

const { notifications, deleteNotification } = useNotification();

const icons = {
    success: '✓',
    error: '✕',
    waiting: '◌',
};
</script>

<style scoped>
.notif-center {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 9999;
    pointer-events: none;
    width: max-content;
    max-width: min(420px, 90vw);
}

.notif {
    pointer-events: all;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 16px;
    border-radius: 10px;
    min-width: 260px;
    max-width: 420px;
    position: relative;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.45;
    font-weight: 500;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--notif-border);
    background: var(--notif-bg);
    color: var(--notif-text);
    box-shadow:
        0 4px 24px var(--notif-shadow),
        0 1px 0 rgba(255, 255, 255, 0.04) inset;
}

.notif-icon {
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
    margin-top: 1px;
    opacity: 0.9;
}

.notif-icon--img {
    width: 46px;
    height: 46px;
    object-fit: contain;
    flex-shrink: 0;
    margin-top: -2px;
    font-size: unset;
    font-weight: unset;
    opacity: 1;
}

.notif-message {
    margin: 0;
    flex: 1;
    align-self: center;
}

.notif-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    width: 100%;
    background: var(--notif-progress);
    transform-origin: left;
    animation: notifShrink linear forwards;
}

@keyframes notifShrink {
    from {
        transform: scaleX(1);
    }

    to {
        transform: scaleX(0);
    }
}

.notif--success {
    --notif-bg: rgba(16, 38, 26, 0.88);
    --notif-border: rgba(34, 197, 94, 0.3);
    --notif-text: #86efac;
    --notif-shadow: rgba(34, 197, 94, 0.12);
    --notif-progress: rgba(34, 197, 94, 0.6);
}

.notif--error {
    --notif-bg: rgba(38, 10, 10, 0.88);
    --notif-border: rgba(248, 113, 113, 0.3);
    --notif-text: #fca5a5;
    --notif-shadow: rgba(248, 113, 113, 0.12);
    --notif-progress: rgba(248, 113, 113, 0.6);
}

.notif--waiting {
    --notif-bg: rgba(34, 24, 8, 0.88);
    --notif-border: rgba(251, 191, 36, 0.28);
    --notif-text: #fcd34d;
    --notif-shadow: rgba(251, 191, 36, 0.1);
    --notif-progress: rgba(251, 191, 36, 0.55);
}

.notif--waiting .notif-icon:not(.notif-icon--img) {
    animation: notifSpin 1s linear infinite;
    display: inline-block;
}

@keyframes notifSpin {
    to {
        transform: rotate(360deg);
    }
}

.notif-enter-active {
    transition: all 0.28s cubic-bezier(0.34, 1.5, 0.64, 1);
}

.notif-leave-active {
    transition: all 0.3s ease;
    pointer-events: none;
}

.notif-enter-from {
    opacity: 0;
    transform: translateY(-12px) scale(0.96);
}

.notif-leave-to {
    opacity: 0;
    transform: translateY(-8px) scale(0.97);
}

.notif-move {
    transition: transform 0.28s ease;
}
</style>
