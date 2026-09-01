import type { ObjectDirective } from 'vue';
import { attachModalFocus } from '../utils/modalFocus';

const cleanup = new WeakMap<HTMLElement, () => void>();
const previous = new WeakMap<HTMLElement, HTMLElement | null>();
export const vModalFocus: ObjectDirective<HTMLElement, () => void> = {
  beforeMount(element) { previous.set(element, document.activeElement as HTMLElement | null); },
  mounted(element, binding) { cleanup.set(element, attachModalFocus(element, binding.value, previous.get(element))); },
  beforeUnmount(element) { cleanup.get(element)?.(); cleanup.delete(element); previous.delete(element); },
};
