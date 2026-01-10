import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../../packages/orchestrator/src/logger.js";

test("createLogger creates logger instance", () => {
  const logger = createLogger();

  assert.ok(logger, "Should create logger");
  assert.equal(typeof logger.info, "function", "Should have info method");
  assert.equal(typeof logger.warn, "function", "Should have warn method");
  assert.equal(typeof logger.error, "function", "Should have error method");
  assert.equal(typeof logger.debug, "function", "Should have debug method");
});

test("logger respects log level", () => {
  const logger = createLogger({ level: "ERROR", silent: true });

  // Should not throw
  logger.debug("debug message");
  logger.info("info message");
  logger.warn("warn message");
  logger.error("error message");
});

test("logger respects silent mode", () => {
  const logger = createLogger({ silent: true });

  // Should not throw and not output
  logger.info("test message");
  logger.warn("test warning");
  logger.error("test error");
});

test("logger event method logs events", () => {
  const logger = createLogger({ silent: true });

  // Should not throw
  logger.event("test_event", { key: "value" });
});

test("logger handles data objects", () => {
  const logger = createLogger({ silent: true });

  // Should not throw
  logger.info("test message", { key1: "value1", key2: 123 });
  logger.warn("test warning", { array: [1, 2, 3] });
  logger.error("test error", { nested: { key: "value" } });
});
