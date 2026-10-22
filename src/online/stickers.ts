import { shuffle, type Rng } from '../core/random';
import { withTimeout } from './fetchImage';

/**
 * 網路貼圖：Twemoji（開源表情圖案，CC-BY 4.0）。
 * 下載 SVG 後放大成高解析度，畫在拼貼上不會模糊。
 */
const BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';
const CODES = [
  '1f338', '2728', '1f496', '1f31f', '1f308', '1f33c', '1f380', '1f9f8', '1f353', '1f319', '2601', '1f98b',
  '1f337', '1f36d', '1f4f8', '1f3b5', '2b50', '1f49b', '1f49c', '1f33b', '1f340', '1f366', '1f389', '1f388',
  '1f43e', '1f30a', '1f965', '1f352', '1f9c1', '1f381',
];

const cache = new Map<string, string>();

async function loadSticker(code: string): Promise<string> {
  const hit = cache.get(code);
  if (hit) return hit;
  const res = await withTimeout(fetch(BASE + code + '.svg'), 8000);
  if (!res.ok) throw new Error(String(res.status));
  let svg = await res.text();
  svg = svg.replace('<svg ', '<svg width="512" height="512" ');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  cache.set(code, url);
  return url;
}

export async function fetchRandomStickers(rng: Rng, count: number): Promise<string[]> {
  const picked = shuffle(rng, CODES).slice(0, count);
  const out: string[] = [];
  for (const c of picked) {
    try {
      out.push(await loadSticker(c));
    } catch {
      // 下載失敗就少一張
    }
  }
  return out;
}
