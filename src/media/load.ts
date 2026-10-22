import { newId } from '../core/db';
import { detectFaces } from './faces';
import { dHash, laplacianVariance, meanAndStd, scoreQuality, type FaceInfo, type QualityScore } from './metrics';

/**
 * 讀取使用者選的照片／影片並評分。全部在手機上處理，不會上傳。
 * 為了省記憶體，分析時只保留縮圖；要輸出時才讀原圖。
 */
export interface MediaItem {
  id: string;
  file: File;
  kind: 'image' | 'video';
  width: number;
  height: number;
  duration?: number;
  /** 縮圖（長邊約 360px），介面顯示用 */
  thumb: HTMLCanvasElement;
  hash: string;
  faces: FaceInfo | null;
  score: QualityScore;
  /** 影片中畫質最好的時間點（秒） */
  bestTime?: number;
}

const ANALYZE_EDGE = 512;
const THUMB_EDGE = 360;

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function fit(w: number, h: number, edge: number) {
  const k = Math.min(1, edge / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片讀取失敗'));
    img.src = src;
  });
}

function grayOf(source: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  return gray;
}

async function measure(source: CanvasImageSource, w: number, h: number) {
  const a = fit(w, h, ANALYZE_EDGE);
  const analysis = canvasOf(a.w, a.h);
  analysis.getContext('2d')!.drawImage(source, 0, 0, a.w, a.h);
  const gray = grayOf(analysis, a.w, a.h);
  const { mean, std } = meanAndStd(gray);
  const sharpness = laplacianVariance(gray, a.w, a.h);
  const hash = dHash(grayOf(analysis, 9, 8));
  const faces = await detectFaces(analysis);
  const score = scoreQuality({ sharpness, brightness: mean, contrast: std, faces });
  const t = fit(w, h, THUMB_EDGE);
  const thumb = canvasOf(t.w, t.h);
  thumb.getContext('2d')!.drawImage(analysis, 0, 0, t.w, t.h);
  return { hash, faces, score, thumb };
}

async function analyzeImage(file: File): Promise<MediaItem> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const m = await measure(img, img.naturalWidth, img.naturalHeight);
    return { id: newId(), file, kind: 'image', width: img.naturalWidth, height: img.naturalHeight, ...m };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitEvent(el: HTMLMediaElement, ev: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error('影片讀取逾時'));
    }, timeout);
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error('影片讀取失敗（格式可能不支援）'));
    };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(ev, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(ev, ok);
    el.addEventListener('error', bad);
  });
}

export function createVideoElement(src: string): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = src;
  return v;
}

export async function seekVideo(v: HTMLVideoElement, time: number) {
  if (Math.abs(v.currentTime - time) < 0.01 && v.readyState >= 2) return;
  const p = waitEvent(v, 'seeked');
  v.currentTime = time;
  await p;
}

async function analyzeVideo(file: File): Promise<MediaItem> {
  const url = URL.createObjectURL(file);
  const v = createVideoElement(url);
  try {
    if (v.readyState < 1) await waitEvent(v, 'loadedmetadata');
    const duration = isFinite(v.duration) ? v.duration : 0;
    const w = v.videoWidth;
    const h = v.videoHeight;
    let best: (Awaited<ReturnType<typeof measure>> & { time: number }) | null = null;
    for (const f of [0.25, 0.5, 0.75]) {
      const time = Math.max(0, Math.min(duration - 0.1, duration * f));
      try {
        await seekVideo(v, time);
        const m = await measure(v, w, h);
        if (!best || m.score.total > best.score.total) best = { ...m, time };
      } catch {
        // 某些畫面讀不到就跳過
      }
    }
    if (!best) throw new Error('讀不到影片畫面');
    const { time, ...m } = best;
    return { id: newId(), file, kind: 'video', width: w, height: h, duration, bestTime: time, ...m };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

export async function analyzeFiles(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<{ items: MediaItem[]; failed: string[] }> {
  const items: MediaItem[] = [];
  const failed: string[] = [];
  let done = 0;
  for (const f of files) {
    try {
      if (f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name)) items.push(await analyzeVideo(f));
      else items.push(await analyzeImage(f));
    } catch (e) {
      console.warn(f.name, e);
      failed.push(f.name);
    }
    done++;
    onProgress(done, files.length);
  }
  return { items, failed };
}

/** 輸出時才讀原圖（長邊最多 maxEdge，避免手機記憶體不夠） */
export async function loadFullImage(item: MediaItem, maxEdge = 1600): Promise<HTMLCanvasElement> {
  if (item.kind === 'video') return grabVideoFrame(item.file, item.bestTime ?? 0, maxEdge);
  const url = URL.createObjectURL(item.file);
  try {
    const img = await loadImageElement(url);
    const s = fit(img.naturalWidth, img.naturalHeight, maxEdge);
    const c = canvasOf(s.w, s.h);
    c.getContext('2d')!.drawImage(img, 0, 0, s.w, s.h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function grabVideoFrame(file: File, time: number, maxEdge = 1600): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  const v = createVideoElement(url);
  try {
    if (v.readyState < 1) await waitEvent(v, 'loadedmetadata');
    await seekVideo(v, time);
    const s = fit(v.videoWidth, v.videoHeight, maxEdge);
    const c = canvasOf(s.w, s.h);
    c.getContext('2d')!.drawImage(v, 0, 0, s.w, s.h);
    return c;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
