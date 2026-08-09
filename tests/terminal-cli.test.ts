import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

import { inferMediaType } from "../cli/mime.ts";
import { automaticFrameBytes } from "../cli/fit.ts";
import { parseCli } from "../cli/options.ts";
import { terminalSafeText } from "../cli/safety.ts";
import { renderTerminalQr } from "../cli/terminal.ts";
import {
  prepareFileTransfer,
  prepareSnippetTransfer,
  qrFrame,
  wireFrame,
} from "../cli/transfer.ts";
import { LTDecoder } from "../shared/fountain.ts";
import { parseFrame, unpackFile, verifyFile } from "../shared/protocol.ts";

test("CLI options have terminal-safe defaults and parse advanced controls", () => {
  const parsed = parseCli([
    "send",
    "payload.bin",
    "--fps",
    "7.5",
    "--frame-bytes",
    "220",
    "--ecc",
    "m",
    "--margin",
    "2",
    "--frames",
    "9",
    "--session",
    "4242",
    "--plain-screen",
  ]);
  assert.equal(parsed.action, "run");
  if (parsed.action !== "run") return;
  assert.deepEqual(parsed.options, {
    command: "send",
    inputs: ["payload.bin"],
    frameBytes: 220,
    frameBytesAutomatic: false,
    fps: 7.5,
    ecc: "M",
    margin: 2,
    frames: 9,
    name: undefined,
    mediaType: undefined,
    sessionId: 4242,
    dryRun: false,
    json: false,
    force: false,
    plainScreen: true,
    invert: false,
  });
});

test("--json implies a dry run and receiver has no payload", () => {
  const json = parseCli(["text", "hello", "--json"]);
  assert.equal(json.action, "run");
  if (json.action === "run") {
    assert.equal(json.options.dryRun, true);
    assert.equal(json.options.json, true);
  }
  assert.throws(() => parseCli(["receiver", "extra"]), /does not take/);
});

test("CLI rejects ambiguous or unsafe numeric input early", () => {
  assert.throws(() => parseCli([]), /Choose a command/);
  assert.throws(() => parseCli(["send"]), /exactly one/);
  assert.throws(() => parseCli(["send", "a", "b"]), /exactly one/);
  assert.throws(() => parseCli(["text", "hello", "--fps", "0"]), /--fps/);
  assert.throws(() => parseCli(["text", "hello", "--frames", "1.5"]), /integer/);
  assert.throws(() => parseCli(["text", "hello", "--ecc", "Z"]), /--ecc/);
});

test("common file extensions preserve useful media types", () => {
  assert.equal(inferMediaType("report.PDF"), "application/pdf");
  assert.equal(inferMediaType("photo.jpeg"), "image/jpeg");
  assert.equal(inferMediaType("archive.unknown"), "application/octet-stream");
});

test("diagnostic text cannot inject terminal control sequences", () => {
  assert.equal(terminalSafeText("bad\u001b[2J\nname\u009b"), "bad\\x1b[2J\\x0aname\\x9b");
});

test("automatic frames fill a terminal without overflowing it", () => {
  const classic = automaticFrameBytes(80, 24, "L", 4);
  const roomy = automaticFrameBytes(120, 40, "L", 4);
  assert.ok(classic >= 70 && classic < 100, `unexpected 80x24 choice ${classic}`);
  assert.ok(roomy > classic, `a larger terminal should carry more than ${classic} bytes`);
  assert.equal(automaticFrameBytes(undefined, undefined, "L", 4), 160);
  assert.throws(() => automaticFrameBytes(10, 10, "L", 4), /too small/);
});

test("terminal QR rendering halves rows and includes the quiet zone", () => {
  const modules = {
    size: 3,
    data: Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 0, 1]),
  };
  const rendered = renderTerminalQr(modules, 2);
  assert.equal(rendered.columns, 7);
  assert.equal(rendered.rows, 4);
  assert.equal(rendered.text.split("\n").length, 4);
  assert.match(rendered.text, /\u001b\[40m|\u001b\[30;47m/);
  assert.ok(rendered.text.split("\n").every((line) => line.endsWith("\u001b[0m")));
});

test("terminal sender frames decode through the browser receiver protocol", async () => {
  const source = new TextEncoder().encode("air-gapped terminal payload\n".repeat(300));
  const transfer = await prepareFileTransfer("../notes\u001b[2J\u009b.txt", "text/plain", source, {
    frameBytes: 160,
    fps: 10,
    ecc: "L",
    sessionId: 4242,
  });

  assert.equal(transfer.name, "notes[2J.txt", "terminal control characters must not reach status output");
  assert.equal(transfer.compression, "gzip");
  assert.ok(transfer.transmittedSize < transfer.originalSize);
  assert.equal(qrFrame(transfer, 0).version, transfer.qrVersion);
  assert.equal(qrFrame(transfer, 99).version, transfer.qrVersion, "the animation cannot resize mid-stream");

  const decoder = new LTDecoder(
    transfer.header.k,
    transfer.header.blockLen,
    transfer.header.sessionId,
    transfer.header.totalLen,
  );
  for (let sequence = 0; !decoder.isComplete && sequence < transfer.encoder.k * 10 + 100; sequence++) {
    const parsed = parseFrame(wireFrame(transfer, sequence));
    assert.ok(parsed, `frame ${sequence} must be accepted by the public receiver parser`);
    decoder.addFrame(parsed.header.seq, parsed.block);
  }
  assert.ok(decoder.isComplete, "the finite test stream should recover without lucky ordering");
  const container = decoder.assemble();
  assert.ok(container);
  const recovered = await unpackFile(container);
  assert.deepEqual(recovered.bytes, source);
  assert.equal(recovered.name, "notes[2J.txt");
  assert.equal(await verifyFile(recovered), true);
});

test("snippet transfers use the same fixed-version QR stream", async () => {
  const transfer = await prepareSnippetTransfer("hello from an SSH-only machine", {
    frameBytes: 160,
    fps: 12,
    ecc: "L",
    sessionId: 9,
  });
  assert.equal(transfer.name, "snippet.txt");
  assert.equal(qrFrame(transfer, 0).modules.size, transfer.qrModules);
  assert.equal(wireFrame(transfer, 0).length, 160);
});

test("the production receiver's ZXing engine reads a terminal-sender QR", async () => {
  const transfer = await prepareSnippetTransfer("decoded by the real receiver engine", {
    frameBytes: 160,
    fps: 10,
    ecc: "L",
    sessionId: 31337,
  });
  const qr = qrFrame(transfer, 17);
  const wasm = readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
  prepareZXingModule({ overrides: { wasmBinary: wasm.buffer as ArrayBuffer } });
  const results = await readBarcodes(qrBmp(qr.modules), {
    formats: ["QRCode"],
    maxNumberOfSymbols: 1,
  });
  const decoded = results.find((result) => result.isValid && result.bytes.length > 0);
  assert.ok(decoded, "ZXing must recognise the generated QR as a valid code");
  assert.deepEqual(decoded.bytes, wireFrame(transfer, 17));
});

/** Minimal uncompressed 24-bit BMP, so the QR decode test needs no image library. */
function qrBmp(
  modules: { size: number; data: Uint8Array },
  scale = 5,
  margin = 4,
): Uint8Array {
  const moduleSide = modules.size + margin * 2;
  const width = moduleSide * scale;
  const height = width;
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const out = new Uint8Array(14 + 40 + pixelBytes);
  const view = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  out.fill(0xff, 54);

  for (let pixelY = 0; pixelY < height; pixelY++) {
    const moduleY = Math.floor(pixelY / scale) - margin;
    for (let pixelX = 0; pixelX < width; pixelX++) {
      const moduleX = Math.floor(pixelX / scale) - margin;
      const dark =
        moduleX >= 0 &&
        moduleX < modules.size &&
        moduleY >= 0 &&
        moduleY < modules.size &&
        Boolean(modules.data[moduleY * modules.size + moduleX]);
      if (!dark) continue;
      const bottomUpY = height - 1 - pixelY;
      const offset = 54 + bottomUpY * rowBytes + pixelX * 3;
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
    }
  }
  return out;
}
