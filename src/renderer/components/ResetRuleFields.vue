<template>
    <label v-if="kind === 'weekly'" class="dialog-label">
        First reset
        <input v-model="anchor" class="dialog-input" type="datetime-local" required />
    </label>

    <label v-if="kind === 'weekly'" class="dialog-label">
        Resets every
        <span class="reset-weeks">
            <input
                v-model.number="everyWeeks"
                class="dialog-input"
                type="number"
                min="1"
                :max="CUSTOM_TASK_MAX_WEEKS"
                step="1"
                inputmode="numeric"
            />
            <span>{{ everyWeeks === 1 ? 'week' : 'weeks' }}</span>
        </span>
    </label>

    <fieldset v-if="kind === 'monthly'" class="dialog-fieldset">
        <legend class="dialog-label">Resets on</legend>
        <div class="reset-days">
            <button
                v-for="day in 31"
                :key="day"
                type="button"
                class="reset-day"
                :class="{ selected: monthDays.includes(day) }"
                :aria-pressed="monthDays.includes(day)"
                @click="toggleDay(day)"
            >
                {{ day }}
            </button>
        </div>
    </fieldset>

    <label v-if="kind === 'daily' || kind === 'monthly'" class="dialog-label">
        Reset time
        <input v-model="time" class="dialog-input" type="time" required />
    </label>

    <template v-if="kind === 'cycle'">
        <label class="dialog-label">
            Start
            <input v-model="startsAt" class="dialog-input" type="datetime-local" required />
        </label>
        <label class="dialog-label">
            End
            <input v-model="endsAt" class="dialog-input" type="datetime-local" required />
        </label>
    </template>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { CUSTOM_TASK_MAX_WEEKS } from '../../shared/accounts/customData.js';

const DEFAULT_PERIOD_DAYS = 7;

const props = defineProps({
    kind: { type: String, required: true },
    initial: { type: Object, default: null },
});

const reset = defineModel({ type: Object, default: null });

const pad = (value) => String(value).padStart(2, '0');
const toTimeInput = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const toDateTimeInput = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${toTimeInput(date)}`;
const toInstant = (value) => {
    const time = Date.parse(value);

    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const thisHour = new Date(new Date().setMinutes(0, 0, 0));
const inAWeek = new Date(new Date(thisHour).setDate(thisHour.getDate() + DEFAULT_PERIOD_DAYS));

const initial = props.initial?.kind === props.kind ? props.initial : {};
const dateInput = (instant, fallback) => toDateTimeInput(instant ? new Date(instant) : fallback);

const time = ref(initial.time ?? toTimeInput(thisHour));
const anchor = ref(dateInput(initial.anchor, inAWeek));
const everyWeeks = ref(initial.everyWeeks ?? 1);
const monthDays = ref([...(initial.monthDays ?? [])]);
const startsAt = ref(dateInput(initial.startsAt, thisHour));
const endsAt = ref(dateInput(initial.endsAt, inAWeek));

const toggleDay = (day) => {
    monthDays.value = monthDays.value.includes(day)
        ? monthDays.value.filter((selected) => selected !== day)
        : [...monthDays.value, day];
};

const rule = computed(() => {
    switch (props.kind) {
        case 'daily':
            return { kind: 'daily', time: time.value };
        case 'weekly':
            return { kind: 'weekly', anchor: toInstant(anchor.value), everyWeeks: everyWeeks.value };
        case 'monthly':
            return { kind: 'monthly', time: time.value, monthDays: [...monthDays.value] };
        case 'cycle':
            return { kind: 'cycle', startsAt: toInstant(startsAt.value), endsAt: toInstant(endsAt.value) };
        default:
            return null;
    }
});

watch(rule, (value) => (reset.value = value), { immediate: true });
</script>

<style scoped>
.reset-weeks {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
}

.reset-weeks .dialog-input {
    width: 72px;
}

.reset-days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    margin-top: 6px;
}

.reset-day {
    padding: 5px 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--panel);
    color: var(--muted2);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
}

.reset-day:hover {
    border-color: var(--border-hover);
}

.reset-day.selected {
    border-color: var(--accent);
    background: var(--pill-active-bg);
    color: var(--text);
}
</style>
