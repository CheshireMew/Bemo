import assert from 'node:assert/strict';

import {
  getTouchGestureDirection,
  resolveTouchGestureIntent,
  shouldCommitTouchSwipe,
} from '../src/domain/runtime/touchGesture.js';

assert.equal(resolveTouchGestureIntent({ deltaX: 5, deltaY: 4 }, 'x'), 'pending');
assert.equal(resolveTouchGestureIntent({ deltaX: -18, deltaY: 6 }, 'x'), 'locked');
assert.equal(resolveTouchGestureIntent({ deltaX: 7, deltaY: 22 }, 'x'), 'cancelled');
assert.equal(resolveTouchGestureIntent({ deltaX: 5, deltaY: 20 }, 'y'), 'locked');
assert.equal(resolveTouchGestureIntent({ deltaX: 24, deltaY: 9 }, 'y'), 'cancelled');

assert.equal(getTouchGestureDirection(-1), 'negative');
assert.equal(getTouchGestureDirection(0), 'positive');
assert.equal(getTouchGestureDirection(1), 'positive');

assert.equal(shouldCommitTouchSwipe({ distance: 72, durationMs: 800 }), true);
assert.equal(shouldCommitTouchSwipe({ distance: 35, durationMs: 50 }), true);
assert.equal(shouldCommitTouchSwipe({ distance: 35, durationMs: 500 }), false);
assert.equal(shouldCommitTouchSwipe({ distance: 15, durationMs: 10 }), false);
assert.equal(shouldCommitTouchSwipe({ distance: -80, durationMs: 1000 }), true);

console.log('touchGesture.spec passed');
