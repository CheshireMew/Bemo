import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const MOBILE_MAX = 767;
const TABLET_MAX = 1023;

const viewportWidth = ref(typeof window === 'undefined' ? TABLET_MAX + 1 : window.innerWidth);
let listenersBound = false;
let usageCount = 0;

const updateViewport = () => {
  viewportWidth.value = window.innerWidth;
};

const ensureListeners = () => {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('resize', updateViewport, { passive: true });
};

const teardownListeners = () => {
  if (!listenersBound || typeof window === 'undefined') return;
  listenersBound = false;
  window.removeEventListener('resize', updateViewport);
};

export function useViewport() {
  onMounted(() => {
    usageCount += 1;
    updateViewport();
    ensureListeners();
  });

  onBeforeUnmount(() => {
    usageCount = Math.max(0, usageCount - 1);
    if (usageCount === 0) {
      teardownListeners();
    }
  });

  const isMobile = computed(() => viewportWidth.value <= MOBILE_MAX);
  const isTablet = computed(() => viewportWidth.value > MOBILE_MAX && viewportWidth.value <= TABLET_MAX);

  return {
    viewportWidth,
    isMobile,
    isTablet,
  };
}
