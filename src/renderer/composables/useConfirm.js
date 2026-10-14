import { ref } from 'vue';

const confirmState = ref(null);

export function useConfirm() {
    const confirm = (message, { confirmText = 'Confirm' } = {}) => {
        return new Promise((resolve) => {
            confirmState.value = {
                message,
                confirmText,
                onConfirm: () => {
                    confirmState.value = null;
                    resolve(true);
                },
                onCancel: () => {
                    confirmState.value = null;
                    resolve(false);
                },
            };
        });
    };

    return { confirmState, confirm };
}
