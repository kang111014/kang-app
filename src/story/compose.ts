import { mulberry32 } from '../core/random';
import { loadFullImage, type MediaItem } from '../media/load';
import { assignToSlots } from '../media/select';
import { resolveImages } from './assets';
import type { Drawable, FillSource, SlotFill } from './render';
import { templateImageSources } from './render';
import { planSegments, slideshowLength, type Segment } from './timeline';
import type { StoryStyle, StoryTemplate } from './types';

export type OutputMode = 'photo' | 'video';

export interface Composition {
  mode: OutputMode;
  template: StoryTemplate;
  style: StoryStyle;
  fills: Record<string, SlotFill>;
  images: Map<string, Drawable>;
  blurSource?: Drawable;
  mainSlotId: string;
  /** 短影片：影片片段（空的代表只有照片輪播） */
  segments: Segment[];
  duration: number;
  videoItems: Map<string, MediaItem>;
}

// 原圖讀過就留著，按「換一個」時不用重讀
const fullCache = new Map<string, Promise<HTMLCanvasElement>>();
function full(item: MediaItem) {
  let p = fullCache.get(item.id);
  if (!p) {
    p = loadFullImage(item, 1400);
    fullCache.set(item.id, p);
    p.catch(() => fullCache.delete(item.id));
  }
  return p;
}

export function forgetFullImages(keepIds: Set<string>) {
  for (const id of fullCache.keys()) if (!keepIds.has(id)) fullCache.delete(id);
}

async function toSource(item: MediaItem): Promise<FillSource> {
  let drawable: Drawable;
  try {
    drawable = await full(item);
  } catch {
    drawable = item.thumb;
  }
  const f = item.faces;
  return { drawable, focus: f && f.count > 0 ? { x: f.cx, y: Math.max(0.2, f.cy - 0.05) } : undefined };
}

function candidateOf(item: MediaItem) {
  return { ...item, hasFace: !!item.faces && item.faces.count > 0 };
}

export async function buildComposition(
  picked: MediaItem[],
  mode: OutputMode,
  template: StoryTemplate,
  style: StoryStyle,
  musicSeconds?: number,
): Promise<Composition> {
  const rng = mulberry32(style.seed + 11);
  const main = template.slots.find((s) => s.role === 'main') ?? template.slots[0];
  const photoSlots = template.slots.filter((s) => s !== main).map((s) => s.id);

  const videos = picked.filter((i) => i.kind === 'video');
  const images = picked.filter((i) => i.kind === 'image');
  const useVideo = mode === 'video' && videos.length > 0;

  const pool = useVideo ? images : picked;
  const assignment = assignToSlots(
    pool.map(candidateOf),
    { main: useVideo ? null : main.id, photos: photoSlots },
    rng,
    mode === 'video',
  );
  if (useVideo && !photoSlots.length && images.length === 0) {
    // 版型只有一格又沒有照片：沒關係，只放影片
  }

  const fills: Record<string, SlotFill> = {};
  for (const [slotId, list] of Object.entries(assignment)) {
    fills[slotId] = { sources: await Promise.all(list.map((c) => toSource(c as unknown as MediaItem))) };
  }

  let segments: Segment[] = [];
  const videoItems = new Map<string, MediaItem>();
  if (useVideo) {
    videos.forEach((v) => videoItems.set(v.id, v));
    segments = planSegments(videos.map((v) => ({ id: v.id, duration: v.duration ?? 0 })));
    const first = videos[0];
    const poster = await toSource(first);
    fills[main.id] = { sources: [poster], videoFocus: poster.focus };
  } else if (mode === 'video' && fills[main.id] && pool.length > 1) {
    // 只有照片的短影片：主格也輪播
    const others = pool.filter((p) => !assignment[main.id]?.some((a) => a.id === p.id)).slice(0, 4);
    fills[main.id].sources.push(...(await Promise.all(others.map(toSource))));
  }

  const imagesMap = await resolveImages([
    ...templateImageSources(template),
    style.stockImage,
    ...(style.onlineStickers ?? []),
  ]);

  const blurSource = fills[main.id]?.sources[0]?.drawable ?? Object.values(fills)[0]?.sources[0]?.drawable;
  const duration = useVideo
    ? segments.reduce((s, x) => s + x.length, 0)
    : slideshowLength(pool.length, musicSeconds);

  return { mode, template, style, fills, images: imagesMap, blurSource, mainSlotId: main.id, segments, duration, videoItems };
}

/** 版型縮圖用：用色塊代替照片 */
export function placeholderFills(template: StoryTemplate): Record<string, SlotFill> {
  return Object.fromEntries(template.slots.map((s) => [s.id, { sources: [] }]));
}
