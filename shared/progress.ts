export const EXPECTED_FOUNTAIN_OVERHEAD = 1.18;

export interface TransferProgressEstimate {
  fraction: number;
  minimumFrames: number;
  etaSeconds?: number;
  finishing: boolean;
}

export function estimateTransferProgress(
  sourceBlocks: number,
  uniqueFrames: number,
  elapsedSeconds: number,
): TransferProgressEstimate {
  // K source blocks is the only hard milestone: recovery cannot complete
  // before K independent frames, but fountain overhead varies per stream.
  // Fill toward K, then hold at 99% until the decoder actually completes.
  const minimumFrames = Math.max(1, sourceBlocks);
  const finishing = uniqueFrames >= minimumFrames;
  const fraction = finishing ? 0.99 : Math.min(0.99, uniqueFrames / minimumFrames);
  const rate = elapsedSeconds > 0 ? uniqueFrames / elapsedSeconds : 0;
  const etaSeconds =
    uniqueFrames >= 3 && elapsedSeconds >= 1 && rate > 0 && !finishing
      ? (minimumFrames - uniqueFrames) / rate
      : undefined;
  return { fraction, minimumFrames, etaSeconds, finishing };
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
