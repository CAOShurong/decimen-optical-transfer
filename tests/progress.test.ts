import assert from "node:assert/strict";
import test from "node:test";
import { estimateTransferProgress, formatDuration } from "../shared/progress.ts";

test("progress and ETA follow the observed unique-frame rate", () => {
  const progress = estimateTransferProgress(100, 50, 10);
  assert.equal(progress.expectedFrames, 118);
  assert.equal(progress.fraction, 0.43);
  assert.equal(progress.etaSeconds, 13.6);
  assert.equal(progress.phase, "collecting");
});

test("progress keeps moving through redundant frames", () => {
  assert.equal(estimateTransferProgress(100, 2, 4).etaSeconds, undefined);
  assert.equal(estimateTransferProgress(100, 100, 20).fraction, 0.86);
  assert.ok(estimateTransferProgress(100, 110, 21).fraction > 0.91);
  assert.equal(estimateTransferProgress(100, 118, 22).fraction, 0.96);
  assert.ok(estimateTransferProgress(100, 136, 24).fraction > 0.97);
});

test("decoded blocks can advance progress and completion caps at 99%", () => {
  assert.equal(estimateTransferProgress(100, 105, 20, 95).fraction, 0.9405);
  assert.equal(estimateTransferProgress(100, 105, 20, 100).fraction, 0.99);
});

test("durations stay compact and readable", () => {
  assert.equal(formatDuration(12.1), "13s");
  assert.equal(formatDuration(75.1), "1m 16s");
  assert.equal(formatDuration(3_661), "1h 1m");
});
