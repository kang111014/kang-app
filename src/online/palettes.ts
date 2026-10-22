import { kvGet, kvSet } from '../core/db';
import { withTimeout } from './fetchImage';

/**
 * 網路色卡：從 nice-color-palettes（開源，1000 組配色）下載一次後存在手機裡。
 */
const URL_PALETTES = 'https://cdn.jsdelivr.net/npm/nice-color-palettes@3.0.0/1000.json';
const KEY = 'online.palettes';
const MAX_AGE = 30 * 24 * 3600 * 1000;

let memo: string[][] | null = null;

export async function getOnlinePalettes(): Promise<string[][]> {
  if (memo) return memo;
  const cached = await kvGet<{ at: number; list: string[][] } | null>(KEY, null);
  if (cached && Date.now() - cached.at < MAX_AGE) return (memo = cached.list);
  try {
    const res = await withTimeout(fetch(URL_PALETTES), 10000);
    if (!res.ok) throw new Error(String(res.status));
    const list = ((await res.json()) as string[][]).filter((p) => Array.isArray(p) && p.length >= 5).slice(0, 300);
    await kvSet(KEY, { at: Date.now(), list });
    return (memo = list);
  } catch {
    return (memo = cached?.list ?? []);
  }
}
