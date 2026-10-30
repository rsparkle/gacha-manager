<template>
    <dialog
        ref="dialog"
        class="report"
        aria-labelledby="report-title"
        @cancel.prevent="close"
        @keydown.esc.stop
        @click="onDialogClick"
    >
        <form v-if="report" class="report-inner" @submit.prevent="submit">
            <div class="report-header">
                <h2 id="report-title" class="report-title">Report a problem</h2>
                <button type="button" class="report-close" aria-label="Close" @click="close">×</button>
            </div>

            <div class="report-context">
                <span class="report-game" :style="{ '--game-color': gameColor }">{{ gameAbbr }}</span>
                <span v-if="report.targetLabel" class="report-target">{{ report.targetLabel }}</span>
                <span v-if="report.server" class="report-server">{{ report.server }}</span>
            </div>

            <p v-if="isCode" class="report-text">Mark this code as expired or not working?</p>

            <template v-else>
                <label v-if="pickTarget" class="report-label">
                    Task
                    <select v-model="targetId" class="report-input" required>
                        <option value="" disabled>Choose a task</option>
                        <optgroup v-for="group in targetGroups" :key="group.name" :label="group.name">
                            <option v-for="target in group.targets" :key="target.id" :value="target.id">
                                {{ target.label }}
                            </option>
                        </optgroup>
                    </select>
                </label>

                <fieldset class="report-fieldset">
                    <legend class="report-label">What's wrong?</legend>
                    <div class="report-options">
                        <label
                            v-for="option in fields"
                            :key="option"
                            class="report-option"
                            :class="{ active: field === option }"
                        >
                            <input v-model="field" type="radio" name="report-field" :value="option" />
                            {{ FIELD_LABELS[option] }}
                        </label>
                    </div>
                </fieldset>

                <label class="report-label">
                    <span>Correct value <span class="report-optional">optional</span></span>
                    <textarea
                        v-model="comment"
                        class="report-input report-textarea"
                        rows="3"
                        maxlength="1000"
                        :placeholder="PLACEHOLDERS[field] ?? 'Anything that helps'"
                    />
                </label>
            </template>

            <p v-if="error" class="report-error" role="alert">{{ error }}</p>

            <div class="report-actions">
                <button type="button" class="report-btn report-btn--cancel" @click="close">Cancel</button>
                <button type="submit" class="report-btn report-btn--send" :disabled="!canSend || sending">
                    {{ sending ? 'Sending…' : 'Send' }}
                </button>
            </div>
        </form>
    </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { REPORT_FIELDS, useReport } from '../composables/useReport.js';
import { useAccounts } from '../composables/useAccounts.js';
import { useNotification } from '../composables/useNotification.js';

const FIELD_LABELS = {
    expired: 'Expired',
    name: 'Name',
    deadline: 'Deadline',
    category: 'Category',
    date: 'Date',
};

const PLACEHOLDERS = {
    name: 'What should it be called?',
    deadline: 'When does it actually reset or end?',
    category: 'Which category should it be in?',
    date: "What's the correct date?",
};

const ERRORS = {
    cooldown: 'Wait a few seconds before sending another report.',
    rate_limited: 'Too many reports right now, try again in a minute.',
    busy: 'Too many reports right now, try again in a minute.',
    invalid: "Something's off with this report, so it couldn't be sent.",
    network: "Couldn't send the report. Check your connection and try again.",
};

const { reportState: report, closeReport, sendReport } = useReport();
const { gameConfig } = useAccounts();
const { createNotification } = useNotification();

const dialog = ref(null);
const targetId = ref('');
const field = ref(null);
const comment = ref('');
const sending = ref(false);
const error = ref(null);

const isCode = computed(() => report.value?.topic === 'codes');
const fields = computed(() => REPORT_FIELDS[report.value?.topic] ?? []);
const pickTarget = computed(() => !report.value?.targetId && report.value?.targets?.length > 0);

const gameData = computed(() => gameConfig.value?.[report.value?.game]);
const gameAbbr = computed(() => gameData.value?.abbr ?? report.value?.game);
const gameColor = computed(() => gameData.value?.color ?? 'var(--accent)');

const targetGroups = computed(() => {
    const groups = new Map();

    for (const target of report.value?.targets ?? []) {
        const name = target.group ?? 'Tasks';

        if (!groups.has(name)) groups.set(name, { name, targets: [] });
        groups.get(name).targets.push(target);
    }

    return [...groups.values()];
});

const targetLabel = computed(
    () =>
        report.value?.targetLabel ?? report.value?.targets?.find((target) => target.id === targetId.value)?.label ?? '',
);

const canSend = computed(() => Boolean(targetId.value && field.value));

watch(report, async (value) => {
    if (!value) {
        if (dialog.value?.open) dialog.value.close();
        return;
    }

    const options = REPORT_FIELDS[value.topic] ?? [];

    targetId.value = value.targetId ?? '';
    field.value = options.length === 1 ? options[0] : null;
    comment.value = '';
    error.value = null;

    await nextTick();

    if (!dialog.value.open) dialog.value.showModal();
});

const close = () => closeReport();

const onDialogClick = (event) => {
    if (event.target === dialog.value) close();
};

const submit = async () => {
    if (!canSend.value || sending.value) return;

    sending.value = true;
    error.value = null;

    const result = await sendReport({
        game: report.value.game,
        topic: report.value.topic,
        targetId: targetId.value,
        targetLabel: targetLabel.value,
        field: field.value,
        server: report.value.server ?? '',
        comment: comment.value.trim(),
    });

    sending.value = false;

    if (result.ok) {
        close();
        createNotification('success', 'Thanks for the report!', 2000);
        return;
    }

    error.value = ERRORS[result.error] ?? ERRORS.network;
};
</script>

<style scoped>
.report {
    width: min(360px, calc(100vw - 32px));
    max-width: none;
    max-height: calc(100vh - 32px);
    margin: 0;
    inset: auto 16px 16px auto;
    padding: 0;
    border: 1px solid var(--border-hover);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.report[open] {
    animation: report-in 0.16s ease-out;
}

.report::backdrop {
    background: rgba(0, 0, 0, 0.35);
}

@keyframes report-in {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
}

.report-inner {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px 16px 20px;
}

.report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.report-title {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
}

.report-close {
    padding: 2px 4px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    transition: color 0.15s;
}

.report-close:hover {
    color: var(--text);
}

.report-context {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.report-game {
    flex-shrink: 0;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--game-color) 55%, var(--border));
    border-radius: 5px;
    color: var(--game-color);
    font-family: 'Space Mono', monospace;
    font-size: 10px;
    font-weight: 700;
}

.report-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.report-server {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 11px;
}

.report-text {
    margin: 0;
    color: var(--muted2);
    font-size: 13px;
    line-height: 1.5;
}

.report-fieldset {
    margin: 0;
    padding: 0;
    border: 0;
}

.report-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
}

.report-optional {
    color: var(--muted);
    font-weight: 400;
    opacity: 0.7;
}

.report-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}

.report-option {
    position: relative;
    padding: 5px 11px;
    border: 1px solid var(--border-hover);
    border-radius: 6px;
    background: var(--panel);
    color: var(--muted2);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}

.report-option:hover {
    background: var(--panel-hover);
    color: var(--text);
}

.report-option.active {
    background: var(--panel-selected);
    border-color: var(--accent);
    color: var(--accent);
}

.report-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
}

.report-option:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

.report-input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 9px;
    border: 1px solid var(--border-hover);
    border-radius: 6px;
    background: var(--panel);
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    font-weight: 400;
}

.report-input:focus {
    border-color: var(--accent);
    outline: none;
}

.report-textarea {
    min-height: 64px;
    resize: vertical;
}

.report-error {
    margin: 0;
    color: var(--urgent);
    font-size: 12px;
    line-height: 1.4;
}

.report-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.report-btn {
    padding: 7px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.15s;
}

.report-btn--cancel {
    border: 1px solid var(--border-hover);
    background: var(--panel-hover);
    color: var(--muted2);
}

.report-btn--cancel:hover {
    border-color: var(--border-selected);
    color: var(--text);
}

.report-btn--send {
    border: 1px solid var(--accent);
    background: var(--panel-selected);
    color: var(--accent);
}

.report-btn--send:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
}

.report-btn--send:disabled {
    cursor: default;
    opacity: 0.4;
}

@media (max-width: 480px) {
    .report {
        width: 100%;
        max-width: 100%;
        inset: auto 0 0 0;
        border-radius: 10px 10px 0 0;
    }
}
</style>
