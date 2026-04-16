import { ref, watch, isRef } from 'vue'

export function useFallbackImg(primary, fallbacks = []) {
    const eventSrc = ref(isRef(primary) ? primary.value : primary)
    let remaining = []

    if (isRef(primary)) {
        watch([primary, fallbacks], ([newPrimary, newFallbacks]) => {
            remaining = [...(newFallbacks ?? [])].filter(Boolean)
            eventSrc.value = newPrimary || remaining.shift() || null
        }, { immediate: true })
    }

    function onError() {
        if (remaining.length) {
            eventSrc.value = remaining.shift()
        } 
    }

    return { eventSrc, onError }
}