import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import { stdin, stdout } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { inferMediaType } from "./mime";
import { automaticFrameBytes } from "./fit";
import { HELP, parseCli, type CliOptions } from "./options";
import { renderTerminalQr } from "./terminal";
import { terminalSafeText } from "./safety";
import {
  prepareFileTransfer,
  prepareSnippetTransfer,
  qrFrame,
  type PreparedTransfer,
} from "./transfer";
import { formatDuration } from "../shared/progress";
import { MAX_FILE_BYTES } from "../shared/protocol";
import { MAX_SNIPPET_BYTES } from "../shared/snippet";

declare const __DECIMEN_VERSION__: string;

export const RECEIVER_URL = "https://caoshurong.github.io/decimen-optical-transfer/receive/";

interface LoadedTransfer {
  transfer: PreparedTransfer;
  source: "file" | "stdin" | "text";
}

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.action === "help") {
    stdout.write(`${HELP}\n`);
    return;
  }
  if (parsed.action === "version") {
    stdout.write(`${__DECIMEN_VERSION__}\n`);
    return;
  }
  if (parsed.options.command === "receiver") {
    stdout.write(`${RECEIVER_URL}\n`);
    return;
  }

  const options = {
    ...parsed.options,
    frameBytes:
      parsed.options.frameBytesAutomatic && stdout.isTTY && !parsed.options.force
        ? automaticFrameBytes(
            stdout.columns,
            stdout.rows,
            parsed.options.ecc,
            parsed.options.margin,
          )
        : parsed.options.frameBytes,
  };
  const loaded = await loadTransfer(options);
  const firstQr = renderTerminalQr(
    qrFrame(loaded.transfer, 0).modules,
    options.margin,
    options.invert,
  );
  const plan = transferPlan(loaded, options, firstQr.columns, firstQr.rows);

  if (options.dryRun) {
    stdout.write(options.json ? `${JSON.stringify(plan, null, 2)}\n` : humanPlan(plan));
    return;
  }

  validateTerminal(firstQr.columns, firstQr.rows, options);
  await displayFrames(loaded.transfer, options);
}

async function loadTransfer(options: CliOptions): Promise<LoadedTransfer> {
  const settings = {
    frameBytes: options.frameBytes,
    fps: options.fps,
    ecc: options.ecc,
    sessionId: options.sessionId,
  };

  if (options.command === "send") {
    const input = options.inputs[0]!;
    if (input === "-") {
      const bytes = await readStdin(MAX_FILE_BYTES);
      const name = options.name ?? "stdin.bin";
      return {
        source: "stdin",
        transfer: await prepareFileTransfer(
          name,
          options.mediaType ?? inferMediaType(name),
          bytes,
          settings,
        ),
      };
    }
    return loadFile(input, options, settings);
  }

  if (options.command === "trans" && options.inputs.length === 1 && options.inputs[0] !== "-") {
    if (await isFile(options.inputs[0]!)) return loadFile(options.inputs[0]!, options, settings);
  }

  const text =
    options.inputs.length === 0 || (options.inputs.length === 1 && options.inputs[0] === "-")
      ? decodeUtf8(await readStdin(MAX_SNIPPET_BYTES))
      : options.inputs.join(" ");
  return {
    source: options.inputs.length === 0 || options.inputs[0] === "-" ? "stdin" : "text",
    transfer: await prepareSnippetTransfer(text, settings),
  };
}

async function loadFile(
  path: string,
  options: CliOptions,
  settings: Parameters<typeof prepareFileTransfer>[3],
): Promise<LoadedTransfer> {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    throw fileSystemError("inspect", path, error);
  }
  if (!info.isFile()) throw new Error(`${JSON.stringify(path)} is not a regular file.`);
  if (info.size === 0) throw new Error("Choose a non-empty file.");
  if (info.size > MAX_FILE_BYTES) throw new Error("Files are limited to 64 MB.");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch (error) {
    throw fileSystemError("read", path, error);
  }
  const name = options.name ?? basename(path);
  return {
    source: "file",
    transfer: await prepareFileTransfer(
      name,
      options.mediaType ?? inferMediaType(name),
      bytes,
      settings,
    ),
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw fileSystemError("inspect", path, error);
  }
}

function fileSystemError(action: string, path: string, error: unknown): Error {
  const code = (error as NodeJS.ErrnoException).code;
  return new Error(`Cannot ${action} ${JSON.stringify(path)}${code ? ` (${code})` : ""}.`);
}

async function readStdin(limit: number): Promise<Uint8Array> {
  if (stdin.isTTY) throw new Error("No piped input is available on stdin.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const raw of stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    total += chunk.length;
    if (total > limit) throw new Error(`Piped input exceeds the ${formatBytes(limit)} limit.`);
    chunks.push(chunk);
  }
  if (total === 0) throw new Error("Piped input is empty.");
  return new Uint8Array(Buffer.concat(chunks, total));
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Text input from stdin is not valid UTF-8.");
  }
}

interface TransferPlan {
  source: LoadedTransfer["source"];
  name: string;
  originalBytes: number;
  dataBytesAfterCompression: number;
  containerBytes: number;
  compression: string;
  compressionRatio: number;
  sessionId: number;
  frameBytes: number;
  frameBytesSelection: "automatic" | "explicit";
  payloadBytesPerFrame: number;
  sourceBlocks: number;
  expectedFrames: number;
  fps: number;
  estimatedPerfectCaptureSeconds: number;
  qr: { version: number; modules: number; ecc: string; columns: number; rows: number };
  receiver: string;
  warning: string;
}

function transferPlan(
  loaded: LoadedTransfer,
  options: CliOptions,
  columns: number,
  rows: number,
): TransferPlan {
  const transfer = loaded.transfer;
  return {
    source: loaded.source,
    name: transfer.name,
    originalBytes: transfer.originalSize,
    dataBytesAfterCompression: transfer.transmittedSize,
    containerBytes: transfer.payload.length,
    compression: transfer.compression,
    compressionRatio: transfer.transmittedSize / transfer.originalSize,
    sessionId: transfer.header.sessionId,
    frameBytes: transfer.frameBytes,
    frameBytesSelection: options.frameBytesAutomatic ? "automatic" : "explicit",
    payloadBytesPerFrame: transfer.header.blockLen,
    sourceBlocks: transfer.encoder.k,
    expectedFrames: transfer.expectedFrames,
    fps: transfer.fps,
    estimatedPerfectCaptureSeconds: transfer.estimatedSeconds,
    qr: {
      version: transfer.qrVersion,
      modules: transfer.qrModules,
      ecc: transfer.ecc,
      columns,
      rows,
    },
    receiver: RECEIVER_URL,
    warning: "Offline transport is not encryption; every camera with a view of the QR stream can read it.",
  };
}

function humanPlan(plan: TransferPlan): string {
  return [
    `File:            ${plan.name}`,
    `Original:        ${formatBytes(plan.originalBytes)}`,
    `On the wire:     ${formatBytes(plan.containerBytes)} (${plan.compression}, data ratio ${(plan.compressionRatio * 100).toFixed(1)}%)`,
    `Fountain blocks: ${plan.sourceBlocks.toLocaleString()} x ${plan.payloadBytesPerFrame} bytes`,
    `QR:              version ${plan.qr.version}, ECC ${plan.qr.ecc}, ${plan.qr.columns} x ${plan.qr.rows} terminal cells`,
    `Nominal capture: ${plan.expectedFrames.toLocaleString()} frames, ${formatDuration(plan.estimatedPerfectCaptureSeconds)} at ${plan.fps} fps`,
    `Receiver:        ${plan.receiver}`,
    "Warning:         offline does not mean encrypted; keep other cameras away.",
    "",
  ].join("\n");
}

function validateTerminal(qrColumns: number, qrRows: number, options: CliOptions): void {
  if (!stdout.isTTY) {
    if (!options.force) {
      throw new Error("QR animation needs an interactive terminal. Use --dry-run, or --force with --frames for captured output.");
    }
    if (options.frames === undefined) {
      throw new Error("A non-interactive --force run also needs --frames so it cannot write forever.");
    }
    return;
  }
  const requiredRows = qrRows + 3;
  if (
    !options.force &&
    ((stdout.columns !== undefined && stdout.columns < qrColumns) ||
      (stdout.rows !== undefined && stdout.rows < requiredRows))
  ) {
    throw new Error(
      `This QR needs ${qrColumns} columns x ${requiredRows} rows, but the terminal is ${stdout.columns ?? "?"} x ${stdout.rows ?? "?"}. Enlarge it or reduce --frame-bytes.`,
    );
  }
}

async function displayFrames(transfer: PreparedTransfer, options: CliOptions): Promise<void> {
  let interrupted = false;
  const stop = (): void => {
    interrupted = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const tty = Boolean(stdout.isTTY);
  const alternate = tty && !options.plainScreen;
  if (alternate) stdout.write("\u001b[?1049h");
  if (tty) stdout.write("\u001b[?25l\u001b[2J");

  try {
    const interval = 1000 / transfer.fps;
    for (let frame = 0; !interrupted && (options.frames === undefined || frame < options.frames); frame++) {
      const started = performance.now();
      const sequence = frame >>> 0;
      const rendered = renderTerminalQr(
        qrFrame(transfer, sequence).modules,
        options.margin,
        options.invert,
      );
      const status = `${transfer.name}  |  frame ${frame + 1}  |  ${transfer.encoder.k.toLocaleString()} source blocks  |  ${transfer.fps} fps`;
      const instructions = `Receive: ${RECEIVER_URL}  |  Ctrl+C to stop`;
      if (tty) {
        stdout.write(`\u001b[H${rendered.text}\n\u001b[0m${status}\u001b[K\n${instructions}\u001b[K\u001b[J`);
      } else {
        stdout.write(`Frame ${frame + 1}\n${rendered.text}\n\u001b[0m${status}\n${instructions}\n\n`);
      }
      const remaining = interval - (performance.now() - started);
      if (remaining > 0 && !interrupted && (options.frames === undefined || frame + 1 < options.frames)) {
        await delay(remaining);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    if (tty) stdout.write("\u001b[0m\u001b[?25h");
    if (alternate) stdout.write("\u001b[?1049l");
    else if (tty) stdout.write("\n");
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i]!;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

main().catch((error: unknown) => {
  const message = terminalSafeText(error instanceof Error ? error.message : String(error));
  process.stderr.write(`decimen: ${message}\nRun decimen --help for usage.\n`);
  process.exitCode = 1;
});
