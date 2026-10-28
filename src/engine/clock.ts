// Session clock: a fixed origin from performance.now(). Ticks are derived from elapsed time,
// never from chained timers, so render or timer jitter can't move a boundary.

import { TICK_MS } from './config';

export class SessionClock {
  readonly origin: number;

  constructor(origin = performance.now()) {
    this.origin = origin;
  }

  /** ms since the origin. */
  now(): number {
    return performance.now() - this.origin;
  }

  /** Convert an event timestamp (same timebase as performance.now) to session time. */
  fromEvent(timeStamp: number): number {
    return timeStamp - this.origin;
  }

  /** Fractional tick position, e.g. 12.4 = 40% through tick 12. */
  tickPosition(): number {
    return this.now() / TICK_MS;
  }
}

/**
 * Calls `fn` on every animation frame, plus on a 50ms interval so boundaries still
 * process when the tab is backgrounded and rAF is throttled.
 */
export function runLoop(fn: () => void): () => void {
  let raf = 0;
  let stopped = false;
  const frame = () => {
    if (stopped) return;
    fn();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const iv = setInterval(fn, 50);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearInterval(iv);
  };
}
