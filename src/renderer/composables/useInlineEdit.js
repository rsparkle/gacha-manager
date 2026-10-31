import { computed, nextTick, reactive, ref } from 'vue';

export function useInlineEdit({ read, save }) {
    const target = ref(null);
    const value = ref('');
    const input = ref(null);
    let saving = false;

    const editing = computed(() => target.value !== null);

    function start(nextTarget = true) {
        target.value = nextTarget;
        value.value = String(read(nextTarget) ?? '');

        nextTick(() => input.value?.select?.());
    }

    function cancel() {
        target.value = null;
    }

    async function commit() {
        if (!editing.value || saving) return false;

        const editedTarget = target.value;
        saving = true;

        try {
            const saved = (await save(value.value, editedTarget)) !== false;

            if (saved && target.value === editedTarget) cancel();

            return saved;
        } finally {
            saving = false;
        }
    }

    async function finish() {
        await commit();
        cancel();
    }

    function isEditing(candidate) {
        return target.value === candidate;
    }

    return reactive({ target, value, input, editing, start, cancel, commit, finish, isEditing });
}
