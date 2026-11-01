<template>
    <span class="category-picker" @keydown.esc="closeMenu" @focusout="onFocusOut">
        <input
            :id="inputId"
            v-model="category"
            class="dialog-input category-input"
            type="text"
            role="combobox"
            autocomplete="off"
            aria-autocomplete="none"
            :aria-controls="menuId"
            :aria-expanded="menuOpen"
            :maxlength="maxlength"
            required
            @click="menuOpen = true"
            @keydown.down.prevent="menuOpen = true"
        />
        <button
            type="button"
            class="category-toggle"
            tabindex="-1"
            aria-label="Show categories"
            @mousedown.prevent
            @click="menuOpen = !menuOpen"
        >
            ▾
        </button>
        <span v-if="menuOpen" :id="menuId" class="category-menu" role="listbox">
            <button
                v-for="option in options"
                :key="option"
                type="button"
                role="option"
                class="category-option"
                :class="{ active: option === category.trim() }"
                :aria-selected="option === category.trim()"
                @mousedown.prevent
                @click="pick(option)"
            >
                {{ option }}
            </button>
        </span>
    </span>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    options: { type: Array, default: () => [] },
    inputId: { type: String, default: undefined },
    maxlength: { type: Number, default: undefined },
});

const category = defineModel({ type: String, default: '' });

const menuOpen = ref(false);
const menuId = computed(() => `${props.inputId ?? 'category'}-options`);

const pick = (option) => {
    category.value = option;
    menuOpen.value = false;
};

const closeMenu = (event) => {
    if (!menuOpen.value) return;

    event.preventDefault();
    menuOpen.value = false;
};

const onFocusOut = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) menuOpen.value = false;
};
</script>

<style scoped>
.category-picker {
    position: relative;
    display: block;
}

.category-input {
    padding-right: 28px;
}

.category-toggle {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 28px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 10px;
    cursor: pointer;
}

.category-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 160px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--border-hover);
    border-radius: 6px;
    background: var(--panel);
    box-shadow: var(--shadow-popover);
}

.category-option {
    padding: 6px 8px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted2);
    font-size: 12px;
    font-weight: 400;
    text-align: left;
    cursor: pointer;
}

.category-option:hover {
    background: var(--panel-hover);
    color: var(--text);
}

.category-option.active {
    background: var(--pill-active-bg);
    color: var(--text);
}
</style>
