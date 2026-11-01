<template>
    <BaseDialog
        :open="Boolean(context)"
        title="Report a problem"
        placement="corner"
        :error="error"
        confirm-text="Send"
        busy-text="Sending…"
        :can-confirm="canSend"
        :busy="sending"
        @close="close"
        @submit="submit"
    >
        <div class="report-context">
            <span class="report-game" :style="{ '--game-color': gameColor }">{{ gameAbbr }}</span>
            <span v-if="context.targetLabel" class="report-target">{{ context.targetLabel }}</span>
            <span v-if="context.server" class="report-server">{{ context.server }}</span>
        </div>

        <p v-if="isCode" class="dialog-text">Mark this code as expired or not working?</p>

        <template v-else>
            <label v-if="pickTarget" class="dialog-label">
                Task
                <select v-model="targetId" class="dialog-input" required>
                    <option value="" disabled>Choose a task</option>
                    <optgroup v-for="group in targetGroups" :key="group.name" :label="group.name">
                        <option v-for="target in group.targets" :key="target.id" :value="target.id">
                            {{ target.label }}
                        </option>
                    </optgroup>
                </select>
            </label>

            <fieldset class="dialog-fieldset">
                <legend class="dialog-label">What's wrong?</legend>
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

            <label class="dialog-label">
                <span>Comment <span v-if="targetId !== NOT_LISTED_TARGET" class="report-optional">optional</span></span>
                <textarea
                    v-model="comment"
                    class="dialog-input report-textarea"
                    rows="3"
                    maxlength="1000"
                    :placeholder="PLACEHOLDERS[field] ?? 'Anything that helps'"
                />
            </label>
        </template>
    </BaseDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import { NOT_LISTED_TARGET, canSendReport, reportFields, useReport } from '../composables/useReport.js';
import { useAccounts } from '../composables/useAccounts.js';
import { useNotification } from '../composables/useNotification.js';

const FIELD_LABELS = {
    expired: 'Expired',
    name: 'Name',
    deadline: 'Deadline',
    category: 'Category',
    date: 'Date',
    missing: 'Missing task',
    other: 'Something else',
};

const PLACEHOLDERS = {
    name: 'What should it be called?',
    deadline: 'When does it actually reset or end?',
    category: 'Which category should it be in?',
    date: "What's the correct date?",
    missing: 'Which task is missing, and when does it reset?',
    other: 'Describe the problem',
};

const ERRORS = {
    cooldown: 'Wait a few seconds before sending another report.',
    rate_limited: 'Too many reports right now, try again in a minute.',
    busy: 'Too many reports right now, try again in a minute.',
    invalid: "Something's off with this report, so it couldn't be sent.",
    network: "Couldn't send the report. Check your connection and try again.",
};

const { reportState: context, closeReport, sendReport } = useReport();
const { gameConfig } = useAccounts();
const { createNotification } = useNotification();

const targetId = ref('');
const field = ref(null);
const comment = ref('');
const sending = ref(false);
const error = ref(null);

const isCode = computed(() => context.value?.topic === 'codes');
const fields = computed(() => reportFields(context.value?.topic, targetId.value));
const pickTarget = computed(() => !context.value?.targetId && context.value?.targets?.length > 0);

const gameData = computed(() => gameConfig.value?.[context.value?.game]);
const gameAbbr = computed(() => gameData.value?.abbr ?? context.value?.game);
const gameColor = computed(() => gameData.value?.color ?? 'var(--accent)');

const targetGroups = computed(() => {
    const groups = new Map();

    for (const target of context.value?.targets ?? []) {
        const name = target.group ?? 'Tasks';

        if (!groups.has(name)) groups.set(name, { name, targets: [] });
        groups.get(name).targets.push(target);
    }

    return [...groups.values()];
});

const targetLabel = computed(
    () =>
        context.value?.targetLabel ??
        context.value?.targets?.find((target) => target.id === targetId.value)?.label ??
        '',
);

const canSend = computed(() => canSendReport({ targetId: targetId.value, field: field.value, comment: comment.value }));

watch(context, (value) => {
    if (!value) return;

    const options = reportFields(value.topic, value.targetId);

    targetId.value = value.targetId ?? '';
    field.value = options.length === 1 ? options[0] : null;
    comment.value = '';
    error.value = null;
});

watch(fields, (options) => {
    if (!options.includes(field.value)) field.value = options.length === 1 ? options[0] : null;
});

const close = () => closeReport();

const submit = async () => {
    sending.value = true;
    error.value = null;

    const result = await sendReport({
        game: context.value.game,
        topic: context.value.topic,
        targetId: targetId.value,
        targetLabel: targetLabel.value,
        field: field.value,
        server: context.value.server ?? '',
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
.report-context {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.report-game {
    flex-shrink: 0;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--game-color) 55%, var(--border));
    border-radius: 6px;
    color: var(--game-color);
    font-family: var(--font-mono);
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
    padding: 6px 12px;
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

.report-textarea {
    min-height: 64px;
    resize: vertical;
}
</style>
