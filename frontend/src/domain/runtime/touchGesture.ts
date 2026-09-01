export type TouchGestureAxis = 'x' | 'y';
export type TouchGestureDirection = 'negative' | 'positive';
export type TouchGestureIntent = 'pending' | 'locked' | 'cancelled';

export type TouchGestureDelta = {
  deltaX: number;
  deltaY: number;
};

export type TouchSwipeCommitInput = {
  distance: number;
  durationMs: number;
  threshold?: number;
  minimumFlingDistance?: number;
  velocityThreshold?: number;
};

export function resolveTouchGestureIntent(
  delta: TouchGestureDelta,
  axis: TouchGestureAxis,
  slop = 8,
): TouchGestureIntent {
  const primary = axis === 'x' ? Math.abs(delta.deltaX) : Math.abs(delta.deltaY);
  const cross = axis === 'x' ? Math.abs(delta.deltaY) : Math.abs(delta.deltaX);

  if (primary < slop && cross < slop) {
    return 'pending';
  }

  return primary > cross ? 'locked' : 'cancelled';
}

export function getTouchGestureDirection(distance: number): TouchGestureDirection {
  return distance < 0 ? 'negative' : 'positive';
}

export function shouldCommitTouchSwipe(input: TouchSwipeCommitInput) {
  const threshold = input.threshold ?? 72;
  const minimumFlingDistance = input.minimumFlingDistance ?? 24;
  const velocityThreshold = input.velocityThreshold ?? 0.55;
  const distance = Math.abs(input.distance);
  const durationMs = Math.max(1, input.durationMs);

  return distance >= threshold
    || (distance >= minimumFlingDistance && distance / durationMs >= velocityThreshold);
}
