import { writeFile } from "node:fs/promises";

import { prepareSnippetTransfer, qrFrame } from "../cli/transfer";

const transfer = await prepareSnippetTransfer("Decimen CLI", {
  frameBytes: 160,
  fps: 10,
  ecc: "L",
  sessionId: 31337,
});
if (transfer.encoder.k !== 1) throw new Error("Preview payload must stay recoverable from one QR.");
const modules = qrFrame(transfer, 0).modules;
const scale = 7;
const margin = 4;
const qrSide = (modules.size + margin * 2) * scale;
let path = "";
for (let y = 0; y < modules.size; y++) {
  let x = 0;
  while (x < modules.size) {
    if (!modules.data[y * modules.size + x]) {
      x++;
      continue;
    }
    const start = x;
    while (x < modules.size && modules.data[y * modules.size + x]) x++;
    const width = (x - start) * scale;
    path += `M${(start + margin) * scale} ${(y + margin) * scale}h${width}v${scale}h-${width}z`;
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Decimen terminal sender</title>
  <desc id="description">A terminal sends a file as a fountain-coded animated QR stream to the Decimen phone receiver. The displayed QR is a real one-frame Decimen text transfer.</desc>
  <rect width="1200" height="630" fill="#070a11"/>
  <rect x="42" y="42" width="1116" height="546" rx="22" fill="#0e1420" stroke="#34466f" stroke-width="2"/>
  <path d="M42 92h1116" stroke="#1d2740" stroke-width="2"/>
  <circle cx="76" cy="67" r="7" fill="#ff7b72"/>
  <circle cx="100" cy="67" r="7" fill="#e6c66d"/>
  <circle cx="124" cy="67" r="7" fill="#5fe0b0"/>
  <text x="154" y="73" fill="#7c8aa8" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" letter-spacing="2">DECIMEN · OPTICAL TRANSFER</text>

  <text x="88" y="146" fill="#58c8ff" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" font-weight="700" letter-spacing="3">TERMINAL → CAMERA</text>
  <text x="88" y="214" fill="#dde6f5" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="48" font-weight="800" letter-spacing="-2">Files travel</text>
  <text x="88" y="268" fill="#dde6f5" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="48" font-weight="800" letter-spacing="-2">as light.</text>
  <text x="88" y="316" fill="#7c8aa8" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="17">No sender-side browser. No phone app. No pairing.</text>

  <rect x="88" y="350" width="540" height="72" rx="10" fill="#070a11" stroke="#34466f" stroke-width="2"/>
  <text x="114" y="394" fill="#58c8ff" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="18">$</text>
  <text x="140" y="394" fill="#dde6f5" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="18">decimen send ./backup.tar.gz</text>

  <text x="88" y="470" fill="#b9c6dd" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="16">✓ fountain-coded · missed frames are harmless</text>
  <text x="88" y="505" fill="#b9c6dd" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="16">✓ gzip + SHA-256 · same browser receiver</text>
  <text x="88" y="540" fill="#b9c6dd" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="16">✓ Linux · Windows · macOS</text>

  <rect x="714" y="112" width="${qrSide}" height="${qrSide}" rx="10" fill="#ffffff"/>
  <g transform="translate(714 112)" fill="#000000" shape-rendering="crispEdges"><path d="${path}"/></g>
  <text x="${714 + qrSide / 2}" y="${112 + qrSide + 34}" text-anchor="middle" fill="#58c8ff" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" font-weight="700" letter-spacing="2">SCAN WITH THE WEB RECEIVER</text>
  <text x="${714 + qrSide / 2}" y="${112 + qrSide + 58}" text-anchor="middle" fill="#7c8aa8" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12">Real Decimen frame · sample text: “Decimen CLI”</text>
</svg>
`;

await writeFile(new URL("../docs/terminal-sender.svg", import.meta.url), svg, "utf8");
process.stdout.write(`Wrote docs/terminal-sender.svg (${qrSide}px QR, version ${transfer.qrVersion}).\n`);
