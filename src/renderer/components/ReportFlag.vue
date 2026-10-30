<template>
    <button
        type="button"
        class="report-flag"
        :class="{ reported }"
        :title="reported ? 'Reported, thanks!' : 'Report a problem'"
        :aria-label="reported ? 'Reported' : 'Report a problem'"
        @click.stop="openReport(context)"
    >
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            :fill="reported ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
    </button>
</template>

<script setup>
import { computed } from 'vue';
import { useReport } from '../composables/useReport.js';

const props = defineProps({
    context: { type: Object, required: true },
});

const { openReport, isReported } = useReport();

const reported = computed(() => isReported(props.context));
</script>

<style scoped>
.report-flag {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color 120ms ease;
}

.report-flag:hover {
    color: var(--urgent);
}

.report-flag.reported {
    color: var(--muted2);
}

.report-flag:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}
</style>
