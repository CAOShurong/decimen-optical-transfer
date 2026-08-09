import type { BitMatrix } from "qrcode";

const reset = "\u001b[0m";
const blackBackground = "\u001b[40m";
const whiteBackground = "\u001b[47m";
const blackOnWhite = "\u001b[30;47m";
const whiteOnBlack = "\u001b[37;40m";

export interface TerminalQr {
  text: string;
  columns: number;
  rows: number;
}

/**
 * Render two square QR modules into one terminal cell with a half-block.
 * Explicit black/white ANSI colors make the result independent of the user's
 * terminal theme; the quiet zone is included in the measured footprint.
 */
export function renderTerminalQr(
  modules: Pick<BitMatrix, "size" | "data">,
  margin = 4,
  inverse = false,
): TerminalQr {
  if (!Number.isInteger(margin) || margin < 0) throw new Error("QR margin must be non-negative.");
  const side = modules.size + margin * 2;
  const lines: string[] = [];

  const isDark = (x: number, y: number): boolean => {
    const inside =
      x >= margin && x < margin + modules.size && y >= margin && y < margin + modules.size;
    const dark = inside ? Boolean(modules.data[(y - margin) * modules.size + (x - margin)]) : false;
    return inverse ? !dark : dark;
  };

  for (let y = 0; y < side; y += 2) {
    let line = "";
    let active = "";
    for (let x = 0; x < side; x++) {
      const top = isDark(x, y);
      const bottom = y + 1 < side ? isDark(x, y + 1) : inverse;
      const key = `${top ? 1 : 0}${bottom ? 1 : 0}`;
      const style =
        key === "11"
          ? blackBackground
          : key === "00"
            ? whiteBackground
            : key === "10"
              ? blackOnWhite
              : whiteOnBlack;
      if (style !== active) {
        line += style;
        active = style;
      }
      line += key === "10" || key === "01" ? "▀" : " ";
    }
    lines.push(`${line}${reset}`);
  }

  return { text: lines.join("\n"), columns: side, rows: lines.length };
}
