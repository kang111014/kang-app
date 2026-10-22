import { loadAsset } from '../core/db';
import { loadImageElement } from '../media/load';
import type { Drawable } from './render';

/**
 * 把版型中的圖片來源字串載入成可以畫的圖片。
 *   asset:<id>    手機資料庫
 *   builtin:<名>  網站內建（public/template-assets/）
 *   blob: / https:  直接載入
 */
const cache = new Map<string, Promise<Drawable | null>>();

export function resolveImage(src: string): Promise<Drawable | null> {
  let p = cache.get(src);
  if (!p) {
    p = (async () => {
      try {
        if (src.startsWith('asset:')) {
          const blob = await loadAsset(src.slice(6));
          if (!blob) return null;
          return await loadImageElement(URL.createObjectURL(blob));
        }
        if (src.startsWith('builtin:')) return await loadImageElement(`${import.meta.env.BASE_URL}template-assets/${src.slice(8)}`);
        if (src.startsWith('blob:') || src.startsWith('data:')) return await loadImageElement(src);
        // 網路圖片先下載成 blob，避免畫布被瀏覽器標記成「不能匯出」
        const res = await fetch(src);
        const blob = await res.blob();
        return await loadImageElement(URL.createObjectURL(blob));
      } catch {
        return null;
      }
    })();
    cache.set(src, p);
    p.then((v) => {
      if (!v) cache.delete(src);
    });
  }
  return p;
}

export async function resolveImages(srcs: (string | undefined)[]): Promise<Map<string, Drawable>> {
  const map = new Map<string, Drawable>();
  await Promise.all(
    srcs.filter((s): s is string => !!s).map(async (s) => {
      const d = await resolveImage(s);
      if (d) map.set(s, d);
    }),
  );
  return map;
}

export function forgetImage(src: string) {
  cache.delete(src);
}
