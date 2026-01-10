/**
 * Structured logging module for LedgerRun
 * Minimal implementation using only Node.js built-ins
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_LEVEL_NAMES = {
  0: "DEBUG",
  1: "INFO",
  2: "WARN",
  3: "ERROR",
};

/**
 * Simple structured logger
 */
export class Logger {
  constructor({ level = "INFO", silent = false } = {}) {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    this.silent = silent;
  }

  /**
   * Format a log entry
   */
  _format(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];

    const entry = {
      timestamp,
      level: levelName,
      message,
      ...data,
    };

    return entry;
  }

  /**
   * Write log entry
   */
  _write(level, message, data = {}) {
    if (this.silent || level < this.level) {
      return;
    }

    const entry = this._format(level, message, data);

    // Output as JSON for structured logging
    if (process.env.LOG_FORMAT === "json") {
      console.log(JSON.stringify(entry));
    } else {
      // Human-readable format
      const prefix = `[${entry.timestamp}] [${entry.level}]`;
      console.log(`${prefix} ${entry.message}`);

      // Print additional data if present
      const dataKeys = Object.keys(data);
      if (dataKeys.length > 0) {
        for (const key of dataKeys) {
          console.log(`  ${key}: ${JSON.stringify(data[key])}`);
        }
      }
    }
  }

  debug(message, data = {}) {
    this._write(LOG_LEVELS.DEBUG, message, data);
  }

  info(message, data = {}) {
    this._write(LOG_LEVELS.INFO, message, data);
  }

  warn(message, data = {}) {
    this._write(LOG_LEVELS.WARN, message, data);
  }

  error(message, data = {}) {
    this._write(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * Log an event with structured data
   */
  event(eventName, data = {}) {
    this.info(`Event: ${eventName}`, { event: eventName, ...data });
  }
}

/**
 * Create a logger instance
 */
export function createLogger(options = {}) {
  return new Logger(options);
}
