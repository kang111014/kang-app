/** 短影片的時間軸規劃（純計算，方便測試） */
export const MAX_SECONDS = 60;

export interface ClipInfo {
  id: string;
  duration: number;
}

export interface Segment {
  id: string;
  /** 從原影片的第幾秒開始 */
  start: number;
  /** 長度（秒） */
  length: number;
  /** 在成品裡的第幾秒出現 */
  at: number;
}

/**
 * 多段影片依序接著播。
 * 總長超過 60 秒時，短的片段完整保留、長的片段剪短（每段至少 3 秒），取每段中間的部分。
 * 總長不到 60 秒就維持原樣。
 */
export function planSegments(clips: ClipInfo[], max = MAX_SECONDS, minSeg = 3): Segment[] {
  const valid = clips.filter((c) => c.duration > 0.2);
  // 太多段時，只放得下 max/minSeg 段
  const usable = valid.slice(0, Math.max(1, Math.floor(max / minSeg)));
  const total = usable.reduce((s, c) => s + c.duration, 0);
  let lengths: number[];
  if (total <= max) {
    lengths = usable.map((c) => c.duration);
  } else {
    // 「注水法」：找出一個上限 cap，短的影片完整保留，長的影片剪到 cap，總長剛好 max
    const sorted = usable.map((c) => c.duration).sort((a, b) => a - b);
    let remain = max;
    let cap = max;
    for (let i = 0; i < sorted.length; i++) {
      const share = remain / (sorted.length - i);
      if (sorted[i] <= share) remain -= sorted[i];
      else {
        cap = share;
        break;
      }
    }
    cap = Math.max(cap, minSeg);
    lengths = usable.map((c) => Math.min(c.duration, cap));
  }
  let at = 0;
  return usable.map((c, i) => {
    const length = Math.round(lengths[i] * 100) / 100;
    const start = Math.max(0, Math.round(((c.duration - length) / 2) * 100) / 100);
    const seg = { id: c.id, start, length, at };
    at = Math.round((at + length) * 100) / 100;
    return seg;
  });
}

export function totalLength(segs: Segment[]): number {
  return segs.reduce((s, x) => s + x.length, 0);
}

/** 沒有影片時（只有照片的短影片），長度依照片數量決定 */
export function slideshowLength(photoCount: number, musicSeconds?: number): number {
  const byPhotos = Math.min(30, Math.max(9, photoCount * 3));
  if (musicSeconds && musicSeconds > 0) return Math.min(MAX_SECONDS, Math.max(byPhotos, Math.min(musicSeconds, 30)));
  return byPhotos;
}
