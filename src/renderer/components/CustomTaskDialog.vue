<template>
    <BaseDialog
        class="custom-task-dialog"
        :open="open"
        :title="task ? 'Edit task' : `Add a task to ${gameName}`"
        :error="error"
        :confirm-text="task ? 'Save' : 'Add task'"
        :busy-text="task ? 'Saving…' : 'Adding…'"
        :can-confirm="canSave"
        :busy="saving"
        @close="close"
        @submit="submit"
        @opened="labelInput?.focus()"
    >
        <label class="dialog-label">
            Name
            <input
                ref="labelInput"
                v-model="label"
                class="dialog-input"
                type="text"
                :maxlength="CUSTOM_TASK_LABEL_MAX"
                placeholder="Login event, web event…"
                required
            />
        </label>

        <div class="dialog-label">
            <label for="custom-task-category">Category</label>
            <CategoryPicker
                v-model="category"
                input-id="custom-task-category"
                :options="categoryOptions"
                :maxlength="CUSTOM_TASK_CATEGORY_MAX"
            />
        </div>

        <ResetRuleFields
            v-if="resetKind"
            :key="`${openCount}-${resetKind}`"
            v-model="reset"
            :kind="resetKind"
            :initial="task?.reset"
        />

        <fieldset v-else class="dialog-fieldset">
            <legend class="dialog-label">Ends in</legend>
            <div class="custom-task-duration">
                <label v-for="unit in UNITS" :key="unit.key" class="custom-task-unit">
                    <input
                        v-model.number="duration[unit.key]"
                        class="dialog-input"
                        type="number"
                        min="0"
                        :max="unit.max"
                        step="1"
                        inputmode="numeric"
                    />
                    <span>{{ unit.label }}</span>
                </label>
            </div>
        </fieldset>

        <p class="custom-task-preview">{{ preview }}</p>
    </BaseDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import CategoryPicker from './CategoryPicker.vue';
import ResetRuleFields from './ResetRuleFields.vue';
import {
    CUSTOM_TASK_CATEGORY_MAX,
    CUSTOM_TASK_LABEL_MAX,
    CUSTOM_TASK_MAX_MINUTES,
    RESET_CATEGORIES,
    computeCustomTask,
    currentTimeZone,
    customCycleLength,
    normalizeCustomReset,
    resetKindForCategory,
} from '../../shared/accounts/customData.js';
import { formatDuration } from '../../shared/format.js';
import { DAY, HOUR, MINUTE } from '../../shared/serverTime.js';
import { useAccounts } from '../composables/useAccounts.js';
import { useNotification } from '../composables/useNotification.js';

const UNITS = [
    { key: 'days', label: 'days', max: 366, minutes: 1440 },
    { key: 'hours', label: 'hours', max: 23, minutes: 60 },
    { key: 'minutes', label: 'minutes', max: 59, minutes: 1 },
];

const DEFAULT_CATEGORY = 'Event';

const props = defineProps({
    open: { type: Boolean, default: false },
    gameKey: { type: String, default: null },
    gameName: { type: String, default: '' },
    categories: { type: Array, default: () => [] },
    task: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const { addCustomTask, updateCustomTask } = useAccounts();
const { createNotification } = useNotification();

const labelInput = ref(null);
const label = ref('');
const category = ref('');
const duration = reactive({ days: 1, hours: 0, minutes: 0 });
const reset = ref(null);
const openCount = ref(0);
const saving = ref(false);
const error = ref(null);

const categoryKey = (name) => name.trim().toLowerCase();

const categoryOptions = computed(() => {
    const options = new Map();

    for (const name of [...props.categories, DEFAULT_CATEGORY, ...Object.keys(RESET_CATEGORIES)]) {
        if (!options.has(categoryKey(name))) options.set(categoryKey(name), name);
    }

    return [...options.values()];
});

const resolvedCategory = computed(
    () =>
        categoryOptions.value.find((option) => categoryKey(option) === categoryKey(category.value)) ??
        category.value.trim(),
);

const resetKind = computed(() => resetKindForCategory(category.value));

const totalMinutes = computed(() =>
    UNITS.reduce((total, unit) => total + (Number(duration[unit.key]) || 0) * unit.minutes, 0),
);

const durationError = computed(() => {
    const wholeUnits = UNITS.every((unit) => Number.isInteger(Number(duration[unit.key] || 0)));

    if (!wholeUnits || totalMinutes.value < 1) return 'Set at least 1 minute';
    if (totalMinutes.value > CUSTOM_TASK_MAX_MINUTES) return 'Can be at most 366 days away';

    return null;
});

const normalizedReset = computed(() => {
    if (!resetKind.value) return { rule: null, error: null };

    try {
        const zone = props.task?.reset?.zone ?? currentTimeZone();

        return { rule: normalizeCustomReset({ ...reset.value, kind: resetKind.value, zone }) };
    } catch (err) {
        return { rule: null, error: err.message };
    }
});

const inputError = computed(() => (resetKind.value ? normalizedReset.value.error : durationError.value));

const canSave = computed(() => Boolean(label.value.trim() && category.value.trim() && !inputError.value));

const formatWhen = (date) =>
    date.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

const resetSummary = (rule) => {
    switch (rule.kind) {
        case 'daily':
            return 'Resets every day';
        case 'weekly':
            return rule.everyWeeks === 1 ? 'Resets every week' : `Resets every ${rule.everyWeeks} weeks`;
        case 'monthly':
            return `Resets on day ${rule.monthDays.join(', ')}`;
        default:
            return `Resets every ${formatDuration(customCycleLength(rule))}`;
    }
};

const preview = computed(() => {
    if (inputError.value) return inputError.value;

    const now = new Date();

    if (!resetKind.value) return `Ends ${formatWhen(new Date(now.getTime() + totalMinutes.value * MINUTE))}`;

    const { rule } = normalizedReset.value;
    const { isDisabled, nextReset } = computeCustomTask({ id: 'custom:preview', reset: rule }, null, now);

    return isDisabled
        ? `${resetSummary(rule)} · starts ${formatWhen(new Date(rule.startsAt))}`
        : `${resetSummary(rule)} · next ${formatWhen(new Date(now.getTime() + nextReset))}`;
});

const remainingDuration = (task) => {
    const remaining = task?.endsAt ? Date.parse(task.endsAt) - Date.now() : 0;

    if (remaining < MINUTE) return { days: 1, hours: 0, minutes: 0 };

    const minutes = Math.ceil(remaining / MINUTE) * MINUTE;

    return {
        days: Math.floor(minutes / DAY),
        hours: Math.floor((minutes % DAY) / HOUR),
        minutes: Math.floor((minutes % HOUR) / MINUTE),
    };
};

watch(
    () => props.open,
    (open) => {
        if (!open) return;

        openCount.value++;
        label.value = props.task?.label ?? '';
        category.value = props.task?.type ?? props.categories[0] ?? DEFAULT_CATEGORY;
        Object.assign(duration, remainingDuration(props.task));
        error.value = null;
        saving.value = false;
    },
);

const close = () => emit('close');

const submit = async () => {
    if (!props.gameKey) return;

    saving.value = true;
    error.value = null;

    const timing = resetKind.value ? { reset: normalizedReset.value.rule } : { minutes: totalMinutes.value };

    const input = { label: label.value, category: resolvedCategory.value, ...timing };

    try {
        await (props.task
            ? updateCustomTask(props.gameKey, props.task.id, input)
            : addCustomTask(props.gameKey, input));
    } catch (err) {
        error.value = err.message;
        saving.value = false;
        return;
    }

    saving.value = false;
    close();
    createNotification('success', props.task ? 'Task updated!' : 'Task added!', 1000);
};
</script>

<style scoped>
.custom-task-dialog {
    min-height: min(364px, calc(100dvh - var(--keyboard-inset, 0px) - 24px));
}

.custom-task-duration {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 6px;
}

.custom-task-unit {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
    font-size: 11px;
}

.custom-task-preview {
    margin: -4px 0 0;
    color: var(--muted2);
    font-size: 11px;
}
</style>