<template>
    <Transition name="confirm">
        <div v-if="confirmState" class="confirm-overlay" @click.self="confirmState.onCancel()">
            <div class="confirm-dialog">
                <p class="confirm-message">{{ confirmState.message }}</p>
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-btn--cancel" @click="confirmState.onCancel()">
                        {{ confirmState.cancelText }}
                    </button>
                    <button class="confirm-btn confirm-btn--danger" @click="confirmState.onConfirm()">
                        {{ confirmState.confirmText }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { useConfirm } from '../composables/useConfirm.js';
const { confirmState } = useConfirm();
</script>

<style scoped>
.confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
}

.confirm-dialog {
    background: var(--card-solid);
    border: 1px solid var(--border-hover);
    border-radius: 14px;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 300px;
    max-width: 400px;
    box-shadow: var(--shadow-modal);
}

.confirm-message {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    line-height: 1.5;
}

.confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.confirm-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    cursor: pointer;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}

.confirm-btn--cancel {
    background: var(--panel-hover);
    border: 1px solid var(--border-hover);
    color: var(--muted2);
}

.confirm-btn--cancel:hover {
    border-color: var(--border-selected);
    color: var(--text);
}

.confirm-btn--danger {
    background: color-mix(in srgb, var(--danger) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
    color: color-mix(in srgb, var(--danger) 55%, transparent);
}

.confirm-btn--danger:hover {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    border-color: color-mix(in srgb, var(--danger) 45%, transparent);
    color: var(--danger);
}

.confirm-enter-active,
.confirm-leave-active {
    transition: opacity 120ms;
}

.confirm-enter-from,
.confirm-leave-to {
    opacity: 0;
}
</style>
