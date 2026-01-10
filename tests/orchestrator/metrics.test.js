import test from "node:test";
import assert from "node:assert/strict";
import { startTimer, RunMetrics } from "../../packages/orchestrator/src/metrics.js";

test("startTimer returns duration", async () => {
  const stop = startTimer();

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 10));

  const duration = stop();

  assert.ok(duration >= 10, "Should return duration >= 10ms");
  assert.equal(typeof duration, "number", "Should return number");
});

test("RunMetrics tracks events", () => {
  const metrics = new RunMetrics();

  metrics.event("test_event_1", { key: "value1" });
  metrics.event("test_event_2", { key: "value2" });

  const summary = metrics.getSummary();

  assert.ok(summary.events, "Should have events");
  assert.equal(summary.events.length, 2, "Should have 2 events");
  assert.equal(summary.events[0].name, "test_event_1", "Should track first event");
  assert.equal(summary.events[1].name, "test_event_2", "Should track second event");
});

test("RunMetrics tracks duration", async () => {
  const metrics = new RunMetrics();

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 10));

  const duration = metrics.getDuration();

  assert.ok(duration >= 0, "Should track duration >= 0ms");
  assert.equal(typeof duration, "number", "Should return number");
});

test("RunMetrics getSummary includes events and duration", () => {
  const metrics = new RunMetrics();

  metrics.event("event1");
  metrics.event("event2");

  const summary = metrics.getSummary();

  assert.ok(summary.durationMs !== undefined, "Should have duration");
  assert.ok(summary.events, "Should have events");
  assert.equal(summary.events.length, 2, "Should have 2 events");
  assert.equal(typeof summary.durationMs, "number", "Duration should be number");
});

test("RunMetrics events include elapsed time", async () => {
  const metrics = new RunMetrics();

  metrics.event("event1");
  await new Promise(resolve => setTimeout(resolve, 10));
  metrics.event("event2");

  const summary = metrics.getSummary();

  assert.ok(summary.events[0].elapsed >= 0, "First event should have elapsed time");
  assert.ok(summary.events[1].elapsed >= 10, "Second event should have elapsed time >= 10ms");
  assert.ok(summary.events[1].elapsed > summary.events[0].elapsed, "Second event should be later");
});
