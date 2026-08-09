import { qrShapeForFrameBytes, type ErrorCorrectionLevel } from "./transfer";

/**
 * Pick the densest frame that still fits the current terminal. QR footprint is
 * monotonic in byte length, so a small binary search avoids a brittle table of
 * QR-version capacities. The cap keeps automatic mode camera-friendly; an
 * explicit --frame-bytes may go all the way to QR version 40.
 */
export function automaticFrameBytes(
  columns: number | undefined,
  rows: number | undefined,
  ecc: ErrorCorrectionLevel,
  margin: number,
  maximum = 500,
): number {
  if (!columns || !rows || columns < 1 || rows < 1) return 160;
  let low = 21;
  let high = maximum;
  let best = 0;
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    let fits = false;
    try {
      const shape = qrShapeForFrameBytes(candidate, ecc);
      const side = shape.modules + margin * 2;
      const requiredRows = Math.ceil(side / 2) + 3;
      fits = side <= columns && requiredRows <= rows;
    } catch {
      fits = false;
    }
    if (fits) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }
  if (best === 0) {
    throw new Error(
      `The terminal is too small for even the smallest QR code (${columns} x ${rows}). Enlarge it or use --force.`,
    );
  }
  return best;
}
