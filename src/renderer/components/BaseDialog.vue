<template>
    <dialog
        ref="dialog"
        class="base-dialog"
        :class="`base-dialog--${placement}`"
        :aria-labelledby="titleId"
        @cancel.prevent="close"
        @keydown.esc.stop
        @click="onDialogClick"
    >
        <form v-if="open" class="base-dialog-inner" @submit.prevent="submit">
            <div class="base-dialog-header">
                <h2 :id="titleId" class="base-dialog-title">{{ title }}</h2>
                <button type="button" class="base-dialog-close" aria-label="Close" @click="close">×</button>
            </div>

            <slot />

            <p v-if="error" class="base-dialog-error" role="alert">{{ error }}</p>

            <div class="base-dialog-actions">
                <button type="button" class="base-dialog-btn base-dialog-btn--cancel" @click="close">Cancel</button>
                <button type="submit" class="base-dialog-btn base-dialog-btn--confirm" :disabled="!canConfirm || busy">
                    {{ busy ? busyText : confirmText }}
                </button>
            </div>
        </form>
    </dialog>
</template>

<script setup>
import { nextTick, ref, useId, watch } from 'vue';

const props = defineProps({
    open: { type: Boolean, default: false },
    title: { type: String, required: true },
    placement: { type: String, default: 'center', validator: (value) => ['center', 'corner'].includes(value) },
    error: { type: String, default: null },
    confirmText: { type: String, default: 'Confirm' },
    busyText: { type: String, default: 'Saving…' },
    canConfirm: { type: Boolean, default: true },
    busy: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'submit', 'opened']);

const dialog = ref(null);
const titleId = useId();

watch(
    () => props.open,
    async (open) => {
        if (!open) {
            if (dialog.value?.open) dialog.value.close();
            return;
        }

        await nextTick();

        if (!dialog.value.open) dialog.value.showModal();
        emit('opened');
    },
);

const close = () => emit('close');

const submit = () => {
    if (props.canConfirm && !props.busy) emit('submit');
};

const onDialogClick = (event) => {
    if (event.target === dialog.value) close();
};
</script>

<style scoped>
.base-dialog {
    width: min(380px, calc(100vw - 32px));
    max-width: none;
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 1px solid var(--border-hover);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    box-shadow: var(--shadow-modal);
}

.base-dialog[open] {
    animation: base-dialog-in 200ms ease-out;
}

.base-dialog::backdrop {
    background: var(--overlay);
}

.base-dialog--corner {
    width: min(360px, calc(100vw - 32px));
    margin: 0;
    inset: auto 16px 16px auto;
}

.base-dialog--corner::backdrop {
    background: rgba(0, 0, 0, 0.35);
}

@keyframes base-dialog-in {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
}

.base-dialog-inner {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px 16px 20px;
}

.base-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.base-dialog-title {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.base-dialog-close {
    padding: 2px 4px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    transition: color 120ms;
}

.base-dialog-close:hover {
    color: var(--text);
}

.base-dialog-error {
    margin: 0;
    color: var(--urgent);
    font-size: 12px;
    line-height: 1.4;
}

.base-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.base-dialog-btn {
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}

.base-dialog-btn--cancel {
    border: 1px solid var(--border-hover);
    background: var(--panel-hover);
    color: var(--muted2);
}

.base-dialog-btn--cancel:hover {
    border-color: var(--border-selected);
    color: var(--text);
}

.base-dialog-btn--confirm {
    border: 1px solid var(--accent);
    background: var(--panel-selected);
    color: var(--accent);
}

.base-dialog-btn--confirm:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
}

.base-dialog-btn--confirm:disabled {
    cursor: default;
    opacity: 0.4;
}

@media (max-width: 480px) {
    .base-dialog--corner {
        width: 100%;
        inset: auto 0 0 0;
        border-radius: 10px 10px 0 0;
    }
}
</style>

<style>
.dialog-fieldset {
    margin: 0;
    padding: 0;
    border: 0;
}

.dialog-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
}

.dialog-text {
    margin: 0;
    color: var(--muted2);
    font-size: 13px;
    line-height: 1.5;
}

.dialog-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-hover);
    border-radius: 6px;
    background: var(--panel);
    color: var(--text);
    font-size: 12px;
    font-weight: 400;
}

.dialog-input:focus {
    border-color: var(--accent);
    outline: none;
}
</style>
