// Build-time codegen: Lucide SVG -> braille icon art + figlet miniwi labels.
// Run: bun run gen:art   (rewrites src/ui/panels/lens/iconArt.gen.ts)
// devDeps only (@resvg/resvg-js, figlet) — runtime ships the generated strings.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import figlet from "figlet";

const ICON_SVG: Record<string, string> = {
  prompt: "zap",
  thinking: "lightbulb",
  text: "message-circle",
  tool: "wrench",
  bash: "terminal",
  edit: "pencil",
  read: "file-text",
  search: "search",
  web: "globe",
  task: "network",
  skill: "star",
  todo: "list-checks",
  result: "check",
};
const LABELS = ["prompt", "think", "tool", "result", "chat"] as const;
const SIZES = [
  { cols: 7, rows: 3, stroke: 3.0, thr: 0.3 },
  { cols: 13, rows: 5, stroke: 2.5, thr: 0.35 },
] as const;
// per-icon tuning hook: key `${name}@${cols}` -> overrides (tune by eye if an icon blobs/thins)
const OVERRIDES: Record<string, { stroke?: number; thr?: number }> = {};

const RES = 768; // supersample
const DX = 2, DY = 4; // braille dots per cell
const AX = 0.5, AY = 0.5; // braille dot pitch in square terminal units

function renderAlpha(svgName: string, strokeW: number): { a: Float32Array; n: number } {
  let svg = readFileSync(`${import.meta.dir}/lucide/${svgName}.svg`, "utf8");
  svg = svg.replace(/stroke="currentColor"/, 'stroke="#ffffff"');
  svg = svg.replace(/stroke-width="2"/, `stroke-width="${strokeW}"`);
  const img = new Resvg(svg, { fitTo: { mode: "width", value: RES } }).render();
  const px = img.pixels; // COPYING getter — hoist once (per-pixel access OOM-kills bun)
  const n = img.width;
  const a = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) a[i] = px[i * 4 + 3]! / 255;
  return { a, n };
}

function sampleRect(img: { a: Float32Array; n: number }, u0: number, v0: number, u1: number, v1: number): number {
  const { a, n } = img;
  const x0 = Math.max(0, Math.floor(u0 * n)), x1 = Math.min(n, Math.ceil(u1 * n));
  const y0 = Math.max(0, Math.floor(v0 * n)), y1 = Math.min(n, Math.ceil(v1 * n));
  if (x1 <= x0 || y1 <= y0) return 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += a[y * n + x]!;
  return sum / ((x1 - x0) * (y1 - y0));
}

// coverage grid, icon contain-fit centered in the dot viewport
function coverage(img: { a: Float32Array; n: number }, dotW: number, dotH: number): Float32Array {
  const Vw = dotW * AX, Vh = dotH * AY;
  const s = Math.min(Vw, Vh);
  const offX = (Vw - s) / 2, offY = (Vh - s) / 2;
  const cov = new Float32Array(dotW * dotH);
  for (let j = 0; j < dotH; j++) for (let i = 0; i < dotW; i++) {
    cov[j * dotW + i] = sampleRect(img, (i * AX - offX) / s, (j * AY - offY) / s, ((i + 1) * AX - offX) / s, ((j + 1) * AY - offY) / s);
  }
  return cov;
}

// braille bits row-major (y0..y3, x0..x1): dots 1,4 / 2,5 / 3,6 / 7,8
const BIT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function toBraille(cov: Float32Array, cols: number, rows: number, dotW: number, thr: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      let bits = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 2; sx++) {
        if (cov[(r * DY + sy) * dotW + (c * DX + sx)]! > thr) bits |= BIT[sy * 2 + sx]!;
      }
      line += bits === 0 ? " " : String.fromCharCode(0x2800 + bits);
    }
    out.push(line);
  }
  return out;
}

function genIcons(size: (typeof SIZES)[number]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, svgName] of Object.entries(ICON_SVG)) {
    const o = OVERRIDES[`${svgName}@${size.cols}`] ?? {};
    const img = renderAlpha(svgName, o.stroke ?? size.stroke);
    const dotW = size.cols * DX, dotH = size.rows * DY;
    out[key] = toBraille(coverage(img, dotW, dotH), size.cols, size.rows, dotW, o.thr ?? size.thr);
  }
  return out;
}

function genLabels(): { labels: Record<string, string[]>; h: number } {
  const raw: Record<string, string[]> = {};
  for (const w of LABELS) {
    let lines = figlet.textSync(w, { font: "miniwi" as figlet.Fonts }).split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length && lines[0] === "") lines.shift();
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    raw[w] = lines;
  }
  const h = Math.max(...Object.values(raw).map((l) => l.length));
  const labels: Record<string, string[]> = {};
  for (const [w, lines] of Object.entries(raw)) {
    const width = Math.max(...lines.map((l) => [...l].length));
    while (lines.length < h) lines.push("");
    labels[w] = lines.map((l) => l.padEnd(width, " "));
  }
  return { labels, h };
}

const i7 = genIcons(SIZES[0]);
const i13 = genIcons(SIZES[1]);
const { labels, h } = genLabels();

const lit = (o: Record<string, string[]>) =>
  "{\n" + Object.keys(o).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(o[k])},`).join("\n") + "\n}";

const file = `// GENERATED by scripts/gen-icon-art.ts — DO NOT EDIT. Regenerate: bun run gen:art
// Icons: Lucide (https://lucide.dev, ISC) rendered to braille (U+2800-28FF, single-width).
// Labels: figlet font miniwi (https://github.com/sshbio/miniwi).
import type { IconKey } from "../../../core/types";

export type ArtKey = IconKey | "prompt";

export const ICON_ART_7: Record<ArtKey, string[]> = ${lit(i7)};

export const ICON_ART_13: Record<ArtKey, string[]> = ${lit(i13)};

export const LABEL_H = ${h};

export const LABEL_ART: Record<"prompt" | "think" | "tool" | "result" | "chat", string[]> = ${lit(labels)};
`;
await Bun.write(`${import.meta.dir}/../src/ui/panels/lens/iconArt.gen.ts`, file);
console.log(`wrote iconArt.gen.ts — labels ${h} rows`);
