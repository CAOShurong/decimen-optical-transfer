import { randomInt } from "node:crypto";

import type QRCode from "qrcode";
import QRCodeCore from "qrcode/lib/core/qrcode.js";

import {
  blockLength,
  fitsInOneStream,
  minimumFrameBytes,
  sourceBlockCount,
} from "../shared/frame-capacity";
import { LTEncoder } from "../shared/fountain";
import { expectedFountainOverhead } from "../shared/progress";
import { packSnippet } from "../shared/snippet";
import {
  HEADER_LEN,
  fnv1a,
  packFile,
  packFrame,
  safeFileName,
  type CompressionMode,
  type FrameHeader,
  type PackedOpticalFile,
} from "../shared/protocol";

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export interface TransferSettings {
  frameBytes: number;
  fps: number;
  ecc: ErrorCorrectionLevel;
  sessionId?: number;
}

export interface PreparedTransfer {
  name: string;
  originalSize: number;
  transmittedSize: number;
  compression: CompressionMode;
  payload: Uint8Array;
  encoder: LTEncoder;
  header: FrameHeader;
  frameBytes: number;
  fps: number;
  ecc: ErrorCorrectionLevel;
  qrVersion: number;
  qrModules: number;
  expectedFrames: number;
  estimatedSeconds: number;
}

export async function prepareFileTransfer(
  name: string,
  type: string,
  bytes: Uint8Array,
  settings: TransferSettings,
): Promise<PreparedTransfer> {
  return preparePackedTransfer(safeFileName(name), await packFile(name, type, bytes), settings);
}

export async function prepareSnippetTransfer(
  text: string,
  settings: TransferSettings,
): Promise<PreparedTransfer> {
  return preparePackedTransfer("snippet.txt", await packSnippet(text), settings);
}

async function preparePackedTransfer(
  name: string,
  packed: PackedOpticalFile,
  settings: TransferSettings,
): Promise<PreparedTransfer> {
  validateSettings(settings);
  const payload = packed.container;
  if (!fitsInOneStream(payload.length, settings.frameBytes)) {
    const minimum = minimumFrameBytes(payload.length);
    throw new Error(
      `${payload.length.toLocaleString()} transmitted bytes need ${sourceBlockCount(payload.length, settings.frameBytes).toLocaleString()} source blocks at ${settings.frameBytes} bytes per frame. Raise --frame-bytes to at least ${minimum}.`,
    );
  }
  const sessionId = settings.sessionId ?? randomInt(1, 0x10000);
  const encoder = new LTEncoder(payload, blockLength(settings.frameBytes), sessionId);
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen: encoder.blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };
  const first = createQr(packFrame(header, encoder.encode(0)), settings.ecc);
  const expectedFrames = Math.max(
    encoder.k + 1,
    Math.ceil(encoder.k * expectedFountainOverhead(encoder.k)),
  );
  return {
    name,
    originalSize: packed.originalSize,
    transmittedSize: packed.transmittedSize,
    compression: packed.compression,
    payload,
    encoder,
    header,
    frameBytes: settings.frameBytes,
    fps: settings.fps,
    ecc: settings.ecc,
    qrVersion: first.version,
    qrModules: first.modules.size,
    expectedFrames,
    estimatedSeconds: expectedFrames / settings.fps,
  };
}

export function wireFrame(transfer: PreparedTransfer, sequence: number): Uint8Array {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff) {
    throw new Error("Frame sequence must be a uint32 value.");
  }
  return packFrame(
    { ...transfer.header, seq: sequence },
    transfer.encoder.encode(sequence),
  );
}

export function qrFrame(transfer: PreparedTransfer, sequence: number): QRCode.QRCode {
  return createQr(wireFrame(transfer, sequence), transfer.ecc, transfer.qrVersion);
}

export function qrShapeForFrameBytes(
  frameBytes: number,
  ecc: ErrorCorrectionLevel,
): { version: number; modules: number } {
  if (!Number.isInteger(frameBytes) || frameBytes <= HEADER_LEN || frameBytes > 2953) {
    throw new Error(`Frame bytes must be an integer from ${HEADER_LEN + 1} to 2953.`);
  }
  const qr = createQr(new Uint8Array(frameBytes), ecc);
  return { version: qr.version, modules: qr.modules.size };
}

function createQr(
  bytes: Uint8Array,
  ecc: ErrorCorrectionLevel,
  version?: number,
): QRCode.QRCode {
  try {
    return QRCodeCore.create([{ data: bytes, mode: "byte" }], {
      errorCorrectionLevel: ecc,
      maskPattern: 4,
      ...(version === undefined ? {} : { version }),
    });
  } catch (error) {
    throw new Error(
      `The selected frame size does not fit a QR code at ECC ${ecc}. Reduce --frame-bytes or choose a lower ECC level.`,
      { cause: error },
    );
  }
}

function validateSettings(settings: TransferSettings): void {
  if (
    !Number.isInteger(settings.frameBytes) ||
    settings.frameBytes <= HEADER_LEN ||
    settings.frameBytes > 2953
  ) {
    throw new Error(`--frame-bytes must be an integer from ${HEADER_LEN + 1} to 2953.`);
  }
  if (!Number.isFinite(settings.fps) || settings.fps < 1 || settings.fps > 30) {
    throw new Error("--fps must be between 1 and 30.");
  }
  if (!(["L", "M", "Q", "H"] as const).includes(settings.ecc)) {
    throw new Error("--ecc must be L, M, Q, or H.");
  }
  if (
    settings.sessionId !== undefined &&
    (!Number.isInteger(settings.sessionId) || settings.sessionId < 1 || settings.sessionId > 0xffff)
  ) {
    throw new Error("Session id must be an integer from 1 to 65535.");
  }
}
