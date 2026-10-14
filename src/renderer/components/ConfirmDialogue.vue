<template>
    <Transition name="confirm">
        <div v-if="confirmState" class="confirm-overlay" @click.self="confirmState.onCancel()">
            <div class="confirm-dialog">
                <p class="confirm-message">{{ confirmState.message }}</p>
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-btn--cancel" @click="confirmState.onCancel()">Cancel</button>
                    <button class="confirm-btn confirm-btn--danger" @click="confirmState.onConfirm()">{{ confirmState.confirmText }}</button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { useConfirm } from '../composables/useConfirm.js'
const { confirmState } = useConfirm()
</script>

<style scoped>
.confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
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
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
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
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    font-family: 'Space Mono', monospace;
    cursor: pointer;
    transition: all 0.15s;
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
    background: rgba(248, 113, 113, 0.07);
    border: 1px solid rgba(248, 113, 113, 0.18);
    color: rgba(248, 113, 113, 0.55);
}

.confirm-btn--danger:hover {
    background: rgba(248, 113, 113, 0.14);
    border-color: rgba(248, 113, 113, 0.45);
    color: var(--urgent);
}

.confirm-enter-active,
.confirm-leave-active {
    transition: all 0.2s ease;
}

.confirm-enter-from,
.confirm-leave-to {
    opacity: 0;
}

.confirm-enter-from .confirm-dialog,
.confirm-leave-to .confirm-dialog {
    transform: scale(0.96) translateY(6px);
}
</style>