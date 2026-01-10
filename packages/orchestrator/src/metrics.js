/**
 * Metrics tracking for runs
 */

/**
 * Start a timer and return a function to stop it
 * @returns {Function} Stop function that returns duration in ms
 */
export function startTimer() {
  const start = Date.now();

  return function stop() {
    return Date.now() - start;
  };
}

/**
 * Track run metrics
 */
export class RunMetrics {
  constructor() {
    this.startTime = Date.now();
    this.events = [];
  }

  /**
   * Record an event
   */
  event(name, data = {}) {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      ...data,
    });
  }

  /**
   * Get total duration
   */
  getDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * Get summary
   */
  getSummary() {
    return {
      durationMs: this.getDuration(),
      events: this.events,
    };
  }
}
