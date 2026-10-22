import { describe, expect, it } from 'vitest';
import { arrangePalette, isDark, resolveColor } from '../src/story/palettes';
import { parseTemplate } from '../src/story/schema';
import { BUILTIN_TEMPLATES } from '../src/story/templates';
import { CANVAS_H, CANVAS_W } from '../src/story/types';

describe('內建版型', () => {
  it('有 10 個，而且格式都正確', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(10);
    const ids = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(10);
  });

  it('每個版型剛好一個主格，格子都在畫布內', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.slots.filter((s) => s.role === 'main'), t.id).toHaveLength(1);
      for (const s of t.slots) {
        expect(s.x + s.w / 2, `${t.id}/${s.id}`).toBeGreaterThan(0);
        expect(s.x + s.w / 2).toBeLessThan(CANVAS_W);
        expect(s.y + s.h / 2).toBeGreaterThan(0);
        expect(s.y + s.h / 2).toBeLessThan(CANVAS_H);
      }
    }
  });

  it('沒有主格時自動把最大的格子設為主格', () => {
    const t = parseTemplate({
      schema: 1, id: 'x', name: 'x', source: 'user', backgrounds: [{ type: 'solid', color: '#fff' }],
      slots: [{ id: 'a', role: 'photo', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', role: 'photo', x: 0, y: 0, w: 100, h: 100 }],
    });
    expect(t.slots[1].role).toBe('main');
  });

  it('格式錯誤會被擋下', () => {
    expect(() => parseTemplate({ schema: 1, id: 'x', name: 'x', source: 'user', backgrounds: [], slots: [] })).toThrow();
  });
});

describe('配色', () => {
  it('代號轉成色碼', () => {
    const p = ['#111111', '#222222', '#333333', '#444444', '#555555'] as const;
    expect(resolveColor('p2', [...p] as never)).toBe('#333333');
    expect(resolveColor('#abcdef', [...p] as never)).toBe('#abcdef');
  });
  it('依明暗排列色卡', () => {
    const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#888888'];
    expect(isDark(arrangePalette(colors, true))).toBe(true);
    expect(isDark(arrangePalette(colors, false))).toBe(false);
  });
});
