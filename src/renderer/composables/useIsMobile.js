import { ref } from 'vue';

export const MOBILE_QUERY = '(max-width: 640px)';

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
const isMobile = ref(query?.matches ?? false);

query?.addEventListener('change', (event) => {
    isMobile.value = event.matches;
});

export const useIsMobile = () => ({ isMobile });
