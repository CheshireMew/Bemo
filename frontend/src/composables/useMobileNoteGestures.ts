import { computed, onBeforeUnmount, readonly, ref, watch, type Ref } from 'vue';
import { resolveTouchGestureIntent } from '../domain/runtime/touchGesture';

const MOVE_TOLERANCE = 8;
const SWIPE_THRESHOLD = 72;
const MAX_SWIPE_OFFSET = 112;
const LONG_PRESS_DELAY = 500;
const DOUBLE_TAP_DELAY = 300;
const DOUBLE_TAP_DISTANCE = 24;
const INTERACTIVE_TARGETS = 'button, a, input, textarea, select, audio, video, iframe, [role="button"], [contenteditable="true"]';

type Options = {
  enabled: Ref<boolean>;
  onEdit: () => void;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
};

export function useMobileNoteGestures(options: Options) {
  const offset = ref(0);
  const dragging = ref(false);
  const ready = computed(() => Math.abs(offset.value) >= SWIPE_THRESHOLD);
  let pointer: {
    id: number;
    x: number;
    y: number;
    startedAt: number;
    isText: boolean;
    moved: boolean;
    cancelled: boolean;
    copied: boolean;
    element: Element | null;
  } | null = null;
  let lastTap: { x: number; y: number; time: number } | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressClickUntil = 0;

  const isTextTarget = (target: EventTarget | null) => target instanceof Element
    && !!target.closest('.note-body')
    && !target.closest(INTERACTIVE_TARGETS);

  const clearLongPress = () => {
    if (longPressTimer !== null) clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  const resetPointer = () => {
    clearLongPress();
    const current = pointer;
    pointer = null;
    offset.value = 0;
    dragging.value = false;
    if (current) {
      try {
        if (current.element?.hasPointerCapture(current.id)) {
          current.element.releasePointerCapture(current.id);
        }
      } catch {
        // A native scroll may already have released the pointer.
      }
    }
  };

  const cancelGesture = () => {
    lastTap = null;
    resetPointer();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    if (!event.isPrimary) {
      cancelGesture();
      return;
    }
    if (!options.enabled.value || event.button !== 0) return;
    if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_TARGETS)) {
      lastTap = null;
      return;
    }

    resetPointer();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      isText: isTextTarget(event.target),
      moved: false,
      cancelled: false,
      copied: false,
      element: event.currentTarget instanceof Element ? event.currentTarget : null,
    };

    if (!pointer.isText) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!pointer || pointer.moved || pointer.cancelled || !options.enabled.value) return;
      pointer.copied = true;
      lastTap = null;
      suppressClickUntil = performance.now() + 700;
      options.onCopy();
    }, LONG_PRESS_DELAY);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId || pointer.cancelled) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (Math.hypot(deltaX, deltaY) >= MOVE_TOLERANCE) {
      pointer.moved = true;
      clearLongPress();
      lastTap = null;
    }
    if (pointer.copied) return;

    if (!dragging.value) {
      const intent = resolveTouchGestureIntent({ deltaX, deltaY }, 'x', MOVE_TOLERANCE);
      if (intent === 'pending') return;
      if (intent === 'cancelled') {
        pointer.cancelled = true;
        return;
      }
      dragging.value = true;
      try {
        pointer.element?.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic test events have no native pointer to capture.
      }
    }
    event.preventDefault();
    offset.value = Math.max(-MAX_SWIPE_OFFSET, Math.min(MAX_SWIPE_OFFSET, deltaX));
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const current = pointer;
    const deltaX = event.clientX - current.x;
    const deltaY = event.clientY - current.y;
    const wasDragging = dragging.value;
    const now = performance.now();
    const commitSwipe = options.enabled.value && !current.cancelled && !current.copied
      && wasDragging && Math.abs(deltaX) >= SWIPE_THRESHOLD;
    resetPointer();

    if (wasDragging || current.copied) {
      event.preventDefault();
      lastTap = null;
      suppressClickUntil = now + 700;
      if (commitSwipe) {
        if (deltaX < 0) options.onPin();
        else options.onDelete();
      }
      return;
    }
    if (!options.enabled.value || current.cancelled || current.moved || !current.isText
      || Math.hypot(deltaX, deltaY) >= MOVE_TOLERANCE
      || now - current.startedAt > DOUBLE_TAP_DELAY) {
      lastTap = null;
      return;
    }

    if (lastTap && now - lastTap.time <= DOUBLE_TAP_DELAY
      && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= DOUBLE_TAP_DISTANCE) {
      lastTap = null;
      suppressClickUntil = now + 700;
      event.preventDefault();
      options.onEdit();
    } else {
      lastTap = { x: event.clientX, y: event.clientY, time: now };
    }
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId) cancelGesture();
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    // Transferring implicit capture from a paragraph to the card also emits this event.
    if (event.target === event.currentTarget) handlePointerCancel(event);
  };

  const handleClickCapture = (event: MouseEvent) => {
    if (performance.now() >= suppressClickUntil || event.detail === 0) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_TARGETS)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickUntil = 0;
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (options.enabled.value && isTextTarget(event.target)) event.preventDefault();
  };

  watch(options.enabled, enabled => {
    if (!enabled) cancelGesture();
  });
  onBeforeUnmount(cancelGesture);

  return {
    offset: readonly(offset),
    dragging: readonly(dragging),
    ready,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    handleClickCapture,
    handleContextMenu,
  };
}
