import { shuffle, type Rng } from '../core/random';
import { hamming, type QualityScore } from './metrics';

/** 自動挑選需要的最少資料（方便測試） */
export interface Candidate {
  id: string;
  kind: 'image' | 'video';
  hash: string;
  score: QualityScore;
  hasFace: boolean;
}

export type RejectReason = 'similar' | 'blurry' | 'dark' | 'bright' | 'extra';

export interface SelectionResult {
  picked: string[];
  rejected: Record<string, RejectReason>;
}

/**
 * 自動挑選：
 *  1. 相似的連拍只留分數最高的一張
 *  2. 太模糊／太暗／太亮的淘汰（如果淘汰後剩太少就不淘汰）
 *  3. 依分數排序，最多留 max 個
 * 影片不做相似比對，品質不好也保留（影片通常是使用者特別想放的）。
 */
export function autoSelect(items: Candidate[], max = 12, similarThreshold = 8): SelectionResult {
  const rejected: Record<string, RejectReason> = {};
  const images = items.filter((i) => i.kind === 'image').sort((a, b) => b.score.total - a.score.total);
  const kept: Candidate[] = [];
  for (const img of images) {
    const dup = kept.find((k) => hamming(k.hash, img.hash) <= similarThreshold);
    if (dup) rejected[img.id] = 'similar';
    else kept.push(img);
  }
  const good = kept.filter((k) => !k.score.issue);
  const minWanted = Math.min(3, kept.length);
  const finalImages = good.length >= minWanted ? good : kept;
  for (const k of kept) if (!finalImages.includes(k)) rejected[k.id] = k.score.issue!;
  const videos = items.filter((i) => i.kind === 'video');
  const picked = [...videos, ...finalImages.slice(0, Math.max(0, max - videos.length))].map((c) => c.id);
  for (const k of finalImages.slice(Math.max(0, max - videos.length))) rejected[k.id] = 'extra';
  return { picked, rejected };
}

/**
 * 把挑好的照片分配到版型的格子。
 * 主格放最好的（優先有人臉的，前三名裡隨機），其他格隨機排。
 * 照片比格子多時，多的照片會在短影片裡輪播（每格多張）。
 */
export function assignToSlots<T extends Candidate>(
  ranked: T[],
  slotIds: { main: string | null; photos: string[] },
  rng: Rng,
  allowMultiple: boolean,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  if (!ranked.length) return out;
  const sorted = ranked.slice().sort((a, b) => b.score.total - a.score.total);
  let pool = sorted;
  if (slotIds.main) {
    const top = sorted.slice(0, 3);
    const withFace = top.filter((c) => c.hasFace);
    const choices = withFace.length ? withFace : top;
    const main = choices[Math.floor(rng() * choices.length)];
    out[slotIds.main] = [main];
    pool = sorted.filter((c) => c !== main);
  }
  const n = slotIds.photos.length;
  if (!n) return out;
  if (!pool.length) pool = sorted;
  const shuffled = shuffle(rng, pool);
  slotIds.photos.forEach((id, i) => {
    out[id] = [shuffled[i % shuffled.length]];
  });
  if (allowMultiple && shuffled.length > n) {
    shuffled.slice(n).forEach((c, i) => out[slotIds.photos[i % n]].push(c));
  }
  return out;
}
