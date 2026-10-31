<template>
    <BaseDialog
        :open="open"
        :title="`Add a task to ${gameName}`"
        :error="error"
        confirm-text="Add task"
        busy-text="Adding…"
        :can-confirm="canAdd"
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

        <label class="dialog-label">
            Category
            <input
                v-model="category"
                class="dialog-input"
                type="text"
                list="custom-task-categories"
                :maxlength="CUSTOM_TASK_CATEGORY_MAX"
                required
            />
            <datalist id="custom-task-categories">
                <option v-for="option in categoryOptions" :key="option" :value="option" />
            </datalist>
        </label>

        <fieldset class="dialog-fieldset">
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
            <p class="custom-task-preview">{{ preview }}</p>
        </fieldset>
    </BaseDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import BaseDialog from './BaseDialog.vue';
import {
    CUSTOM_TASK_CATEGORY_MAX,
    CUSTOM_TASK_LABEL_MAX,
    CUSTOM_TASK_MAX_MINUTES,
} from '../../shared/accounts/customData.js';
import { useAccounts } from '../composables/useAccounts.js';
import { useNotification } from '../composables/useNotification.js';

const UNITS = [
    { key: 'days', label: 'days', max: 366, minutes: 1440 },
    { key: 'hours', label: 'hours', max: 23, minutes: 60 },
    { key: 'minutes', label: 'minutes', max: 59, minutes: 1 },
];

const DEFAULT_CATEGORY = 'Events';

const props = defineProps({
    open: { type: Boolean, default: false },
    gameKey: { type: String, default: null },
    gameName: { type: String, default: '' },
    categories: { type: Array, default: () => [] },
});

const emit = defineEmits(['close']);

const { addCustomTask } = useAccounts();
const { createNotification } = useNotification();

const labelInput = ref(null);
const label = ref('');
const category = ref('');
const duration = reactive({ days: 1, hours: 0, minutes: 0 });
const saving = ref(false);
const error = ref(null);

const categoryOptions = computed(() => [...new Set([...props.categories, DEFAULT_CATEGORY])]);

const totalMinutes = computed(() =>
    UNITS.reduce((total, unit) => total + (Number(duration[unit.key]) || 0) * unit.minutes, 0),
);

const durationValid = computed(
    () =>
        UNITS.every((unit) => Number.isInteger(Number(duration[unit.key] || 0)) && Number(duration[unit.key]) >= 0) &&
        totalMinutes.value >= 1 &&
        totalMinutes.value <= CUSTOM_TASK_MAX_MINUTES,
);

const canAdd = computed(() => Boolean(label.value.trim() && category.value.trim() && durationValid.value));

const preview = computed(() => {
    if (totalMinutes.value < 1) return 'Set at least 1 minute';
    if (totalMinutes.value > CUSTOM_TASK_MAX_MINUTES) return 'Can be at most 366 days away';

    const end = new Date(Date.now() + totalMinutes.value * 60_000);

    return `Ends ${end.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })}`;
});

watch(
    () => props.open,
    (open) => {
        if (!open) return;

        label.value = '';
        category.value = props.categories[0] ?? DEFAULT_CATEGORY;
        Object.assign(duration, { days: 1, hours: 0, minutes: 0 });
        error.value = null;
        saving.value = false;
    },
);

const close = () => emit('close');

const submit = async () => {
    if (!props.gameKey) return;

    saving.value = true;
    error.value = null;

    try {
        await addCustomTask(props.gameKey, {
            label: label.value,
            category: category.value,
            minutes: totalMinutes.value,
        });
    } catch (err) {
        error.value = err.message;
        saving.value = false;
        return;
    }

    saving.value = false;
    close();
    createNotification('success', 'Task added!', 1000);
};
</script>

<style scoped>
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
    margin: 8px 0 0;
    color: var(--muted2);
    font-size: 11px;
}
</style>
