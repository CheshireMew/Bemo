import { onBeforeUnmount, readonly, ref, type Ref } from 'vue';

import {
  getTouchGestureDirection,
  resolveTouchGestureIntent,
  shouldCommitTouchSwipe,
  type TouchGestureAxis,
  type TouchGestureDirection,
} from '../domain/runtime/touchGesture.js';

type TouchSwipeOptions = {
  axis: TouchGestureAxis;
  enabled?: Ref<boolean>;
  threshold?: number;
  maxDistance?: number;
  canStart?: (event: PointerEvent) => boolean;
  allowsDirection?: (direction: TouchGestureDirection) => boolean;
  onSwipe: (direction: TouchGestureDirection) => void;
};

function primaryCoordinate(event: PointerEvent, axis: TouchGestureAxis) {
  return axis === 'x' ? event.clientX : event.clientY;
}

function crossCoordinate(event: PointerEvent, axis: TouchGestureAxis) {
  return axis === 'x' ? event.clientY : event.clientX;
}

export function useTouchSwipe(options: TouchSwipeOptions) {
  const offset = ref(0);
  const dragging = ref(false);
  let pointerId: number | null = null;
  let startPrimary = 0;
  let startCross = 0;
  let startedAt = 0;
  let gestureCancelled = false;
  let resetClickTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressNextClick = false;

  const resetGesture = () => {
    pointerId = null;
    offset.value = 0;
    dragging.value = false;
    gestureCancelled = false;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (options.enabled && !options.enabled.value) return;
    if (!event.isPrimary || event.button !== 0 || event.pointerType === 'mouse') return;
    if (options.canStart && !options.canStart(event)) return;

    pointerId = event.pointerId;
    startPrimary = primaryCoordinate(event, options.axis);
    startCross = crossCoordinate(event, options.axis);
    startedAt = performance.now();
    gestureCancelled = false;
    offset.value = 0;
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId || gestureCancelled) return;

    const primaryDelta = primaryCoordinate(event, options.axis) - startPrimary;
    const crossDelta = crossCoordinate(event, options.axis) - startCross;
    if (!dragging.value) {
      const intent = resolveTouchGestureIntent(
        options.axis === 'x'
          ? { deltaX: primaryDelta, deltaY: crossDelta }
          : { deltaX: crossDelta, deltaY: primaryDelta },
        options.axis,
      );
      if (intent === 'pending') return;
      if (intent === 'cancelled') {
        gestureCancelled = true;
        return;
      }
      dragging.value = true;
      try {
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic events and already-cancelled native pointers cannot be captured.
      }
    }

    event.preventDefault();
    const direction = getTouchGestureDirection(primaryDelta);
    const allowed = options.allowsDirection?.(direction) ?? true;
    const resistedDelta = allowed ? primaryDelta : primaryDelta * 0.16;
    const maxDistance = options.maxDistance ?? 120;
    offset.value = Math.max(-maxDistance, Math.min(maxDistance, resistedDelta));
  };

  const finishPointer = (event: PointerEvent, cancelled = false) => {
    if (pointerId !== event.pointerId) return;

    const primaryDelta = primaryCoordinate(event, options.axis) - startPrimary;
    const durationMs = performance.now() - startedAt;
    const direction = getTouchGestureDirection(primaryDelta);
    const allowed = options.allowsDirection?.(direction) ?? true;
    const wasDragging = dragging.value;
    const committed = !cancelled
      && !gestureCancelled
      && wasDragging
      && allowed
      && shouldCommitTouchSwipe({
        distance: primaryDelta,
        durationMs,
        threshold: options.threshold,
      });

    try {
      (event.currentTarget as Element | null)?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released capture after a native scroll.
    }
    resetGesture();

    if (wasDragging && !cancelled) {
      suppressNextClick = true;
      if (resetClickTimer) clearTimeout(resetClickTimer);
      resetClickTimer = setTimeout(() => {
        suppressNextClick = false;
        resetClickTimer = null;
      }, 0);
    }

    if (!committed) return;
    options.onSwipe(direction);
  };

  const handlePointerUp = (event: PointerEvent) => finishPointer(event);
  const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
  const handleClickCapture = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    if (resetClickTimer) {
      clearTimeout(resetClickTimer);
      resetClickTimer = null;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  onBeforeUnmount(() => {
    if (resetClickTimer) clearTimeout(resetClickTimer);
  });

  return {
    offset: readonly(offset),
    dragging: readonly(dragging),
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClickCapture,
  };
}
