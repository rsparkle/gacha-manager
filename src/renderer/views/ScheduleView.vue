<template>
    <div id="scheduleApp">
        <button
            v-if="isMobile"
            type="button"
            class="schedule-month-orb"
            :class="{ 'schedule-month-orb--away': !isCurrentMonth }"
            :aria-label="isCurrentMonth ? `${monthName} ${currentYear}` : `${monthName} ${currentYear}, back to today`"
            @click="goToToday"
        >
            {{ monthShort }} <span class="year">{{ currentYear }}</span>
        </button>

        <div ref="filtersPanel" class="schedule-header" :class="{ 'schedule-header--open': filtersOpen }">
            <div class="schedule-month-nav">
                <button
                    class="nav-btn"
                    type="button"
                    aria-label="Previous month"
                    :style="{ visibility: canGoPrev ? 'visible' : 'hidden' }"
                    @click="prevMonth"
                >
                    &#8592;
                </button>

                <div class="schedule-month-label">
                    {{ monthName }}
                    <span class="year">{{ currentYear }}</span>
                </div>

                <button
                    class="nav-btn"
                    type="button"
                    aria-label="Next month"
                    :style="{ visibility: canGoNext ? 'visible' : 'hidden' }"
                    @click="nextMonth"
                >
                    &#8594;
                </button>
            </div>

            <div class="server-select">
                <button
                    v-for="server in servers"
                    :key="server"
                    type="button"
                    class="server-btn"
                    :class="{ active: selectedServer === server }"
                    @click="selectedServer = server"
                >
                    {{ server }}
                </button>
            </div>

            <div class="schedule-nav">
                <button
                    v-for="game in gameList"
                    :key="game"
                    type="button"
                    class="game-badge"
                    :style="{ '--gc': gameColor(game) }"
                    :class="{ 'game-badge--disabled': !selectedGames.includes(game) }"
                    :aria-pressed="selectedGames.includes(game)"
                    @click="toggleSelectedGames(game)"
                >
                    <img v-if="gameIcons[game]" :src="gameIcons[game]" :alt="game" class="game-badge-icon" />
                    <span class="game-badge-name">{{ gameAbbr(game) }}</span>
                </button>
            </div>
        </div>

        <div class="schedule-body">
            <div class="calendar-grid" @touchstart.passive="onSwipeStart" @touchend="onSwipeEnd">
                <div class="week-header">
                    <div
                        v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
                        :key="day"
                        class="header-cell"
                    >
                        {{ day }}
                    </div>
                </div>

                <div ref="weeksEl" class="calendar-weeks">
                    <div v-for="(week, wi) in weeks" :key="wi" class="week">
                        <div
                            v-for="(day, di) in week"
                            :key="di"
                            class="cell"
                            :class="{
                                empty: !day,
                                today: day && isToday(day.date),
                                'cell--has-art': day && day.releases.length > 0,
                                'cell--selected': isMobile && day && day.key === selectedDay?.key,
                            }"
                            @click="day && selectDay(day)"
                        >
                            <template v-if="day">
                                <span class="day-number">{{ day.date.getDate() }}</span>

                                <div class="cell-content">
                                    <div v-if="day.releases.length" class="cell-art">
                                        <div class="cell-art-images">
                                            <div
                                                v-for="(release, ri) in day.releases"
                                                :key="`${release.game}-${release.label}-${ri}`"
                                                class="cell-art-slice"
                                                :class="{ 'cell-art-slice--tile': isTile(day, release) }"
                                                :style="{
                                                    width: `${100 / day.releases.length}%`,
                                                    '--gc': release.color,
                                                    backgroundImage: isTile(day, release)
                                                        ? undefined
                                                        : getBackgroundImageWithFallbacks(release),
                                                }"
                                                role="img"
                                                :aria-label="release.label"
                                            >
                                                <template v-if="isTile(day, release)">
                                                    <img
                                                        v-if="gameIcons[release.game]"
                                                        :src="gameIcons[release.game]"
                                                        alt=""
                                                        class="cell-art-tile-icon"
                                                    />
                                                    <span v-else class="cell-art-tile-name">
                                                        {{ release.source ?? gameAbbr(release.game) }}
                                                    </span>
                                                </template>
                                            </div>
                                        </div>

                                        <div class="cell-art-shade" />
                                    </div>

                                    <div
                                        v-if="day.events.length"
                                        class="events-list"
                                        :class="{ 'events-list--over-art': day.releases.length }"
                                    >
                                        <button
                                            v-for="(event, ei) in day.events"
                                            :key="`${event.game}-${event.label}-${event.date.getTime()}-${ei}`"
                                            type="button"
                                            class="event"
                                            :style="{ '--gc': event.color }"
                                            :class="{ estimated: !event.confirmed }"
                                            :aria-label="`${event.label}, ${formatEventTime(event)}`"
                                            @mouseenter="onEventEnter(event, $event)"
                                            @mouseleave="onEventLeave"
                                            @focus="onEventEnter(event, $event)"
                                            @blur="onEventLeave"
                                            @click="togglePinnedEvent(event, $event)"
                                        >
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

            <section v-if="isMobile && selectedDay" class="day-agenda">
                <p class="day-agenda-title">
                    {{ formatDayTitle(selectedDay.date) }}
                    <span v-if="isToday(selectedDay.date)" class="day-agenda-today">Today</span>
                </p>

                <p v-if="!selectedDay.events.length" class="day-agenda-empty">Nothing scheduled</p>

                <button
                    v-for="(event, ei) in selectedDay.events"
                    :key="`${event.game}-${event.label}-${event.date.getTime()}-${ei}`"
                    type="button"
                    class="day-agenda-event"
                    :class="{ estimated: !event.confirmed }"
                    :style="{ '--gc': event.color }"
                    @click="togglePinnedEvent(event, $event)"
                >
                    <img v-if="gameIcons[event.game]" :src="gameIcons[event.game]" alt="" class="day-agenda-icon" />
                    <span v-else class="day-agenda-icon day-agenda-icon--abbr">
                        {{ event.source ?? gameAbbr(event.game) }}
                    </span>
                    <span class="day-agenda-label">{{ event.label }}</span>
                    <span class="day-agenda-meta">
                        <span class="day-agenda-time">{{ formatEventTime(event) }}</span>
                        <span v-if="!event.confirmed" class="day-agenda-estimated">Estimated</span>
                    </span>
                </button>
            </section>
        </div>

        <button
            v-if="isMobile"
            ref="filtersOrb"
            type="button"
            class="schedule-filters-orb"
            :class="{ 'schedule-filters-orb--open': filtersOpen }"
            :aria-expanded="filtersOpen"
            aria-label="Games and server"
            @click="filtersOpen = !filtersOpen"
        >
            <svg
                v-if="!filtersOpen"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="17" x2="20" y2="17" />
                <circle cx="9" cy="7" r="2.4" fill="var(--panel)" />
                <circle cx="15" cy="17" r="2.4" fill="var(--panel)" />
            </svg>
            <svg
                v-else
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
            >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
        </button>

        <Teleport to="body">
            <Transition name="event-tooltip">
                <div
                    v-if="activeEvent"
                    class="schedule-event-tooltip"
                    :class="{
                        'schedule-event-tooltip--portrait': activeEventIsPortrait,
                        'schedule-event-tooltip--landscape': !activeEventIsPortrait,
                        'schedule-event-tooltip--pinned': pinned,
                    }"
                    :style="tooltipStyle"
                    role="tooltip"
                >
                    <div
                        v-if="activeEventHasImage"
                        class="schedule-event-tooltip-hero"
                        :style="{ backgroundImage: getBackgroundImageWithFallbacks(activeEvent) }"
                    >
                        <div class="schedule-event-tooltip-hero-shade" />
                    </div>

                    <div class="schedule-event-tooltip-body">
                        <div class="schedule-event-tooltip-topline">
                            <span
                                v-if="!activeEventHasImage"
                                class="schedule-event-tooltip-game schedule-event-tooltip-game--inline"
                            >
                                {{ activeEvent.source ?? gameAbbr(activeEvent.game) }}
                            </span>
                            <span class="schedule-event-tooltip-date">
                                {{ formatEventDate(activeEvent) }}
                            </span>
                        </div>

                        <div class="schedule-event-tooltip-title-row">
                            <div class="schedule-event-tooltip-title">
                                {{ activeEvent.label }}
                            </div>
                            <ReportFlag
                                v-if="pinned && activeEvent.key"
                                class="schedule-event-tooltip-flag"
                                :context="reportContext"
                                @click="hideEventTooltip"
                            />
                        </div>

                        <div class="schedule-event-tooltip-meta">
                            <div class="schedule-event-tooltip-time">
                                {{ formatEventTime(activeEvent) }}
                            </div>

                            <div v-if="!activeEvent.confirmed" class="schedule-event-tooltip-estimated">
                                <img v-if="estimatedSticker" :src="estimatedSticker" class="estimated-sticker" alt="" />
                                <span class="estimated-label">Estimated</span>
                            </div>
                        </div>

                        <div v-if="activeCountdown" class="schedule-event-tooltip-countdown">
                            <span class="schedule-event-tooltip-countdown-label">
                                {{ activeCountdown.prefix }}
                            </span>
                            <span class="schedule-event-tooltip-countdown-value">
                                {{ activeCountdown.value }}
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
import platform from '#platform';
import { OTHERS, OTHERS_COLOR, createScheduleProcessor } from '../lib/scheduleProcessor.js';
import { useSettings } from '../composables/useSettings.js';
import { useAccounts } from '../composables/useAccounts.js';
import { slugify, formatCountdown, thumbnailPath } from '../../shared/format.js';
import { SCHEDULE_SERVERS } from '../../shared/gameData.js';
import { earliestPatchStart } from '../../shared/patches.js';
import { themeAsset } from '../themes.js';
import ReportFlag from '../components/ReportFlag.vue';
import { useIsMobile } from '../composables/useIsMobile.js';

const { settings, saveSettings } = useSettings();
const { gameConfig, independentEvents, gamesWithAccounts } = useAccounts();
const { isMobile } = useIsMobile();
const GAME_CONFIG = computed(() => gameConfig.value ?? {});

const gameColor = (game) => (game === OTHERS ? OTHERS_COLOR : GAME_CONFIG.value[game]?.color);
const gameAbbr = (game) => (game === OTHERS ? OTHERS : (GAME_CONFIG.value[game]?.abbr ?? game));

let computeScheduleData;
let clockTimer;
let scheduleBuiltAt = 0;

const SCHEDULE_REBUILD_MS = 60 * 60 * 1000;
const SWIPE_MIN_DISTANCE = 50;
const SWIPE_MAX_MS = 600;

const now = ref(new Date());
const currentYear = ref(now.value.getFullYear());
const currentMonth = ref(now.value.getMonth());

const servers = SCHEDULE_SERVERS;
const selectedServer = ref(settings.value?.server ?? 'America');

const scheduleData = ref({});
const selectedGames = ref([]);
const gameIcons = reactive({});
const imageUrls = reactive({});
const missingImages = reactive({});

const activeEvent = ref(null);
const pinned = ref(false);
const tooltipPosition = ref({ left: 0, top: 0, placement: 'above' });

const filtersOpen = ref(false);
const filtersPanel = ref(null);
const filtersOrb = ref(null);
const weeksEl = ref(null);
const selectedDayKey = ref(null);
let swipeStart = null;
let dismissedAt = 0;

const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const monthName = computed(() => monthNames[currentMonth.value]);
const monthShort = computed(() => monthName.value.slice(0, 3));

const isCurrentMonth = computed(
    () => currentYear.value === now.value.getFullYear() && currentMonth.value === now.value.getMonth(),
);
const gameList = computed(() => Object.keys(scheduleData.value));

const minDate = computed(() => {
    const starts = Object.values(GAME_CONFIG.value).map(earliestPatchStart).filter(Boolean).sort();

    if (!starts.length) return new Date(now.value.getFullYear(), now.value.getMonth() - 1, 1);

    const [year, month] = starts[0].split('-').map(Number);

    return new Date(year, month - 1, 1);
});

const canGoPrev = computed(() => new Date(currentYear.value, currentMonth.value, 1) > minDate.value);

const maxDate = computed(() => new Date(now.value.getFullYear(), now.value.getMonth() + 2, 1));

const canGoNext = computed(() => new Date(currentYear.value, currentMonth.value, 1) < maxDate.value);

watch(
    () => now.value.getFullYear() * 12 + now.value.getMonth(),
    (month, previous) => {
        if (currentYear.value * 12 + currentMonth.value !== previous) return;

        currentYear.value = Math.floor(month / 12);
        currentMonth.value = month % 12;
    },
);

const activeEventHasImage = computed(() => {
    if (!activeEvent.value) return false;
    return Boolean(activeEvent.value.imgFiles?.length);
});

const isPortrait = (event) => Boolean(event?.portrait) && !missingImages[event.imgFiles?.[0]];

const isTile = (day, release) => day.releases.length > 1 && !isPortrait(release);

const activeEventIsPortrait = computed(() => isPortrait(activeEvent.value));

const tooltipStyle = computed(() => {
    const color = { '--gc': activeEvent.value?.color ?? 'var(--accent)' };

    if (isMobile.value) return color;

    return {
        ...color,
        left: `${tooltipPosition.value.left}px`,
        top: `${tooltipPosition.value.top}px`,
        transform:
            tooltipPosition.value.placement === 'above'
                ? 'translate(-50%, calc(-100% - 10px))'
                : 'translate(-50%, 10px)',
    };
});

const activeCountdown = computed(() => {
    if (!activeEvent.value?.date || activeEvent.value.allDay) return null;

    const diff = activeEvent.value.date.getTime() - now.value.getTime();

    if (diff > 0) {
        return {
            prefix: 'starts in',
            value: formatCountdown(diff),
        };
    }

    return {
        prefix: 'started',
        value: `${formatCountdown(Math.abs(diff))} ago`,
    };
});

const estimatedSticker = computed(() => themeAsset(settings.value.theme, 'estimated'));

const loadGameIcons = () =>
    Promise.all(
        gameList.value
            .filter((game) => game !== OTHERS && !gameIcons[game])
            .map(async (game) => {
                try {
                    const url = await platform.images.getUrl(`games/${slugify(game)}_icon.webp`);

                    if (url) gameIcons[game] = url;
                } catch (err) {
                    console.error(`Failed to load ${game} icon:`, err);
                }
            }),
    );

const visibleImageFiles = computed(
    () =>
        new Set(
            weeks.value
                .flat()
                .filter(Boolean)
                .flatMap((day) => day.events)
                .flatMap((event) => event.imgFiles ?? []),
        ),
);

const pendingImages = new Set();

const loadEventImages = () =>
    Promise.all(
        [...visibleImageFiles.value]
            .filter((file) => !imageUrls[file] && !pendingImages.has(file))
            .map(async (file) => {
                pendingImages.add(file);

                try {
                    const url =
                        (await platform.images.getUrl(thumbnailPath(file))) ?? (await platform.images.getUrl(file));

                    if (url) {
                        imageUrls[file] = url;
                        delete missingImages[file];
                    } else {
                        missingImages[file] = true;
                    }
                } catch (err) {
                    missingImages[file] = true;
                    console.error(`Failed to load ${file}:`, err);
                } finally {
                    pendingImages.delete(file);
                }
            }),
    );

const getBackgroundImageWithFallbacks = (event) =>
    (event?.imgFiles ?? [])
        .map((file) => imageUrls[file])
        .filter(Boolean)
        .map((url) => `url('${url}')`)
        .join(', ');

const isToday = (date) => {
    const current = now.value;

    return (
        date.getFullYear() === current.getFullYear() &&
        date.getMonth() === current.getMonth() &&
        date.getDate() === current.getDate()
    );
};

const toggleSelectedGames = (game) => {
    hideEventTooltip();

    const index = selectedGames.value.indexOf(game);
    if (index > -1) selectedGames.value.splice(index, 1);
    else selectedGames.value.push(game);

    settings.value.scheduleGames = selectedGames.value.filter((name) => name !== OTHERS);
    settings.value.scheduleOthers = selectedGames.value.includes(OTHERS);
    saveSettings(true);
};

const filteredScheduleData = computed(() => {
    return Object.fromEntries(
        Object.entries(scheduleData.value).filter(([game]) => selectedGames.value.includes(game)),
    );
});

const eventsByDay = computed(() => {
    const map = {};

    for (const [game, events] of Object.entries(filteredScheduleData.value)) {
        const color = gameColor(game);

        for (const [eventKey, eventData] of Object.entries(events)) {
            const key = eventData.date.toDateString();
            (map[key] ??= []).push({ ...eventData, key: eventKey, game, color });
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
        const releases = events.filter((event) => event.type === 'release' && event.imgFiles?.length);
        days.push({ key: date.toDateString(), date, events, releases });
    }

    const result = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));

    while (result[result.length - 1].length < 7) {
        result[result.length - 1].push(null);
    }

    return result;
});

const nextMonth = () => {
    if (!canGoNext.value) return false;

    hideEventTooltip();

    if (currentMonth.value === 11) {
        currentMonth.value = 0;
        currentYear.value++;
    } else {
        currentMonth.value++;
    }

    return true;
};

const prevMonth = () => {
    if (!canGoPrev.value) return false;

    hideEventTooltip();

    if (currentMonth.value === 0) {
        currentMonth.value = 11;
        currentYear.value--;
    } else {
        currentMonth.value--;
    }

    return true;
};

const slideWeeks = (direction) => {
    weeksEl.value?.animate(
        [
            { transform: `translateX(${direction * 36}px)`, opacity: 0.2 },
            { transform: 'translateX(0)', opacity: 1 },
        ],
        { duration: 200, easing: 'ease-out' },
    );
};

const nudgeWeeks = (direction) => {
    weeksEl.value?.animate(
        [
            { transform: 'translateX(0)' },
            { transform: `translateX(${direction * -14}px)` },
            { transform: 'translateX(0)' },
        ],
        { duration: 220, easing: 'ease-out' },
    );
};

const onSwipeStart = (domEvent) => {
    if (domEvent.touches.length !== 1) {
        swipeStart = null;
        return;
    }

    const touch = domEvent.touches[0];
    swipeStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
};

const onSwipeEnd = (domEvent) => {
    if (!swipeStart) return;

    const touch = domEvent.changedTouches[0];
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    const elapsed = Date.now() - swipeStart.time;

    swipeStart = null;

    if (elapsed > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const direction = dx < 0 ? 1 : -1;
    const moved = direction === 1 ? nextMonth() : prevMonth();

    if (moved) slideWeeks(direction);
    else nudgeWeeks(direction);
};

const goToToday = () => {
    if (isCurrentMonth.value) {
        selectedDayKey.value = now.value.toDateString();
        return;
    }

    const direction =
        currentYear.value * 12 + currentMonth.value < now.value.getFullYear() * 12 + now.value.getMonth() ? 1 : -1;

    hideEventTooltip();
    currentYear.value = now.value.getFullYear();
    currentMonth.value = now.value.getMonth();
    slideWeeks(direction);
};

const monthDays = computed(() => weeks.value.flat().filter(Boolean));

const defaultSelectedDay = () => {
    const days = monthDays.value;

    return days.find((day) => isToday(day.date)) ?? days.find((day) => day.events.length) ?? days[0];
};

const selectedDay = computed(
    () => monthDays.value.find((day) => day.key === selectedDayKey.value) ?? defaultSelectedDay() ?? null,
);

const selectDay = (day) => {
    if (!isMobile.value || Date.now() - dismissedAt < 400) return;

    hideEventTooltip();
    selectedDayKey.value = day.key;
};

const formatDayTitle = (date) =>
    date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    });

const formatEventTime = (event) =>
    event.allDay
        ? 'All day'
        : event.date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
          });

const formatEventDate = (event) =>
    event.date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

const showEventTooltip = (event, domEvent) => {
    const target = domEvent.currentTarget;
    const rect = target?.getBoundingClientRect?.();

    if (!rect) return;

    const portrait = isPortrait(event);
    const tooltipWidth = portrait ? 220 : 290;
    const tooltipHalfWidth = tooltipWidth / 2;
    const viewportPadding = 12;
    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.min(
        Math.max(centerX, tooltipHalfWidth + viewportPadding),
        window.innerWidth - tooltipHalfWidth - viewportPadding,
    );

    const hasImage = Boolean(event.imgFiles?.length);

    const estimatedHeight = hasImage ? (portrait ? 430 : 245) : 170;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    const placeAbove = spaceAbove >= estimatedHeight || spaceAbove > spaceBelow;

    tooltipPosition.value = {
        left: clampedX,
        top: placeAbove ? rect.top : rect.bottom,
        placement: placeAbove ? 'above' : 'below',
    };

    activeEvent.value = event;
};

const hideEventTooltip = () => {
    activeEvent.value = null;
    pinned.value = false;
};

const onEventEnter = (event, domEvent) => {
    if (!pinned.value) showEventTooltip(event, domEvent);
};

const onEventLeave = () => {
    if (!pinned.value) hideEventTooltip();
};

const isSameEvent = (a, b) => a?.game === b?.game && a?.key === b?.key;

const togglePinnedEvent = (event, domEvent) => {
    if (pinned.value && isSameEvent(activeEvent.value, event)) {
        hideEventTooltip();
        return;
    }

    showEventTooltip(event, domEvent);
    pinned.value = true;
};

const onPinnedPointerDown = (domEvent) => {
    if (
        filtersOpen.value &&
        !filtersPanel.value?.contains(domEvent.target) &&
        !filtersOrb.value?.contains(domEvent.target)
    ) {
        filtersOpen.value = false;
        dismissedAt = Date.now();
    }

    if (!pinned.value) return;
    if (domEvent.target.closest?.('.schedule-event-tooltip, .event, .day-agenda-event')) return;

    hideEventTooltip();
    dismissedAt = Date.now();
};

const onPinnedKeydown = (domEvent) => {
    if (domEvent.key !== 'Escape') return;

    filtersOpen.value = false;
    if (pinned.value) hideEventTooltip();
};

const reportContext = computed(() => ({
    game: activeEvent.value?.game,
    topic: 'schedule',
    targetId: activeEvent.value?.key,
    targetLabel: activeEvent.value?.label,
    server: selectedServer.value,
}));

const loadSchedule = () => {
    if (!computeScheduleData) return;

    hideEventTooltip();

    try {
        scheduleData.value = computeScheduleData(selectedServer.value);
        scheduleBuiltAt = Date.now();
    } catch (err) {
        console.error('Failed to build schedule:', err);
        return;
    }

    loadGameIcons();
};

watch(
    [gameConfig, independentEvents],
    ([config, events]) => {
        if (!config) return;

        ({ computeScheduleData } = createScheduleProcessor(config, events));
        loadSchedule();
    },
    { immediate: true },
);

watch(visibleImageFiles, () => loadEventImages(), { immediate: true });

watch([currentYear, currentMonth], () => {
    selectedDayKey.value = null;
});

watch(isMobile, (mobile) => {
    if (!mobile) filtersOpen.value = false;
    hideEventTooltip();
});

watch(selectedServer, (server) => {
    settings.value.server = server;
    saveSettings(true);
    loadSchedule();
});

onMounted(() => {
    document.addEventListener('pointerdown', onPinnedPointerDown);
    document.addEventListener('keydown', onPinnedKeydown);

    clockTimer = window.setInterval(() => {
        now.value = new Date();

        if (!activeEvent.value && Date.now() - scheduleBuiltAt >= SCHEDULE_REBUILD_MS) {
            loadSchedule();
            return;
        }

        loadGameIcons();
        loadEventImages();
    }, 30_000);

    const saved = settings.value.scheduleGames;

    selectedGames.value = [
        ...(Array.isArray(saved) ? saved : gamesWithAccounts.value),
        ...(settings.value.scheduleOthers === false ? [] : [OTHERS]),
    ];
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPinnedPointerDown);
    document.removeEventListener('keydown', onPinnedKeydown);
    if (clockTimer) window.clearInterval(clockTimer);
});
</script>
