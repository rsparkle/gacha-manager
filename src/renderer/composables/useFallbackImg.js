import { ref, watch, isRef } from 'vue'

export function useFallbackImg(primary, fallbacks = []) {
    const eventSrc = ref(isRef(primary) ? primary.value : primary)
    let remaining = []

    if (isRef(primary)) {
        watch([primary, fallbacks], ([newPrimary, newFallbacks]) => {
            remaining = [...(newFallbacks ?? [])]
            eventSrc.value = newPrimary
        })
    }

    function onError() {
        if (remaining.length) {
            eventSrc.value = remaining.shift()
        } 
    }

    return { eventSrc, onError }
}