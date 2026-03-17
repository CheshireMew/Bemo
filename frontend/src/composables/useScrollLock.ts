import { onBeforeUnmount, watch, type Ref } from 'vue';

let lockCount = 0;
let previousOverflow = '';

const lock = () => {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
};

const unlock = () => {
  if (typeof document === 'undefined' || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
};

export function useScrollLock(source: Ref<boolean>) {
  watch(source, (locked, wasLocked) => {
    if (locked === wasLocked) return;
    if (locked) {
      lock();
      return;
    }
    unlock();
  }, { immediate: true });

  onBeforeUnmount(() => {
    if (source.value) {
      unlock();
    }
  });
}
