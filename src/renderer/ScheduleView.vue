<template>
    <div id="scheduleApp">
        <div class="schedule-header">
            <div class="schedule-month-nav">
                <button class="nav-btn" @click="prevMonth"
                    :style="{ visibility: canGoPrev ? 'visible' : 'hidden' }">&#8592;</button>
                <div class="schedule-month-label">
                    {{ monthName }}
                    <span class="year">{{ currentYear }}</span>
                </div>
                <button class="nav-btn" @click="nextMonth"
                    :style="{ visibility: canGoNext ? 'visible' : 'hidden' }">&#8594;</button>
            </div>
            <div class="server-select">
                <button v-for="server in servers" :key="server" class="server-btn"
                    :class="{ active: selectedServer === server }" @click="selectedServer = server">
                    {{ server }}
                </button>
            </div>
            <div class="schedule-nav">
                <div v-for="game in gameList" :key="game" class="game-badge"
                    :style="{ '--gc': GAME_CONFIG[game]?.color }"
                    :class="{ 'game-badge--active': selectedGames.includes(game) }" @click="toggleSelectedGames(game)">
                    <img :src="getImageUrl(game)" :alt="game" class="game-badge-icon" />
                    <span class="game-badge-name">{{ GAME_CONFIG[game].abbr }}</span>
                </div>
            </div>
        </div>

        <div class="schedule-body">
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
                            selected: day && selectedDay && day.date.toDateString() === selectedDay.date.toDateString()
                        }" @click="day && selectDay(day)">
                            <template v-if="day">
                                <span class="day-number">{{ day.date.getDate() }}</span>
                                <div class="events-list">
                                    <div v-for="event in day.events.slice(0, 3)" :key="event.label" class="event"
                                        :style="{ '--gc': event.color }" :class="{ 'unconfirmed': !event.confirmed }"
                                        @click.stop="selectedEvent = event; selectedDay = day">
                                        {{ event.label }}
                                    </div>
                                    <span v-if="day.events.length > 3" class="event-overflow">
                                        +{{ day.events.length - 3 }}
                                    </span>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <div class="calendar-footer">
                    Dates are estimated based on patch trends and may be subject to change
                </div>
            </div>

            <div class="event-panel" :class="{ 'event-panel--visible': selectedDay }">
                <template v-if="selectedDay">
                    <div class="event-panel-date">
                        {{ selectedDay.date.toLocaleDateString('en-US', {
                            weekday: 'long', month: 'long', day: 'numeric'
                        }) }}
                    </div>

                    <div v-if="selectedDay.events.length === 0" class="event-panel-empty-day">
                        <span class="event-panel-empty-day-label">Nothing scheduled</span>
                        <img v-if="settings.theme" :src="getNoEventsSticker()" class="no-events-sticker">
                    </div>

                    <div v-else class="event-panel-content">
                        <div class="event-panel-hero">
                            <img v-if="selectedEvent?.img && eventSrc" :src="eventSrc" :key="selectedEvent.img" @error="onError"
                                class="event-panel-img" />
                            <div v-else class="event-panel-img-empty" />
                        </div>

                        <div class="event-panel-list">
                            <div v-for="event in selectedDay.events" :key="event.label" class="event-panel-item"
                                :style="{ '--gc': event.color }"
                                :class="{ 'event-panel-item--active': selectedEvent === event }"
                                @click="selectedEvent = event">
                                <span class="event-panel-item-dot" />
                                <div class="event-panel-item-info">
                                    <span class="event-panel-item-label">{{ event.label }}</span>
                                    <span class="event-panel-item-time">
                                        {{ event.date.toLocaleTimeString('en-US', {
                                            hour: '2-digit', minute: '2-digit', hour12: false
                                        }) }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="event-panel-unconfirmed" v-if="!selectedEvent?.confirmed">
                            This date is not confirmed
                        </div>

                        <div class="event-panel-footer" v-if="selectedEvent && calculatedCountdown">
                            <span class="event-panel-countdown-label">{{ calculatedCountdown.prefix }}</span>
                            <span class="event-panel-countdown">{{ calculatedCountdown.countdown }}</span>
                        </div>
                    </div>
                </template>

                <div v-else class="event-panel-empty">
                    <span>Select a day</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import '../styles/schedule.css';
import { computed, onMounted, ref, watch } from 'vue';
import { computeScheduleData } from './scheduleProcessor';
import { GAME_CONFIG } from '../game-config';
import { useSettings } from './composables/useSettings.js';
import { useFallbackImg } from './composables/useFallbackImg.js';
const { settings, saveSettings } = useSettings()

const MS_IN_MIN = 60_000;
const MS_IN_HOUR = 3_600_000;
const MS_IN_DAY = 86_400_000;

const today = new Date();
const currentYear = ref(today.getFullYear());
const currentMonth = ref(today.getMonth());
const selectedDay = ref(null);
const selectedEvent = ref(null);
const servers = ['America', 'Europe', 'Asia'];
const selectedServer = ref(settings.value?.server ?? 'America');

const scheduleData = computed(() => computeScheduleData(selectedServer.value))
const gameList = computed(() => Object.keys(scheduleData.value))
const selectedGames = ref([]);

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = computed(() => monthNames[currentMonth.value]);

const canGoPrev = computed(() =>
    !(currentYear.value === today.getFullYear() && currentMonth.value === today.getMonth())
);

const canGoNext = computed(() => {
    const maxMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const maxYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    return !(currentYear.value === maxYear && currentMonth.value === maxMonth);
});

const getNoEventsSticker = () => {
    return new URL(`../assets/themes/${settings.value.theme}/no_events.webp`, import.meta.url).href;
}

const { eventSrc, onError } = useFallbackImg(
    computed(() => selectedEvent.value?.img),
    computed(() => selectedEvent.value?.fallbackImgs)
)

watch(selectedServer, (val) => {
    if (selectedDay.value) {
        const key = selectedDay.value.date.toDateString()
        const freshEvents = eventsByDay.value[key] ?? []
        selectedDay.value = { date: selectedDay.value.date, events: freshEvents }
        selectedEvent.value = freshEvents[0] ?? null
    }

    settings.value.server = val;
    saveSettings(true)
})

const nextMonth = () => {
    if (!canGoNext.value) return;
    if (currentMonth.value === 11) { currentMonth.value = 0; currentYear.value++; }
    else currentMonth.value++;
};

const prevMonth = () => {
    if (!canGoPrev.value) return;
    if (currentMonth.value === 0) { currentMonth.value = 11; currentYear.value--; }
    else currentMonth.value--;
};

const isToday = (date) =>
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

const getGameSlug = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const getImageUrl = (game) => {
    const slug = getGameSlug(game);
    return new URL(`../assets/games/${slug}_icon.webp`, import.meta.url).href;
};

const toggleSelectedGames = (game) => {
    const index = selectedGames.value.indexOf(game);
    if (index > -1) selectedGames.value.splice(index, 1);
    else selectedGames.value.push(game);
};

const selectDay = (day) => {
    if (selectedDay.value?.date.toDateString() === day.date.toDateString()) {
        selectedDay.value = null;
        selectedEvent.value = null;
        return;
    }
    selectedDay.value = day;
    selectedEvent.value = day.events[0] ?? null;
};

const filteredScheduleData = computed(() => {
    if (selectedGames.value.length === 0) return scheduleData.value;
    return Object.fromEntries(
        Object.entries(scheduleData.value).filter(([game]) => selectedGames.value.includes(game))
    );
});

const eventsByDay = computed(() => {
    const map = {};
    for (const [game, events] of Object.entries(filteredScheduleData.value)) {
        const color = GAME_CONFIG[game]?.color;
        for (const eventData of Object.values(events)) {
            const key = eventData.date.toDateString();
            (map[key] ??= []).push({ ...eventData, color });
        }
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
        days.push({ date, events: eventsByDay.value[date.toDateString()] ?? [] });
    }

    const result = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    while (result[result.length - 1].length < 7) result[result.length - 1].push(null);
    return result;
});

const countdownFormat = (ms) => {
    const d = Math.floor(ms / MS_IN_DAY);
    const h = Math.floor((ms % MS_IN_DAY) / MS_IN_HOUR);
    const m = Math.floor((ms % MS_IN_HOUR) / MS_IN_MIN);

    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const calculatedCountdown = computed(() => {
    if (!selectedEvent.value) return null
    const diff = selectedEvent.value.date - new Date()
    if (diff <= 0) return null
    return { prefix: 'starts in', countdown: countdownFormat(diff) }
})

onMounted(() => {
    const todayEvents = eventsByDay.value[today.toDateString()] ?? [];
    selectedDay.value = { date: today, events: todayEvents };
    selectedEvent.value = todayEvents[0] ?? null;
});
</script>