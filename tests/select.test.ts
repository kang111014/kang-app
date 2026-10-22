import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/random';
import { assignToSlots, autoSelect, type Candidate } from '../src/media/select';

const q = (total: number, issue?: 'blurry' | 'dark') => ({ total, sharp: total, exposure: 1, face: 0, issue });

describe('自動挑選', () => {
  it('相似連拍只留分數最高的', () => {
    const items: Candidate[] = [
      { id: 'a', kind: 'image', hash: '0000000000000000', score: q(0.5), hasFace: false },
      { id: 'b', kind: 'image', hash: '0000000000000001', score: q(0.8), hasFace: false },
      { id: 'c', kind: 'image', hash: 'ffffffffffffffff', score: q(0.6), hasFace: false },
    ];
    const r = autoSelect(items);
    expect(r.picked).toEqual(['b', 'c']);
    expect(r.rejected.a).toBe('similar');
  });

  it('模糊照片被淘汰，但素材太少時保留', () => {
    const many: Candidate[] = ['0f', 'f0', '33', 'cc'].map((h, i) => ({
      id: String(i),
      kind: 'image',
      hash: h.repeat(8),
      score: q(0.5, i === 0 ? 'blurry' : undefined),
      hasFace: false,
    }));
    expect(autoSelect(many).rejected['0']).toBe('blurry');
    expect(autoSelect(many.slice(0, 1)).picked).toEqual(['0']);
  });

  it('影片一定保留', () => {
    const r = autoSelect([{ id: 'v', kind: 'video', hash: '0'.repeat(16), score: q(0.1, 'dark'), hasFace: false }]);
    expect(r.picked).toEqual(['v']);
  });

  it('分配格子：主格放有人臉的高分照片，照片多時每格會輪播', () => {
    const items: Candidate[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      kind: 'image' as const,
      hash: '',
      score: q(1 - i * 0.1),
      hasFace: i === 1,
    }));
    const out = assignToSlots(items, { main: 'main', photos: ['a', 'b'] }, mulberry32(1), true);
    expect(out.main[0].id).toBe('1');
    expect(out.a.length + out.b.length).toBe(5);
    const single = assignToSlots(items, { main: 'main', photos: ['a', 'b'] }, mulberry32(1), false);
    expect(single.a).toHaveLength(1);
  });
});
