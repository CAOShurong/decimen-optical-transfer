// Sender: turn a file into an endless fountain-coded QR stream.
//
// Tuning notes from the experiments this PoC is distilled from:
// - Frame payload sets the QR version; denser wins on goodput as long as the
//   receiver can still decode it. 1465 bytes ≈ V27 is a safe middle ground
//   for arbitrary monitors; 2953 (V40) is the ceiling and works phone-to-
//   phone at close range.
// - The mask pattern is pinned (any declared mask is valid to a decoder);
//   this skips the spec's 8-way mask evaluation and speeds generation ~4×.
// - Displays need each frame shown for ≥2 refresh cycles or captures catch
//   the transition; 24 fps on a 60 Hz screen is comfortable.
// - Error correction stays at L by default: the fountain layer already
//   handles erasures, and a frame is either decoded whole or discarded.

import QRCode from "qrcode";
import { fitQrDisplaySize } from "../shared/display";
import { LTEncoder } from "../shared/fountain";
import { MAX_SNIPPET_BYTES, MAX_SNIPPET_LABEL, packSnippet } from "../shared/snippet";
import {
  HEADER_LEN,
  MAX_FILE_BYTES,
  fnv1a,
  packFile,
  packFrame,
  type FrameHeader,
} from "../shared/protocol";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD = 3;

// `npm run demo` (vite --mode demo). Locks the sender to the two bundled
// payloads so the app can be left running in front of strangers without
// handing them a file picker into the host machine.
const DEMO = import.meta.env.VITE_DEMO === "1";

const canvas = document.getElementById("qr") as HTMLCanvasElement;
const stage = document.getElementById("stage") as HTMLDivElement;
const specs = document.getElementById("specs")!;
const cfgFile = document.getElementById("cfg-file") as HTMLInputElement;
const snippetText = document.getElementById("snippet-text") as HTMLTextAreaElement;
const snippetLabel = document.getElementById("snippet-label")!;
const sendSnippetBtn = document.getElementById("send-snippet") as HTMLButtonElement;
const paneFile = document.getElementById("pane-file")!;
const paneSnippet = document.getElementById("pane-snippet")!;
const paneDemo = document.getElementById("pane-demo")!;
const modePicker = document.getElementById("mode-picker")!;
const modeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="send-mode"]')];
const cfgFps = document.getElementById("cfg-fps") as HTMLSelectElement;
const cfgBytes = document.getElementById("cfg-bytes") as HTMLSelectElement;
const cfgEcc = document.getElementById("cfg-ecc") as HTMLSelectElement;
const cfgSize = document.getElementById("cfg-size") as HTMLInputElement;

let selectedFile: {
  name: string;
  size: number;
  payload: Uint8Array;
  compression: "none" | "gzip";
  transmittedSize: number;
} | null = null;
let generation = 0; // bumped on every restart; stale loops see it and die
let resizeDisplay: (() => void) | null = null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentMode(): "file" | "snippet" {
  return modeInputs.find((input) => input.checked)?.value === "snippet" ? "snippet" : "file";
}

/** Switching what we're sending kills any stream in flight and clears the stage. */
function applyMode(): void {
  generation++;
  selectedFile = null;
  stage.hidden = true;

  if (DEMO) {
    modePicker.hidden = true;
    paneFile.hidden = true;
    paneSnippet.hidden = true;
    paneDemo.hidden = false;
    specs.textContent = "Choose a demo payload to begin";
    return;
  }

  const mode = currentMode();
  paneDemo.hidden = true;
  paneFile.hidden = mode !== "file";
  paneSnippet.hidden = mode !== "snippet";
  specs.textContent =
    mode === "snippet" ? "Paste or type some text to begin" : "Choose a file to begin";
  // A file left in the picker survives the switch, so re-arm it rather than
  // leaving a filename on screen next to "choose a file to begin".
  if (mode === "file" && cfgFile.files?.[0]) void selectFile();
}

/** Demo payloads ship in public/, so they sit at the site root beside /send/. */
async function selectDemo(fileName: string): Promise<void> {
  const selectionGeneration = ++generation;
  selectedFile = null;
  stage.hidden = true;
  specs.textContent = `loading ${fileName}…`;
  try {
    const response = await fetch(`../${fileName}`);
    if (!response.ok) throw new Error(`could not load ${fileName} (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const packed = await packFile(fileName, "image/png", bytes);
    if (selectionGeneration !== generation) return;
    selectedFile = {
      name: fileName,
      size: bytes.length,
      payload: packed.container,
      compression: packed.compression,
      transmittedSize: packed.transmittedSize,
    };
    await startStream(true);
  } catch (error) {
    specs.textContent = `✗ ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function selectFile(): Promise<void> {
  const file = cfgFile.files?.[0];
  if (!file) return;
  const selectionGeneration = ++generation;
  selectedFile = null;
  stage.hidden = true;
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    specs.textContent = file.size === 0 ? "✗ choose a non-empty file" : "✗ files are limited to 64 MB";
    return;
  }

  specs.textContent = `preparing ${file.name}…`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const packed = await packFile(file.name, file.type, bytes);
    if (selectionGeneration !== generation) return;
    selectedFile = {
      name: file.name,
      size: file.size,
      payload: packed.container,
      compression: packed.compression,
      transmittedSize: packed.transmittedSize,
    };
    await startStream(true);
  } catch (error) {
    specs.textContent = `✗ ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function selectSnippet(): Promise<void> {
  const selectionGeneration = ++generation;
  selectedFile = null;
  stage.hidden = true;
  specs.textContent = "preparing text snippet…";
  try {
    const packed = await packSnippet(snippetText.value);
    if (selectionGeneration !== generation) return;
    selectedFile = {
      name: "Text snippet",
      size: packed.originalSize,
      payload: packed.container,
      compression: packed.compression,
      transmittedSize: packed.transmittedSize,
    };
    await startStream(true);
  } catch (error) {
    specs.textContent = `✗ ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function main() {
  // Both bounds come from MAX_SNIPPET_BYTES so they can't drift apart. maxLength
  // counts UTF-16 units and the real check counts UTF-8 bytes, which are never
  // fewer — so this is a loose guard and packSnippet() remains authoritative.
  snippetText.maxLength = MAX_SNIPPET_BYTES;
  snippetLabel.textContent = `Text to send · up to ${MAX_SNIPPET_LABEL}`;

  if (DEMO) {
    document.querySelector(".mode-badge")!.textContent = "Demo";
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-demo]")) {
      button.addEventListener("click", () => void selectDemo(button.dataset.demo!));
    }
  } else {
    cfgFile.addEventListener("change", () => void selectFile());
    sendSnippetBtn.addEventListener("click", () => void selectSnippet());
    for (const input of modeInputs) input.addEventListener("change", applyMode);
  }
  applyMode();
  window.addEventListener("resize", () => resizeDisplay?.());
  for (const el of [cfgFps, cfgBytes, cfgEcc, cfgSize]) {
    el.addEventListener("change", () => void startStream());
  }
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } })
      .wakeLock?.request("screen");
  } catch {
    /* fine without it */
  }
}

/** Only on a fresh pick — a settings change restarts the stream too, and
 *  yanking the page down every time you nudge tx fps is worse than useless. */
function scrollStageIntoView() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    stage.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  });
}

async function startStream(revealStage = false) {
  const gen = ++generation;
  resizeDisplay = null;
  if (!selectedFile) {
    specs.textContent =
      currentMode() === "snippet" ? "Paste or type some text to begin" : "Choose a file to begin";
    return;
  }
  const { name, size: fileSize, payload, compression, transmittedSize } = selectedFile;
  if (gen !== generation) return; // superseded while fetching
  const txFps = Number(cfgFps.value);
  const frameBytes = Number(cfgBytes.value);
  const ecc = cfgEcc.value as "L" | "M" | "Q" | "H";
  const displayPx = Number(cfgSize.value);

  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  const blockLen = frameBytes - HEADER_LEN;
  if (Math.ceil(payload.length / blockLen) > 0xffff) {
    stage.hidden = true;
    specs.textContent = "✗ this file needs a larger bytes-per-frame setting";
    return;
  }
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };

  let version: number | undefined; // locked after the first frame
  let modules = 0;
  let scale = 1;
  const staging = document.createElement("canvas");
  const queue: ImageData[] = [];
  let nextSeq = 0;
  stage.hidden = false;

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const containerWidth = stage.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    const stageStyle = getComputedStyle(stage);
    const horizontalChrome =
      Number.parseFloat(stageStyle.paddingLeft) +
      Number.parseFloat(stageStyle.paddingRight) +
      Number.parseFloat(stageStyle.borderLeftWidth) +
      Number.parseFloat(stageStyle.borderRightWidth);
    const cssBudget = fitQrDisplaySize(
      window.innerWidth,
      window.innerHeight,
      containerWidth,
      displayPx,
      horizontalChrome,
    );
    scale = Math.max(1, Math.floor((cssBudget * dpr) / total));
    staging.width = total;
    staging.height = total;
    canvas.width = total * scale;
    canvas.height = total * scale;
    canvas.style.width = `${(total * scale) / dpr}px`;
    canvas.style.height = `${(total * scale) / dpr}px`;
  };

  const makeFrame = (): ImageData => {
    const bytes = packFrame({ ...header, seq: nextSeq }, encoder.encode(nextSeq));
    nextSeq++;
    const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
      errorCorrectionLevel: ecc,
      version,
      maskPattern: 4,
    });
    if (version === undefined) {
      version = qr.version;
      modules = qr.modules.size;
      sizeCanvas();
      resizeDisplay = sizeCanvas;
      // Scroll only now: before sizeCanvas() the canvas is still 16×16, so the
      // scroll target would be the wrong height.
      if (revealStage) scrollStageIntoView();
      specs.textContent =
        `${txFps} FPS · ${frameBytes} bytes per frame · V${version} · ECC ${ecc} · ` +
        `${name} · ${formatBytes(fileSize)} · ` +
        `${compression === "gzip" ? `gzip ${formatBytes(transmittedSize)}` : "no compression"} · ` +
        `K=${encoder.k}`;
    }
    const size = qr.modules.size;
    const data = qr.modules.data;
    const total = size + 2 * MARGIN;
    const img = new ImageData(total, total);
    const px = new Uint32Array(img.data.buffer);
    px.fill(0xffffffff);
    for (let y = 0; y < size; y++) {
      const row = (y + MARGIN) * total + MARGIN;
      const src = y * size;
      for (let x = 0; x < size; x++) {
        if (data[src + x]) px[row + x] = 0xff000000;
      }
    }
    return img;
  };

  const pump = () => {
    if (gen !== generation) return; // superseded by a settings change
    try {
      while (queue.length < LOOKAHEAD) queue.push(makeFrame());
    } catch (err) {
      // e.g. frame bytes over capacity for the chosen ECC level
      specs.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    setTimeout(pump, 0);
  };
  pump();

  const interval = 1000 / txFps;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (gen !== generation) return;
    requestAnimationFrame(tick);
    if (now < nextAt) return;
    const img = queue.shift();
    if (!img) {
      nextAt = now + interval;
      return;
    }
    staging.getContext("2d")!.putImageData(img, 0, 0);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
    nextAt += interval;
    if (now - nextAt > 3 * interval) nextAt = now + interval; // fell behind — don't burst
  };
  requestAnimationFrame(tick);
}

void main();
