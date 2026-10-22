import { describe, expect, it } from 'vitest';
import { dHash, hamming, laplacianVariance, meanAndStd, scoreQuality } from '../src/media/metrics';

function img(w: number, h: number, f: (x: number, y: number) => number) {
  const a = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
  return a;
}

describe('品質計算', () => {
  it('銳利的棋盤格比平滑漸層更清晰', () => {
    const sharp = img(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 255 : 0);
    const smooth = img(64, 64, (x) => x * 4);
    expect(laplacianVariance(sharp, 64, 64)).toBeGreaterThan(laplacianVariance(smooth, 64, 64) * 100);
  });

  it('亮度平均與標準差', () => {
    const { mean, std } = meanAndStd([0, 255, 0, 255]);
    expect(mean).toBeCloseTo(127.5);
    expect(std).toBeCloseTo(127.5);
  });

  it('相同圖片雜湊距離為 0，反相圖片距離很大', () => {
    const a = img(9, 8, (x, y) => (x * 25 + y * 3) % 256);
    const b = img(9, 8, (x, y) => 255 - ((x * 25 + y * 3) % 256));
    expect(dHash(a)).toHaveLength(16);
    expect(hamming(dHash(a), dHash(a))).toBe(0);
    expect(hamming(dHash(a), dHash(b))).toBeGreaterThan(40);
  });

  it('有人臉加分、太暗會被標記', () => {
    const base = { sharpness: 300, brightness: 128, contrast: 50, faces: null };
    const withFace = { ...base, faces: { count: 1, cx: 0.5, cy: 0.4, area: 0.05 } };
    expect(scoreQuality(withFace).total).toBeGreaterThan(scoreQuality(base).total);
    expect(scoreQuality({ ...base, brightness: 20 }).issue).toBe('dark');
    expect(scoreQuality({ ...base, sharpness: 5 }).issue).toBe('blurry');
  });
});
