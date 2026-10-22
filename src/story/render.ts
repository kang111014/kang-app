import { mulberry32, type Rng } from '../core/random';
import { resolveColor, withAlpha } from './palettes';
import { CANVAS_H, CANVAS_W, type Background, type Decoration, type Palette, type Slot, type StoryStyle, type StoryTemplate } from './types';

export type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap | HTMLVideoElement;

export interface FillSource {
  drawable: Drawable;
  /** 畫面重點（0~1），例如人臉位置，裁切時盡量保留 */
  focus?: { x: number; y: number };
}

export interface SlotFill {
  sources: FillSource[];
  /** 短影片：回傳目前要畫的影片（沒有就畫 sources 的靜態畫面） */
  video?: () => HTMLVideoElement | null;
  videoFocus?: { x: number; y: number };
}

export interface RenderInput {
  template: StoryTemplate;
  style: StoryStyle;
  fills: Record<string, SlotFill>;
  /** 已載入的圖片（背景、邊框、貼圖），key 是版型裡的 src 字串 */
  images: Map<string, Drawable>;
  /** 主照片，用來做模糊背景 */
  blurSource?: Drawable;
  /** 目前時間（秒），短影片動畫用；照片輸出時為 0 */
  t: number;
  animate: boolean;
  /** 照片格輪播間隔（秒） */
  slideInterval?: number;
}

export function sizeOf(d: Drawable): { w: number; h: number } {
  if (d instanceof HTMLVideoElement) return { w: d.videoWidth, h: d.videoHeight };
  if (d instanceof HTMLImageElement) return { w: d.naturalWidth, h: d.naturalHeight };
  return { w: d.width, h: d.height };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  d: Drawable,
  x: number,
  y: number,
  w: number,
  h: number,
  focus = { x: 0.5, y: 0.5 },
  zoom = 1,
) {
  const { w: dw, h: dh } = sizeOf(d);
  if (!dw || !dh) return;
  const scale = Math.max(w / dw, h / dh) * zoom;
  const sw = w / scale;
  const sh = h / scale;
  const sx = Math.min(Math.max(focus.x * dw - sw / 2, 0), dw - sw);
  const sy = Math.min(Math.max(focus.y * dh - sh / 2, 0), dh - sh);
  ctx.drawImage(d, sx, sy, sw, sh, x, y, w, h);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function shapePath(ctx: CanvasRenderingContext2D, shape: Slot['shape'], x: number, y: number, w: number, h: number, radius = 0) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'arch') {
    const r = Math.min(w / 2, h);
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, w, h, radius);
  }
}

// ---------- 背景 ----------

const blurCache = new WeakMap<object, HTMLCanvasElement>();

/** 模糊背景：支援 canvas filter 的瀏覽器直接模糊；不支援的就縮小再分段放大 */
function blurredOf(d: Drawable): HTMLCanvasElement {
  const key = d as object;
  const hit = blurCache.get(key);
  if (hit && !(d instanceof HTMLVideoElement)) return hit;
  const out = document.createElement('canvas');
  out.width = 270;
  out.height = 480;
  const octx = out.getContext('2d')!;
  if ('filter' in octx && typeof octx.filter === 'string') {
    octx.filter = 'blur(14px)';
    drawCover(octx, d, -30, -30, 330, 540);
    octx.filter = 'none';
    if (octx.getImageData(135, 240, 1, 1).data[3] > 0) {
      blurCache.set(key, out);
      return out;
    }
  }
  // 備案：36x64 → 72x128 → 135x240 → 270x480，每次放大都平滑一次
  let cur = document.createElement('canvas');
  cur.width = 36;
  cur.height = 64;
  drawCover(cur.getContext('2d')!, d, 0, 0, 36, 64);
  for (const [w, h] of [[72, 128], [135, 240], [270, 480]]) {
    const next = w === 270 ? out : document.createElement('canvas');
    next.width = w;
    next.height = h;
    const nctx = next.getContext('2d')!;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(cur, 0, 0, w, h);
    cur = next;
  }
  blurCache.set(key, out);
  return out;
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, input: RenderInput) {
  const p = input.style.palette;
  const W = CANVAS_W;
  const H = CANVAS_H;
  const fillAll = (c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  };
  switch (bg.type) {
    case 'solid':
      fillAll(resolveColor(bg.color, p));
      break;
    case 'gradient': {
      const a = ((bg.angle ?? 180) - 90) * (Math.PI / 180);
      const len = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a));
      const cx = W / 2;
      const cy = H / 2;
      const g = ctx.createLinearGradient(cx - (Math.cos(a) * len) / 2, cy - (Math.sin(a) * len) / 2, cx + (Math.cos(a) * len) / 2, cy + (Math.sin(a) * len) / 2);
      bg.colors.forEach((c, i) => g.addColorStop(i / (bg.colors.length - 1), resolveColor(c, p)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'pattern': {
      fillAll(resolveColor(bg.base, p));
      const ink = resolveColor(bg.ink, p);
      const s = bg.size ?? 48;
      ctx.save();
      ctx.globalAlpha = bg.opacity ?? 0.6;
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      if (bg.pattern === 'dots') {
        for (let y = s / 2; y < H; y += s) for (let x = (Math.round(y / s) % 2 ? s : s / 2); x < W; x += s) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (bg.pattern === 'grid') {
        ctx.lineWidth = 2;
        for (let x = 0; x < W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      } else if (bg.pattern === 'stripes') {
        for (let x = -H; x < W; x += s) {
          ctx.beginPath();
          ctx.moveTo(x, H);
          ctx.lineTo(x + H, 0);
          ctx.lineTo(x + H + s / 2, 0);
          ctx.lineTo(x + s / 2, H);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        for (let y = 0; y < H; y += s) for (let x = (Math.round(y / s) % 2) * s; x < W; x += s * 2) ctx.fillRect(x, y, s, s);
      }
      ctx.restore();
      break;
    }
    case 'image': {
      const img = input.images.get(bg.src);
      if (img) drawCover(ctx, img, 0, 0, W, H);
      else fillAll(p[0]);
      if (bg.dim) {
        ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'blur': {
      if (input.blurSource) {
        drawCover(ctx, blurredOf(input.blurSource), 0, 0, W, H, undefined, 1.15);
      } else fillAll(p[0]);
      if (bg.tint) {
        ctx.fillStyle = withAlpha(resolveColor(bg.tint, p), bg.tintOpacity ?? 0.3);
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'stock': {
      const img = input.style.stockImage ? input.images.get(input.style.stockImage) : undefined;
      if (img) {
        drawCover(ctx, img, 0, 0, W, H);
        if (bg.tint) {
          ctx.fillStyle = withAlpha(resolveColor(bg.tint, p), bg.tintOpacity ?? 0.3);
          ctx.fillRect(0, 0, W, H);
        }
      } else fillAll(resolveColor(bg.fallback ?? 'p0', p));
      break;
    }
  }
}

/** 版型的背景候選中，實際要用哪一個（網路背景沒載到時會自動跳過） */
export function pickBackground(template: StoryTemplate, style: StoryStyle, hasBlurSource: boolean): Background {
  const list = template.backgrounds;
  let bg = list[style.backgroundIndex % list.length];
  if (bg.type === 'blur' && !hasBlurSource) bg = list.find((b) => b.type !== 'blur' && b.type !== 'stock') ?? { type: 'solid', color: 'p0' };
  return bg;
}

// ---------- 裝飾 ----------

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h);
  ctx.bezierCurveTo(x - w * 0.1, y + h * 0.55, x, y - h * 0.05, x + w / 4, y + h * 0.02);
  ctx.bezierCurveTo(x + w * 0.4, y, x + w / 2, y + h * 0.15, x + w / 2, y + h * 0.25);
  ctx.bezierCurveTo(x + w / 2, y + h * 0.15, x + w * 0.6, y, x + w * 0.75, y + h * 0.02);
  ctx.bezierCurveTo(x + w, y - h * 0.05, x + w * 1.1, y + h * 0.55, x + w / 2, y + h);
  ctx.closePath();
}

export function drawDecoration(ctx: CanvasRenderingContext2D, d: Decoration, input: RenderInput, phase = 0) {
  const p = input.style.palette;
  const color = resolveColor(d.color ?? 'p2', p);
  const t = input.animate ? input.t : 0;
  let { x, y } = d;
  const { w, h } = d;
  let rot = d.rotate ?? 0;
  let scale = 1;
  let alpha = d.opacity ?? 1;
  if (input.animate && d.animate === 'float') y += Math.sin(t * 1.6 + phase) * 14;
  if (input.animate && d.animate === 'spin') rot += t * 25;
  if (input.animate && d.animate === 'twinkle') {
    const s = Math.sin(t * 3 + phase);
    scale = 0.88 + 0.12 * s;
    alpha *= 0.75 + 0.25 * s;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(scale, scale);
  x = -w / 2;
  y = -h / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = d.stroke ?? 6;
  ctx.lineCap = 'round';

  switch (d.type) {
    case 'circle':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'rect':
      ctx.fillRect(x, y, w, h);
      break;
    case 'tape': {
      ctx.beginPath();
      // 紙膠帶：兩端鋸齒
      const teeth = 5;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      for (let i = 0; i <= teeth; i++) ctx.lineTo(x + w - (i % 2 ? 8 : 0), y + (h * i) / teeth);
      ctx.lineTo(x, y + h);
      for (let i = teeth; i >= 0; i--) ctx.lineTo(x + (i % 2 ? 8 : 0), y + (h * i) / teeth);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha *= 0.25;
      ctx.fillStyle = '#ffffff';
      for (let sx = x + 14; sx < x + w - 10; sx += 22) ctx.fillRect(sx, y, 8, h);
      break;
    }
    case 'star':
      starPath(ctx, 0, 0, w / 2, w / 4.4, 5);
      ctx.fill();
      break;
    case 'sparkle':
      starPath(ctx, 0, 0, w / 2, w / 9, 4);
      ctx.fill();
      break;
    case 'heart':
      heartPath(ctx, x, y, w, h);
      ctx.fill();
      break;
    case 'flower': {
      const r = w / 4.2;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, r, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = p[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.8, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dots': {
      const s = 34;
      for (let yy = y; yy <= y + h; yy += s) for (let xx = x; xx <= x + w; xx += s) {
        ctx.beginPath();
        ctx.arc(xx, yy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'wave': {
      ctx.beginPath();
      const amp = h / 2;
      for (let xx = 0; xx <= w; xx += 8) {
        const yy = Math.sin((xx / w) * Math.PI * 6 + t * 2) * amp;
        if (xx === 0) ctx.moveTo(x + xx, yy);
        else ctx.lineTo(x + xx, yy);
      }
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      break;
    case 'filmholes': {
      const step = w * 2;
      for (let yy = y; yy + w * 1.2 <= y + h; yy += step) {
        ctx.beginPath();
        roundRectPath(ctx, x, yy, w, w * 1.2, 6);
        ctx.fill();
      }
      break;
    }
    case 'confetti': {
      const rng = mulberry32(input.style.seed + 77);
      const colors = [p[0], p[2], p[3], '#ffffff'];
      for (let i = 0; i < 40; i++) {
        const cx = x + rng() * w;
        const cy = y + ((rng() * h + (input.animate ? t * 40 * (0.5 + rng()) : 0)) % h);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rng() * Math.PI + t);
        ctx.fillStyle = colors[i % colors.length];
        if (i % 3 === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-12, -5, 24, 10);
        ctx.restore();
      }
      break;
    }
    case 'blob': {
      const rng = mulberry32(Math.round(d.x * 7 + d.y * 13));
      const pts = 8;
      const radii = Array.from({ length: pts }, () => 0.8 + rng() * 0.25);
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = radii[i % pts];
        const px = (Math.cos(a) * w * r) / 2;
        const py = (Math.sin(a) * h * r) / 2;
        if (i === 0) ctx.moveTo(px, py);
        else {
          const pa = ((i - 0.5) / pts) * Math.PI * 2;
          const pr = (radii[(i - 1) % pts] + r) / 2 + 0.08;
          ctx.quadraticCurveTo((Math.cos(pa) * w * pr) / 2, (Math.sin(pa) * h * pr) / 2, px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'image': {
      const img = d.src ? input.images.get(d.src) : undefined;
      if (img) {
        const s = sizeOf(img);
        const k = Math.min(w / s.w, h / s.h);
        ctx.drawImage(img, -(s.w * k) / 2, -(s.h * k) / 2, s.w * k, s.h * k);
      }
      break;
    }
  }
  ctx.restore();
}

// ---------- 隨機貼圖 ----------

export interface StickerPlacement {
  deco: Decoration;
}

/** 依照風格的 seed 決定貼圖放哪裡（同一個風格每次都一樣） */
export function stickerPlacements(template: StoryTemplate, style: StoryStyle): Decoration[] {
  const [min, max] = template.stickers ?? [0, 2];
  const rng: Rng = mulberry32(style.seed + 101);
  const count = Math.round(min + rng() * Math.max(0, max - min));
  const online = style.onlineStickers ?? [];
  const kinds: Decoration['type'][] = ['star', 'sparkle', 'heart', 'flower'];
  const out: Decoration[] = [];
  for (let i = 0; i < count; i++) {
    const slot = template.slots[Math.floor(rng() * template.slots.length)];
    const cornerX = rng() < 0.5 ? slot.x : slot.x + slot.w;
    const cornerY = rng() < 0.5 ? slot.y : slot.y + slot.h;
    const size = 110 + rng() * 80;
    const useOnline = online.length > 0 && rng() < 0.7;
    out.push({
      type: useOnline ? 'image' : kinds[Math.floor(rng() * kinds.length)],
      src: useOnline ? online[i % online.length] : undefined,
      x: Math.min(Math.max(cornerX - size / 2, 10), CANVAS_W - size - 10),
      y: Math.min(Math.max(cornerY - size / 2, 10), CANVAS_H - size - 10),
      w: size,
      h: size,
      rotate: (rng() - 0.5) * 40,
      color: rng() < 0.5 ? 'p2' : 'p3',
      animate: rng() < 0.5 ? 'twinkle' : 'float',
      above: true,
    });
  }
  return out;
}

// ---------- 照片格 ----------

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, palette: Palette) {
  ctx.fillStyle = palette[0];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = withAlpha(palette[4], 0.15);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = withAlpha(palette[4], 0.35);
  const s = Math.min(w, h) * 0.25;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - s, y + h / 2 + s * 0.6);
  ctx.lineTo(x + w / 2 - s * 0.2, y + h / 2 - s * 0.4);
  ctx.lineTo(x + w / 2 + s * 0.3, y + h / 2 + s * 0.2);
  ctx.lineTo(x + w / 2 + s * 0.6, y + h / 2 - s * 0.1);
  ctx.lineTo(x + w / 2 + s, y + h / 2 + s * 0.6);
  ctx.closePath();
  ctx.fill();
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: Slot, index: number, input: RenderInput) {
  const p = input.style.palette;
  const fill = input.fills[slot.id];
  ctx.save();
  ctx.translate(slot.x + slot.w / 2, slot.y + slot.h / 2);
  ctx.rotate(((slot.rotate ?? 0) * Math.PI) / 180);
  const x = -slot.w / 2;
  const y = -slot.h / 2;
  const radius = slot.radius ?? 0;

  // 外框與陰影
  const fw = slot.frame?.width ?? 0;
  const polaroid = slot.frame?.style === 'polaroid';
  const ox = x - fw;
  const oy = y - fw;
  const ow = slot.w + fw * 2;
  const oh = slot.h + fw * 2 + (polaroid ? fw * 2.6 : 0);
  if (slot.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    shapePath(ctx, slot.shape, ox, oy, ow, oh, radius + fw);
    ctx.fillStyle = fw ? resolveColor(slot.frame!.color, p) : p[1];
    ctx.fill();
    ctx.restore();
  }
  if (fw) {
    shapePath(ctx, slot.shape, ox, oy, ow, oh, radius + fw);
    ctx.fillStyle = resolveColor(slot.frame!.color, p);
    ctx.fill();
  }

  // 內容
  ctx.save();
  shapePath(ctx, slot.shape, x, y, slot.w, slot.h, radius);
  ctx.clip();
  const video = fill?.video?.();
  if (video && video.readyState >= 2) {
    drawCover(ctx, video, x, y, slot.w, slot.h, fill?.videoFocus);
  } else if (fill && fill.sources.length) {
    const n = fill.sources.length;
    const interval = input.slideInterval ?? 3;
    if (input.animate && n > 1 && !fill.video) {
      const tt = input.t + index * 0.9;
      const k = Math.floor(tt / interval);
      const local = tt - k * interval;
      const cur = fill.sources[k % n];
      const zoom = 1 + 0.06 * (local / interval);
      drawCover(ctx, cur.drawable, x, y, slot.w, slot.h, cur.focus, zoom);
      const fade = 0.6;
      if (local > interval - fade) {
        const next = fill.sources[(k + 1) % n];
        ctx.globalAlpha = (local - (interval - fade)) / fade;
        drawCover(ctx, next.drawable, x, y, slot.w, slot.h, next.focus, 1);
        ctx.globalAlpha = 1;
      }
    } else {
      const src = fill.sources[0];
      const zoom = input.animate ? 1 + 0.05 * ((input.t % 8) / 8) : 1;
      drawCover(ctx, src.drawable, x, y, slot.w, slot.h, src.focus, zoom);
    }
  } else {
    drawPlaceholder(ctx, x, y, slot.w, slot.h, p);
  }
  ctx.restore();

  if (fw && slot.frame?.width && slot.frame.width <= 4) {
    // 細線框畫在照片上面
    shapePath(ctx, slot.shape, x - fw / 2, y - fw / 2, slot.w + fw, slot.h + fw, radius);
    ctx.lineWidth = fw;
    ctx.strokeStyle = resolveColor(slot.frame.color, p);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- 主流程 ----------

export function renderStory(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { template, style } = input;
  ctx.save();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground(ctx, pickBackground(template, style, !!input.blurSource), input);
  const decos = template.decorations ?? [];
  decos.forEach((d, i) => !d.above && drawDecoration(ctx, d, input, i));
  template.slots.forEach((s, i) => drawSlot(ctx, s, i, input));
  if (template.overlay) {
    const ov = input.images.get(template.overlay);
    if (ov) ctx.drawImage(ov, 0, 0, CANVAS_W, CANVAS_H);
  }
  decos.forEach((d, i) => d.above && drawDecoration(ctx, d, input, i));
  stickerPlacements(template, style).forEach((d, i) => drawDecoration(ctx, d, input, i + 10));
  ctx.restore();
}

/** 版型中所有需要先載入的圖片網址 */
export function templateImageSources(template: StoryTemplate): string[] {
  const out = new Set<string>();
  template.backgrounds.forEach((b) => b.type === 'image' && out.add(b.src));
  if (template.overlay) out.add(template.overlay);
  template.decorations?.forEach((d) => d.type === 'image' && d.src && out.add(d.src));
  return [...out];
}
