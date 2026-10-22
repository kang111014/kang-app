import { mulberry32, pick, randomSeed } from '../core/random';
import type { Settings } from '../core/settings';
import { getOnlinePalettes } from '../online/palettes';
import { fetchStockBackground } from '../online/stock';
import { fetchRandomStickers } from '../online/stickers';
import { arrangePalette, BUILTIN_PALETTES, isDark } from './palettes';
import type { Palette, StoryStyle, StoryTemplate } from './types';

export interface StyleOptions {
  templates: StoryTemplate[];
  /** 可用的照片數量（影片模式時不含影片） */
  photoCount: number;
  /** 固定用這個版型（只換配色） */
  lockTemplateId?: string;
  /** 避免連續抽到同一個版型 */
  previousTemplateId?: string;
  settings: Settings;
}

/** 照片數量和版型格數越接近越容易被抽中 */
function templateWeight(t: StoryTemplate, photoCount: number) {
  const slots = t.slots.length;
  const diff = Math.abs(slots - Math.max(1, photoCount));
  return 1 / (1 + diff * 0.7);
}

async function palettePool(settings: Settings): Promise<Palette[]> {
  const pool = BUILTIN_PALETTES.slice();
  if (settings.useOnline) {
    const online = await getOnlinePalettes();
    return pool.concat(online.map((c) => c.slice(0, 5) as Palette));
  }
  return pool;
}

export async function randomStyle(opts: StyleOptions): Promise<{ style: StoryStyle; template: StoryTemplate }> {
  const seed = randomSeed();
  const rng = mulberry32(seed);
  let template = opts.templates.find((t) => t.id === opts.lockTemplateId);
  if (!template) {
    const candidates = opts.templates.filter((t) => t.id !== opts.previousTemplateId);
    const list = candidates.length ? candidates : opts.templates;
    const weights = list.map((t) => templateWeight(t, opts.photoCount));
    let r = rng() * weights.reduce((s, w) => s + w, 0);
    template = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        template = list[i];
        break;
      }
    }
  }
  const pool = await palettePool(opts.settings);
  const raw = pick(rng, pool);
  const wantDark = template.mood === 'dark' ? true : template.mood === 'light' ? false : rng() < 0.25;
  const palette = BUILTIN_PALETTES.includes(raw) && isDark(raw) === wantDark ? raw : arrangePalette(raw.slice(), wantDark);
  let backgroundIndex = Math.floor(rng() * template.backgrounds.length);
  // 不能上網時不要抽到網路背景
  if (!opts.settings.useOnline && template.backgrounds[backgroundIndex].type === 'stock') {
    const alt = template.backgrounds.findIndex((b) => b.type !== 'stock');
    if (alt >= 0) backgroundIndex = alt;
  }
  return { template, style: { templateId: template.id, palette, backgroundIndex, seed } };
}

/** 有開啟網路素材時，下載這次風格需要的背景與貼圖（失敗就安靜略過） */
export async function enrichStyleOnline(
  style: StoryStyle,
  template: StoryTemplate,
  settings: Settings,
): Promise<{ style: StoryStyle; credit?: string }> {
  if (!settings.useOnline) return { style };
  const next = { ...style };
  let credit: string | undefined;
  const rng = mulberry32(style.seed + 5);
  const bg = template.backgrounds[style.backgroundIndex % template.backgrounds.length];
  const jobs: Promise<void>[] = [];
  if (bg.type === 'stock') {
    jobs.push(
      fetchStockBackground(bg.query ?? 'texture', settings, style.seed)
        .then((r) => {
          next.stockImage = r.url;
          credit = r.credit;
        })
        .catch(() => {}),
    );
  }
  const [, max] = template.stickers ?? [0, 2];
  if (max > 0 && rng() < 0.6) {
    jobs.push(
      fetchRandomStickers(rng, Math.min(3, max))
        .then((list) => {
          if (list.length) next.onlineStickers = list;
        })
        .catch(() => {}),
    );
  }
  await Promise.all(jobs);
  return { style: next, credit };
}
