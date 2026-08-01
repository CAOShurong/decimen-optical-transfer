export const EXPECTED_FOUNTAIN_OVERHEAD = 1.18;

export interface TransferProgressEstimate {
  fraction: number;
  expectedFrames: number;
  etaSeconds?: number;
  phase: "collecting" | "decoding";
}

export function estimateTransferProgress(
  sourceBlocks: number,
  uniqueFrames: number,
  elapsedSeconds: number,
  solvedBlocks = 0,
): TransferProgressEstimate {
  const minimumFrames = Math.max(1, sourceBlocks);
  const expectedFrames = Math.max(
    minimumFrames + 1,
    Math.ceil(minimumFrames * EXPECTED_FOUNTAIN_OVERHEAD),
  );
  const expectedRedundancy = expectedFrames - minimumFrames;

  // Frames drive a continuously moving baseline: 0–86% while collecting the
  // theoretical minimum, 86–96% through the expected redundancy, then an
  // asymptotic 96–99% if this particular stream needs more. Actual decoded
  // blocks can move the bar further ahead at any time.
  let frameFraction: number;
  if (uniqueFrames < minimumFrames) {
    frameFraction = 0.86 * (uniqueFrames / minimumFrames);
  } else if (uniqueFrames <= expectedFrames) {
    frameFraction =
      0.86 + 0.1 * ((uniqueFrames - minimumFrames) / expectedRedundancy);
  } else {
    const extra = (uniqueFrames - expectedFrames) / expectedRedundancy;
    frameFraction = 0.96 + 0.03 * (1 - Math.exp(-extra));
  }
  const decodedFraction = 0.99 * Math.min(1, solvedBlocks / minimumFrames);
  const fraction = Math.min(0.99, Math.max(frameFraction, decodedFraction));
  const phase = uniqueFrames < minimumFrames ? "collecting" : "decoding";
  const rate = elapsedSeconds > 0 ? uniqueFrames / elapsedSeconds : 0;

  // Past the expected frame count the stream is running long — poor light,
  // motion blur, a camera that won't hold focus. That is exactly when someone
  // is staring at the bar wondering whether it has stalled, so keep quoting a
  // time instead of going silent: extend the target one redundancy block at a
  // time. The estimate steps up when a step is missed, which is honest about
  // the transfer taking longer than the fountain's nominal overhead predicts.
  const overshoot = uniqueFrames - expectedFrames;
  const target =
    overshoot < 0
      ? expectedFrames
      : expectedFrames + expectedRedundancy * (Math.floor(overshoot / expectedRedundancy) + 1);
  const etaSeconds =
    uniqueFrames >= 3 && elapsedSeconds >= 1 && rate > 0
      ? (target - uniqueFrames) / rate
      : undefined;
  return { fraction, expectedFrames, etaSeconds, phase };
}

export function formatDuration(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (minutes < 60) return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
