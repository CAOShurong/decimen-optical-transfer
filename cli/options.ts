import { parseArgs } from "node:util";

import type { ErrorCorrectionLevel } from "./transfer";

export type Command = "send" | "text" | "trans" | "receiver";

export interface CliOptions {
  command: Command;
  inputs: string[];
  frameBytes: number;
  frameBytesAutomatic: boolean;
  fps: number;
  ecc: ErrorCorrectionLevel;
  margin: number;
  frames?: number;
  name?: string;
  mediaType?: string;
  sessionId?: number;
  dryRun: boolean;
  json: boolean;
  force: boolean;
  plainScreen: boolean;
  invert: boolean;
}

export type ParsedCli =
  | { action: "help" }
  | { action: "version" }
  | { action: "run"; options: CliOptions };

export const HELP = `Decimen terminal sender

Turn a file, stdin, or text into an endless fountain-coded QR stream. Open the
Decimen receiver on a phone, point its camera at this terminal, and the phone
reconstructs the payload without a network connection between the devices.

Usage:
  decimen send <file|-> [options]       Send a file (or binary stdin with -)
  decimen text <message...|-> [options] Send text (or UTF-8 stdin with -)
  decimen trans <path-or-text...>       File if the exact path exists; otherwise text
  decimen receiver                      Print the hosted receiver URL

Transfer options:
  -f, --fps <1..30>          QR frames per second                 [default: 10]
  -b, --frame-bytes <n>      Bytes per QR frame, including header [default: auto]
  -e, --ecc <L|M|Q|H>        QR error correction level            [default: L]
  -m, --margin <0..16>       Quiet-zone modules                   [default: 4]
  -n, --frames <n>           Stop after n frames (default: endless)
      --name <filename>      Override the transmitted filename
      --type <media-type>    Override the transmitted media type
      --session <1..65535>   Fixed session id for reproducible diagnostics

Output options:
      --dry-run              Prepare and measure the transfer without displaying it
      --json                 Emit a machine-readable dry-run plan (implies --dry-run)
      --force                Allow a non-TTY or a terminal smaller than the QR code
      --plain-screen         Do not use the terminal's alternate screen buffer
      --invert               Invert black and white QR modules
  -h, --help                 Show this help
  -v, --version              Show the CLI version

Examples:
  decimen send ./photo.jpg
  git bundle create - --all | decimen send - --name repo.bundle --type application/octet-stream
  decimen text "passwordless handoff note"
  decimen trans README.md --fps 8 --frame-bytes 220
  decimen send firmware.bin --dry-run --json

Security: this is an offline transport, not encryption. Any camera that can see
the terminal can read the payload.`;

export function parseCli(argv: readonly string[]): ParsedCli {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      fps: { type: "string", short: "f" },
      "frame-bytes": { type: "string", short: "b" },
      ecc: { type: "string", short: "e" },
      margin: { type: "string", short: "m" },
      frames: { type: "string", short: "n" },
      name: { type: "string" },
      type: { type: "string" },
      session: { type: "string" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      force: { type: "boolean" },
      "plain-screen": { type: "boolean" },
      invert: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) return { action: "help" };
  if (values.version) return { action: "version" };

  const [rawCommand, ...inputs] = positionals;
  if (!rawCommand) throw new Error("Choose a command: send, text, trans, or receiver.");
  if (!(rawCommand === "send" || rawCommand === "text" || rawCommand === "trans" || rawCommand === "receiver")) {
    throw new Error(`Unknown command ${JSON.stringify(rawCommand)}. Choose send, text, trans, or receiver.`);
  }
  if (rawCommand === "receiver" && inputs.length > 0) {
    throw new Error("The receiver command does not take a path or message.");
  }
  if (rawCommand === "send" && inputs.length !== 1) {
    throw new Error("The send command needs exactly one file path, or - for stdin.");
  }
  if (rawCommand === "trans" && inputs.length === 0) {
    throw new Error("The trans command needs a file path or some text.");
  }

  const ecc = (values.ecc ?? "L").toUpperCase();
  if (!(ecc === "L" || ecc === "M" || ecc === "Q" || ecc === "H")) {
    throw new Error("--ecc must be L, M, Q, or H.");
  }

  return {
    action: "run",
    options: {
      command: rawCommand,
      inputs,
      fps: numberOption("--fps", values.fps, 10, { minimum: 1, maximum: 30 }),
      frameBytes: numberOption("--frame-bytes", values["frame-bytes"], 160, {
        minimum: 21,
        maximum: 2953,
        integer: true,
      }),
      frameBytesAutomatic: values["frame-bytes"] === undefined,
      ecc,
      margin: numberOption("--margin", values.margin, 4, {
        minimum: 0,
        maximum: 16,
        integer: true,
      }),
      frames:
        values.frames === undefined
          ? undefined
          : numberOption("--frames", values.frames, 1, {
              minimum: 1,
              maximum: 0xffffffff,
              integer: true,
            }),
      name: values.name,
      mediaType: values.type,
      sessionId:
        values.session === undefined
          ? undefined
          : numberOption("--session", values.session, 1, {
              minimum: 1,
              maximum: 0xffff,
              integer: true,
            }),
      dryRun: Boolean(values["dry-run"] || values.json),
      json: Boolean(values.json),
      force: Boolean(values.force),
      plainScreen: Boolean(values["plain-screen"]),
      invert: Boolean(values.invert),
    },
  };
}

interface NumberBounds {
  minimum: number;
  maximum: number;
  integer?: boolean;
}

function numberOption(
  name: string,
  value: string | undefined,
  fallback: number,
  bounds: NumberBounds,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (bounds.integer && !Number.isInteger(parsed)) ||
    parsed < bounds.minimum ||
    parsed > bounds.maximum
  ) {
    const kind = bounds.integer ? "an integer" : "a number";
    throw new Error(`${name} must be ${kind} from ${bounds.minimum} to ${bounds.maximum}.`);
  }
  return parsed;
}
