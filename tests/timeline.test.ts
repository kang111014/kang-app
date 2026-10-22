import { describe, expect, it } from 'vitest';
import { planSegments, slideshowLength, totalLength } from '../src/story/timeline';

describe('影片時間軸', () => {
  it('短於 60 秒維持原樣、依序接著播', () => {
    const s = planSegments([{ id: 'a', duration: 10 }, { id: 'b', duration: 20 }]);
    expect(s).toEqual([
      { id: 'a', start: 0, length: 10, at: 0 },
      { id: 'b', start: 0, length: 20, at: 10 },
    ]);
  });

  it('單支太長的影片取中間 60 秒', () => {
    const s = planSegments([{ id: 'a', duration: 180 }]);
    expect(s[0].length).toBe(60);
    expect(s[0].start).toBe(60);
  });

  it('多支加起來太長時總長剛好 60 秒，短片段完整保留', () => {
    const s = planSegments([{ id: 'a', duration: 100 }, { id: 'b', duration: 4 }, { id: 'c', duration: 50 }]);
    expect(totalLength(s)).toBeCloseTo(60, 1);
    s.forEach((x) => expect(x.length).toBeGreaterThanOrEqual(3));
    expect(s[1].length).toBe(4);
    expect(s[0].length).toBe(28);
  });

  it('只有照片的短影片長度', () => {
    expect(slideshowLength(2)).toBe(9);
    expect(slideshowLength(20)).toBe(30);
  });
});
