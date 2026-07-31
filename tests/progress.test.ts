import assert from "node:assert/strict";
import test from "node:test";
import { estimateTransferProgress, formatDuration } from "../shared/progress.ts";

test("progress and ETA follow the observed unique-frame rate", () => {
  const progress = estimateTransferProgress(100, 59, 10);
  assert.equal(progress.targetFrames, 118);
  assert.equal(progress.fraction, 0.5);
  assert.equal(progress.etaSeconds, 10);
  assert.equal(progress.finishing, false);
});

test("ETA waits for enough samples and caps incomplete recovery at 99%", () => {
  assert.equal(estimateTransferProgress(100, 2, 4).etaSeconds, undefined);
  const finishing = estimateTransferProgress(100, 118, 20);
  assert.equal(finishing.fraction, 0.99);
  assert.equal(finishing.finishing, true);
});

test("durations stay compact and readable", () => {
  assert.equal(formatDuration(12.1), "13s");
  assert.equal(formatDuration(75.1), "1m 16s");
  assert.equal(formatDuration(3_661), "1h 1m");
});
