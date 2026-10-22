/**
 * 照片品質的計算（純數學，不需要瀏覽器，方便測試）。
 * gray：灰階像素（0~255），寬 w、高 h。
 */

/** 清晰度：拉普拉斯運算的變異數，越大代表邊緣越銳利 */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function meanAndStd(gray: ArrayLike<number>): { mean: number; std: number } {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    sumSq += gray[i] * gray[i];
  }
  const mean = sum / gray.length;
  return { mean, std: Math.sqrt(Math.max(0, sumSq / gray.length - mean * mean)) };
}

/** 9x8 灰階縮圖 → 64 位元的差異雜湊（用來找出相似的連拍），回傳 16 個十六進位字元 */
export function dHash(gray9x8: ArrayLike<number>): string {
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += gray9x8[y * 9 + x] < gray9x8[y * 9 + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export interface FaceInfo {
  count: number;
  /** 最大那張臉的中心（0~1） */
  cx: number;
  cy: number;
  /** 臉佔畫面的比例 */
  area: number;
}

export interface QualityMetrics {
  sharpness: number;
  brightness: number;
  contrast: number;
  faces: FaceInfo | null;
}

export interface QualityScore {
  total: number;
  sharp: number;
  exposure: number;
  face: number;
  /** 不推薦的原因（太模糊、太暗、太亮） */
  issue?: 'blurry' | 'dark' | 'bright';
}

export function scoreQuality(m: QualityMetrics): QualityScore {
  const sharp = 1 - Math.exp(-m.sharpness / 120);
  const exposure = Math.max(0, 1 - Math.abs(m.brightness - 128) / 128);
  const contrast = Math.min(1, m.contrast / 60);
  let face = 0;
  if (m.faces && m.faces.count > 0) face = 0.25 + Math.min(0.15, m.faces.area * 1.5);
  const total = 0.45 * sharp + 0.25 * exposure + 0.1 * contrast + face;
  let issue: QualityScore['issue'];
  if (m.brightness < 35) issue = 'dark';
  else if (m.brightness > 235) issue = 'bright';
  else if (sharp < 0.18) issue = 'blurry';
  return { total, sharp, exposure, face, issue };
}
