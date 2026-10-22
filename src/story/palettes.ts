import type { Palette } from './types';

/** 內建配色：[背景, 次要底色, 主強調, 副強調, 深色] */
export const BUILTIN_PALETTES: Palette[] = [
  ['#fff6ee', '#ffd9cf', '#ff7a8a', '#ffb347', '#3b2c35'],
  ['#f4f1ea', '#d9e4dd', '#7fb685', '#e8a87c', '#2f3e46'],
  ['#fdf0f5', '#e8d5f2', '#b388eb', '#f78fb3', '#3d2c5a'],
  ['#eef6fb', '#cfe7f5', '#4ea8de', '#ffd166', '#1b263b'],
  ['#fffbea', '#fde68a', '#f59e0b', '#ef4444', '#292524'],
  ['#f6f0e8', '#e6d5c3', '#c08552', '#895737', '#2e1f17'],
  ['#f0fff4', '#c6f6d5', '#38b2ac', '#ed64a6', '#1a202c'],
  ['#fef6e4', '#f3d2c1', '#f582ae', '#8bd3dd', '#001858'],
  ['#faf4ff', '#dcd0ff', '#6c63ff', '#ff6584', '#2a2438'],
  ['#fff8f0', '#ffe5d9', '#ff9b85', '#60d394', '#22223b'],
  ['#1d1b26', '#2e2a3d', '#ff6b9d', '#ffd166', '#f5f0ff'],
  ['#0f172a', '#1e293b', '#38bdf8', '#f472b6', '#f8fafc'],
  ['#1b1b1b', '#2d2d2d', '#e9c46a', '#f4a261', '#fafafa'],
  ['#14213d', '#27375e', '#fca311', '#e5e5e5', '#ffffff'],
  ['#fdfcdc', '#fed9b7', '#f07167', '#00afb9', '#0081a7'],
  ['#f8edeb', '#fcd5ce', '#f9844a', '#43aa8b', '#264653'],
  ['#edf2fb', '#d7e3fc', '#abc4ff', '#ffafcc', '#2b2d42'],
  ['#fefae0', '#e9edc9', '#ccd5ae', '#d4a373', '#3a3a2e'],
  ['#fff0f3', '#ffccd5', '#ff4d6d', '#ffb3c1', '#590d22'],
  ['#e0fbfc', '#c2dfe3', '#ee6c4d', '#3d5a80', '#293241'],
  ['#f1faee', '#a8dadc', '#e63946', '#457b9d', '#1d3557'],
  ['#fcf5c7', '#fde4cf', '#a0c4ff', '#ffadad', '#2c2c54'],
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDark(p: Palette) {
  return luminance(p[0]) < 0.3;
}

/** 把任意 5 色色卡排成 [背景, 次要, 強調, 強調, 深色] 的角色 */
export function arrangePalette(colors: string[], wantDark: boolean): Palette {
  const sorted = colors.slice(0, 5).sort((a, b) => luminance(b) - luminance(a));
  while (sorted.length < 5) sorted.push(sorted[sorted.length - 1] ?? '#ffffff');
  const [l0, l1, m, m2, d] = sorted;
  return wantDark ? [d, m2, m, l1, l0] : [l0, l1, m, m2, d];
}

/** 把色碼或配色代號（p0~p4）轉成實際顏色 */
export function resolveColor(ref: string | undefined, palette: Palette, fallback = '#ffffff'): string {
  if (!ref) return fallback;
  const m = /^p([0-4])$/.exec(ref);
  if (m) return palette[Number(m[1])];
  return ref;
}

export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
