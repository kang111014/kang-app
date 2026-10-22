import { z } from 'zod';
import type { StoryTemplate } from './types';

/** 版型 JSON 的檢查規則（讀取使用者／Claude 產生的版型時用來把關） */
const color = z.string().min(1).max(40);
const num = z.number().finite();

export const backgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color }),
  z.object({ type: z.literal('gradient'), colors: z.array(color).min(2).max(5), angle: num.optional() }),
  z.object({
    type: z.literal('pattern'),
    pattern: z.enum(['dots', 'grid', 'stripes', 'checker']),
    base: color,
    ink: color,
    size: num.optional(),
    opacity: num.optional(),
  }),
  z.object({ type: z.literal('image'), src: z.string(), dim: num.optional() }),
  z.object({ type: z.literal('blur'), tint: color.optional(), tintOpacity: num.optional() }),
  z.object({ type: z.literal('stock'), query: z.string().optional(), tint: color.optional(), tintOpacity: num.optional(), fallback: color.optional() }),
]);

export const slotSchema = z.object({
  id: z.string(),
  role: z.enum(['main', 'photo']),
  x: num,
  y: num,
  w: num.positive(),
  h: num.positive(),
  rotate: num.optional(),
  shape: z.enum(['rect', 'ellipse', 'arch']).optional(),
  radius: num.optional(),
  frame: z.object({ width: num, color, style: z.enum(['plain', 'polaroid']).optional() }).optional(),
  shadow: z.boolean().optional(),
});

export const decorationSchema = z.object({
  type: z.enum(['circle', 'ring', 'rect', 'tape', 'star', 'sparkle', 'heart', 'flower', 'dots', 'wave', 'line', 'filmholes', 'confetti', 'blob', 'image']),
  x: num,
  y: num,
  w: num,
  h: num,
  rotate: num.optional(),
  color: color.optional(),
  opacity: num.optional(),
  stroke: num.optional(),
  src: z.string().optional(),
  animate: z.enum(['twinkle', 'float', 'spin']).optional(),
  above: z.boolean().optional(),
});

export const templateSchema = z.object({
  schema: z.literal(1),
  id: z.string(),
  name: z.string(),
  source: z.enum(['builtin', 'user', 'claude']),
  backgrounds: z.array(backgroundSchema).min(1),
  slots: z.array(slotSchema).min(1),
  decorations: z.array(decorationSchema).optional(),
  overlay: z.string().optional(),
  stickers: z.tuple([num, num]).optional(),
  mood: z.enum(['light', 'dark', 'any']).optional(),
  createdAt: num.optional(),
  updatedAt: num.optional(),
  deletedAt: num.nullable().optional(),
});

export function parseTemplate(data: unknown): StoryTemplate {
  const t = templateSchema.parse(data) as StoryTemplate;
  if (!t.slots.some((s) => s.role === 'main')) {
    // 沒有主格就把最大的那格當主格
    const biggest = t.slots.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    biggest.role = 'main';
  }
  return t;
}
