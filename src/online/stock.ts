import type { Settings } from '../core/settings';
import { fetchAsObjectUrl, withTimeout } from './fetchImage';

/**
 * 免費圖庫背景：有 Unsplash 或 Pexels 金鑰就用它們搜尋，
 * 沒有金鑰就用 Lorem Picsum 的隨機圖（不需要金鑰）。
 * 只會「下載」圖片，不會上傳任何東西。
 */
export async function fetchStockBackground(query: string, settings: Settings, seed: number): Promise<{ url: string; credit: string }> {
  const tasks: (() => Promise<{ url: string; credit: string }>)[] = [];
  if (settings.unsplashKey) tasks.push(() => fromUnsplash(query, settings.unsplashKey));
  if (settings.pexelsKey) tasks.push(() => fromPexels(query, settings.pexelsKey, seed));
  tasks.push(() => fromPicsum(seed));
  let lastErr: unknown;
  for (const t of tasks) {
    try {
      return await withTimeout(t(), 12000);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fromUnsplash(query: string, key: string) {
  const api = `https://api.unsplash.com/photos/random?orientation=portrait&content_filter=high&query=${encodeURIComponent(query)}&client_id=${encodeURIComponent(key)}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Unsplash 回應錯誤（${res.status}）`);
  const data = await res.json();
  const url = await fetchAsObjectUrl(`${data.urls.raw}&w=1080&h=1920&fit=crop&fm=jpg&q=80`);
  // Unsplash 規定：使用圖片時要通知它「下載」了一次
  if (data.links?.download_location) fetch(`${data.links.download_location}&client_id=${encodeURIComponent(key)}`).catch(() => {});
  return { url, credit: `Unsplash · ${data.user?.name ?? ''}` };
}

async function fromPexels(query: string, key: string, seed: number) {
  const page = 1 + (seed % 5);
  const res = await fetch(`https://api.pexels.com/v1/search?orientation=portrait&per_page=30&page=${page}&query=${encodeURIComponent(query)}`, {
    headers: { Authorization: key },
  });
  if (!res.ok) throw new Error(`Pexels 回應錯誤（${res.status}）`);
  const data = await res.json();
  const photos = data.photos ?? [];
  if (!photos.length) throw new Error('Pexels 沒有找到圖片');
  const p = photos[seed % photos.length];
  const url = await fetchAsObjectUrl(p.src.portrait ?? p.src.large2x);
  return { url, credit: `Pexels · ${p.photographer ?? ''}` };
}

async function fromPicsum(seed: number) {
  const url = await fetchAsObjectUrl(`https://picsum.photos/seed/kang${seed}/1080/1920`);
  return { url, credit: 'Lorem Picsum' };
}

/** 測試金鑰能不能用 */
export async function testUnsplashKey(key: string): Promise<boolean> {
  const res = await fetch(`https://api.unsplash.com/photos/random?client_id=${encodeURIComponent(key)}`);
  return res.ok;
}

export async function testPexelsKey(key: string): Promise<boolean> {
  const res = await fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { Authorization: key } });
  return res.ok;
}
