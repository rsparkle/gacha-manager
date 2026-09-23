<template>
    <div id="scheduleApp">
        <div class="schedule-header">
            <div class="schedule-month-nav">
                <button class="nav-btn" type="button" aria-label="Previous month" @click="prevMonth"
                    :style="{ visibility: canGoPrev ? 'visible' : 'hidden' }">
                    &#8592;
                </button>

                <div class="schedule-month-label">
                    {{ monthName }}
                    <span class="year">{{ currentYear }}</span>
                </div>

                <button class="nav-btn" type="button" aria-label="Next month" @click="nextMonth"
                    :style="{ visibility: canGoNext ? 'visible' : 'hidden' }">
                    &#8594;
                </button>
            </div>

            <div class="server-select">
                <button v-for="server in servers" :key="server" type="button" class="server-btn"
                    :class="{ active: selectedServer === server }" @click="selectedServer = server">
                    {{ server }}
                </button>
            </div>

            <div class="schedule-nav">
                <button v-for="game in gameList" :key="game" type="button" class="game-badge"
                    :style="{ '--gc': GAME_CONFIG[game]?.color }"
                    :class="{ 'game-badge--disabled': !selectedGames.includes(game) }"
                    :aria-pressed="selectedGames.includes(game)" @click="toggleSelectedGames(game)">
                    <img :src="gameIcons[game]" :alt="game" class="game-badge-icon" />
                    <span class="game-badge-name">{{ GAME_CONFIG[game]?.abbr ?? game }}</span>
                </button>
            </div>
        </div>

        <div v-if="isLoading" class="schedule-loading">
            <img v-if="settings.theme && settings.theme !== 'default'" :src="getLoadingSticker()"
                class="loading-sticker" alt="Loading schedule..." />
            <div class="loading-bar-wrapper">
                <div class="loading-bar" />
            </div>
        </div>

        <div v-else class="schedule-body">
            <div class="calendar-grid">
                <div class="week-header">
                    <div class="header-cell" v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
                        :key="day">
                        {{ day }}
                    </div>
                </div>

                <div class="calendar-weeks">
                    <div v-for="(week, wi) in weeks" :key="wi" class="week">
                        <div v-for="(day, di) in week" :key="di" class="cell" :class="{
                            empty: !day,
                            today: day && isToday(day.date),
                            'cell--has-art': day && day.releases.length > 0
                        }">
                            <template v-if="day">
                                <span class="day-number">{{ day.date.getDate() }}</span>

                                <div class="cell-content">
                                    <div v-if="day.releases.length" class="cell-art">
                                        <div class="cell-art-images">
                                            <div v-for="(release, ri) in day.releases"
                                                :key="`${release.game}-${release.label}-${ri}`" class="cell-art-slice"
                                                :style="{
                                                    width: `${100 / day.releases.length}%`,
                                                    backgroundImage: getBackgroundImageWithFallbacks(release)
                                                }" role="img" :aria-label="release.label" />
                                        </div>

                                        <div class="cell-art-shade" />
                                    </div>

                                    <div v-if="day.events.length" class="events-list"
                                        :class="{ 'events-list--over-art': day.releases.length }">
                                        <button v-for="(event, ei) in day.events"
                                            :key="`${event.game}-${event.label}-${event.date.getTime()}-${ei}`"
                                            type="button" class="event" :style="{ '--gc': event.color }"
                                            :class="{ unconfirmed: !event.confirmed }"
                                            :aria-label="`${event.label}, ${formatEventTime(event)}`"
                                            @mouseenter="showEventTooltip(event, $event)" @mouseleave="hideEventTooltip"
                                            @focus="showEventTooltip(event, $event)" @blur="hideEventTooltip">
                                            <span class="event-dot" />
                                            <span class="event-short-label">{{ event.title }}</span>
                                        </button>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <div class="calendar-footer">
                    Dates are estimated based on patch trends and may be subject to change
                </div>
            </div>
        </div>

        <Teleport to="body">
            <Transition name="event-tooltip">
                <div v-if="hoveredEvent" class="schedule-event-tooltip" :class="{
                    'schedule-event-tooltip--portrait': hoveredEventIsPortrait,
                    'schedule-event-tooltip--landscape': !hoveredEventIsPortrait
                }" :style="tooltipStyle" role="tooltip">
                    <div v-if="hoveredEventHasImage" class="schedule-event-tooltip-hero"
                        :style="{ backgroundImage: getBackgroundImageWithFallbacks(hoveredEvent) }">
                        <div class="schedule-event-tooltip-hero-shade" />
                        <span class="schedule-event-tooltip-game">
                            {{ GAME_CONFIG[hoveredEvent.game]?.abbr ?? hoveredEvent.game }}
                        </span>
                    </div>

                    <div class="schedule-event-tooltip-body">
                        <div class="schedule-event-tooltip-topline">
                            <span v-if="!hoveredEventHasImage"
                                class="schedule-event-tooltip-game schedule-event-tooltip-game--inline">
                                {{ GAME_CONFIG[hoveredEvent.game]?.abbr ?? hoveredEvent.game }}
                            </span>
                            <span class="schedule-event-tooltip-date">
                                {{ formatEventDate(hoveredEvent) }}
                            </span>
                        </div>

                        <div class="schedule-event-tooltip-title">
                            {{ hoveredEvent.label }}
                        </div>

                        <div class="schedule-event-tooltip-meta">
                            <div class="schedule-event-tooltip-time">
                                {{ formatEventTime(hoveredEvent) }}
                            </div>

                            <div v-if="!hoveredEvent.confirmed" class="schedule-event-tooltip-unconfirmed">
                                Estimated
                            </div>
                        </div>

                        <div v-if="hoveredCountdown" class="schedule-event-tooltip-countdown">
                            <span class="schedule-event-tooltip-countdown-label">
                                {{ hoveredCountdown.prefix }}
                            </span>
                            <span class="schedule-event-tooltip-countdown-value">
                                {{ hoveredCountdown.value }}
                            </span>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup>
import '../styles/schedule.css';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { createScheduleProcessor } from './scheduleProcessor';
import { useSettings } from './composables/useSettings.js';

const props = defineProps({
    gameConfig: Object,
    gamesWithAccounts: Array
});
const GAME_CONFIG = computed(() => props.gameConfig ?? {});
const { settings, saveSettings } = useSettings();

let computeScheduleData;
let clockTimer;

const MS_IN_MIN = 60_000;
const MS_IN_HOUR = 3_600_000;
const MS_IN_DAY = 86_400_000;

const today = new Date();
const now = ref(new Date());
const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth());

const servers = ['America', 'Europe', 'Asia'];
const selectedServer = ref(settings.value?.server ?? 'America');
const isLoading = ref(true);

const scheduleData = ref({});
const selectedGames = ref([]);
const gameIcons = reactive({});

const hoveredEvent = ref(null);
const tooltipPosition = ref({ left: 0, top: 0, placement: 'above' });

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const monthName = computed(() => monthNames[currentMonth.value]);
const gameList = computed(() => Object.keys(scheduleData.value));

const canGoPrev = computed(() =>
    !(currentYear.value === today.getFullYear() && currentMonth.value === today.getMonth())
);

const canGoNext = computed(() => {
    const maxMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const maxYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();

    return !(currentYear.value === maxYear && currentMonth.value === maxMonth);
});

const hoveredEventHasImage = computed(() => {
    if (!hoveredEvent.value) return false;
    return Boolean(hoveredEvent.value.img || hoveredEvent.value.fallbackImgs?.length);
});

const isPortraitTooltip = (event) =>
    /trailer|release/i.test(event?.label ?? '');

const hoveredEventIsPortrait = computed(() =>
    isPortraitTooltip(hoveredEvent.value)
);

const tooltipStyle = computed(() => ({
    '--gc': hoveredEvent.value?.color ?? 'var(--accent)',
    left: `${tooltipPosition.value.left}px`,
    top: `${tooltipPosition.value.top}px`,
    transform: tooltipPosition.value.placement === 'above'
        ? 'translate(-50%, calc(-100% - 10px))'
        : 'translate(-50%, 10px)'
}));

const hoveredCountdown = computed(() => {
    if (!hoveredEvent.value?.date) return null;

    const diff = hoveredEvent.value.date.getTime() - now.value.getTime();

    if (diff > 0) {
        return {
            prefix: 'starts in',
            value: countdownFormat(diff)
        };
    }

    return {
        prefix: 'started',
        value: `${countdownFormat(Math.abs(diff))} ago`
    };
});

const getLoadingSticker = () =>
    new URL(`../assets/themes/${settings.value.theme}/loading.webp`, import.meta.url).href;

const getGameSlug = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const loadGameIcons = async () => {
    for (const game of gameList.value) {
        if (gameIcons[game]) continue;

        const slug = getGameSlug(game);
        gameIcons[game] = await window.api.cacheImage(`games/${slug}_icon.webp`);
    }
};

const getBackgroundImageWithFallbacks = (event) => {
    const allImages = [event?.img, ...(event?.fallbackImgs || [])].filter(Boolean);
    console.log(allImages)
    return allImages.map((imgSrc) => `url('${imgSrc}')`).join(', ');
};

const isToday = (date) => {
    const current = now.value;

    return date.getFullYear() === current.getFullYear()
        && date.getMonth() === current.getMonth()
        && date.getDate() === current.getDate();
};

const toggleSelectedGames = (game) => {
    hideEventTooltip();

    const index = selectedGames.value.indexOf(game);
    if (index > -1) selectedGames.value.splice(index, 1);
    else selectedGames.value.push(game);
};

const filteredScheduleData = computed(() => {
    if (selectedGames.value.length === 0) return scheduleData.value;

    return Object.fromEntries(
        Object.entries(scheduleData.value)
            .filter(([game]) => selectedGames.value.includes(game))
    );
});

const eventsByDay = computed(() => {
    const map = {};

    for (const [game, events] of Object.entries(filteredScheduleData.value)) {
        const color = GAME_CONFIG.value[game]?.color;

        for (const eventData of Object.values(events)) {
            const key = eventData.date.toDateString();
            (map[key] ??= []).push({ ...eventData, game, color });
        }
    }

    for (const events of Object.values(map)) {
        events.sort((a, b) => a.date - b.date);
    }

    return map;
});

const weeks = computed(() => {
    const start = new Date(currentYear.value, currentMonth.value, 1);
    const end = new Date(currentYear.value, currentMonth.value + 1, 0);
    const days = [];

    for (let i = 0; i < start.getDay(); i++) days.push(null);

    for (let d = 1; d <= end.getDate(); d++) {
        const date = new Date(currentYear.value, currentMonth.value, d);
        const events = eventsByDay.value[date.toDateString()] ?? [];
        const releases = events.filter(
            (event) =>
                /release/i.test(event.label)
                && (event.img || event.fallbackImgs?.length)
        );
        days.push({ date, events, releases });
    }

    const result = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));

    while (result[result.length - 1].length < 7) {
        result[result.length - 1].push(null);
    }

    return result;
});

const nextMonth = () => {
    if (!canGoNext.value) return;

    hideEventTooltip();

    if (currentMonth.value === 11) {
        currentMonth.value = 0;
        currentYear.value++;
    } else {
        currentMonth.value++;
    }
};

const prevMonth = () => {
    if (!canGoPrev.value) return;

    hideEventTooltip();

    if (currentMonth.value === 0) {
        currentMonth.value = 11;
        currentYear.value--;
    } else {
        currentMonth.value--;
    }
};

const formatEventTime = (event) =>
    event.date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

const formatEventDate = (event) =>
    event.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

const countdownFormat = (ms) => {
    const d = Math.floor(ms / MS_IN_DAY);
    const h = Math.floor((ms % MS_IN_DAY) / MS_IN_HOUR);
    const m = Math.floor((ms % MS_IN_HOUR) / MS_IN_MIN);

    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const showEventTooltip = (event, domEvent) => {
    const target = domEvent.currentTarget;
    const rect = target?.getBoundingClientRect?.();

    if (!rect) return;

    const portrait = isPortraitTooltip(event);
    const tooltipWidth = portrait ? 220 : 290;
    const tooltipHalfWidth = tooltipWidth / 2;
    const viewportPadding = 12;
    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.min(
        Math.max(centerX, tooltipHalfWidth + viewportPadding),
        window.innerWidth - tooltipHalfWidth - viewportPadding
    );

    const hasImage = Boolean(event.img || event.fallbackImgs?.length);

    const estimatedHeight = hasImage
        ? portrait
            ? 430
            : 245
        : 170;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    const placeAbove =
        spaceAbove >= estimatedHeight ||
        spaceAbove > spaceBelow;

    tooltipPosition.value = {
        left: clampedX,
        top: placeAbove ? rect.top : rect.bottom,
        placement: placeAbove ? 'above' : 'below'
    };

    hoveredEvent.value = event;
};

const hideEventTooltip = () => {
    hoveredEvent.value = null;
};

watch(() => props.gameConfig, (config) => {
    if (config) {
        ({ computeScheduleData } = createScheduleProcessor(config));
    }
}, { immediate: true });

watch(selectedServer, async (server) => {
    if (!computeScheduleData) return;

    hideEventTooltip();
    isLoading.value = true;

    settings.value.server = server;
    saveSettings(true);

    try {
        scheduleData.value = await computeScheduleData(server);
        await loadGameIcons();
    } finally {
        isLoading.value = false;
    }
}, { immediate: true });

onMounted(() => {
    clockTimer = window.setInterval(() => {
        now.value = new Date();
    }, 30_000);

    selectedGames.value.push(...props.gamesWithAccounts);
});

onBeforeUnmount(() => {
    if (clockTimer) window.clearInterval(clockTimer);
});
</script>
