import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { newId } from '../core/db';
import { parseTemplate } from '../story/schema';
import type { Background, Decoration, StoryTemplate } from '../story/types';

/**
 * 「App 立即分析」：把示範圖送到 Claude API，請它產生版型 JSON。
 * 只有使用者選這個方式、而且自己填了 Claude API 金鑰才會呼叫。
 * 金鑰只存在手機裡，直接從手機連到 Anthropic，不經過其他伺服器。
 */
export const CLAUDE_MODEL = 'claude-opus-5-5';

const n = z.number();
const aiSchema = z.object({
  name: z.string().describe('版型的繁體中文短名稱，2~6 個字'),
  mood: z.enum(['light', 'dark', 'any']),
  background: z.object({
    type: z.enum(['solid', 'gradient', 'pattern']),
    colors: z.array(z.string()).describe('1~3 個色碼，例如 #f5efe6'),
    pattern: z.enum(['dots', 'grid', 'stripes', 'checker', 'none']),
    angle: n,
  }),
  slots: z.array(
    z.object({
      role: z.enum(['main', 'photo']),
      x: n,
      y: n,
      w: n,
      h: n,
      rotate: n,
      shape: z.enum(['rect', 'ellipse', 'arch']),
      radius: n,
      frameWidth: n,
      frameColor: z.string(),
      polaroid: z.boolean(),
      shadow: z.boolean(),
    }),
  ),
  decorations: z.array(
    z.object({
      type: z.enum(['circle', 'ring', 'rect', 'tape', 'star', 'sparkle', 'heart', 'flower', 'dots', 'wave', 'line', 'filmholes', 'confetti', 'blob']),
      x: n,
      y: n,
      w: n,
      h: n,
      rotate: n,
      color: z.string(),
      opacity: n,
      above: z.boolean(),
    }),
  ),
  stickerCount: n,
});

const SYSTEM = `你是 IG 限時動態拼貼版型設計師。使用者會給你一張示範圖，請把它的版面拆解成版型資料。
規則：
- 畫布是 1080 x 1920 像素（9:16），座標以左上角為原點，x/y/w/h 都用這個尺寸的像素。
- slots 是放照片或影片的格子。最大、最顯眼的那一格 role 設為 "main"（短影片時會放影片），其他設 "photo"。至少 1 格，最多 6 格。
- 格子的 rotate 是角度（度），沒有旋轉就填 0。shape：一般方形 rect、圓形 ellipse、上方圓弧 arch。radius 是圓角（px）。
- 有白邊或相框就填 frameWidth 與 frameColor；拍立得樣式 polaroid 設 true；沒有框 frameWidth 填 0、frameColor 填 "#ffffff"。
- 背景：純色 solid、漸層 gradient（colors 給 2~3 色、angle 給角度）、圖樣 pattern（colors 第 1 色是底、第 2 色是圖樣）。不是圖樣時 pattern 填 "none"。
- 顏色請盡量用示範圖裡實際的色碼（#rrggbb），讓成品看起來接近示範圖。點綴裝飾也可以用 "p2"、"p3"（隨機配色的強調色）。
- decorations 是用簡單圖形模仿示範圖裡的裝飾（紙膠帶 tape、星星 star、閃光 sparkle、愛心 heart、花 flower、圓點區 dots、波浪 wave、線 line、底片孔 filmholes、彩紙 confetti、色塊 blob、圓 circle、圓環 ring、矩形 rect）。above 表示疊在照片上方。opacity 0~1。
- 不要放任何文字，文字部分直接忽略。
- stickerCount 是另外隨機加的小貼圖數量（0~4）。`;

type AiTemplate = z.infer<typeof aiSchema>;

function toTemplate(ai: AiTemplate): StoryTemplate {
  const colors = ai.background.colors.length ? ai.background.colors : ['p0'];
  let bg: Background;
  if (ai.background.type === 'gradient' && colors.length >= 2) bg = { type: 'gradient', colors, angle: ai.background.angle || 180 };
  else if (ai.background.type === 'pattern' && ai.background.pattern !== 'none')
    bg = { type: 'pattern', pattern: ai.background.pattern, base: colors[0], ink: colors[1] ?? 'p1', size: 48, opacity: 0.6 };
  else bg = { type: 'solid', color: colors[0] };

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v || 0));
  const slots = ai.slots.slice(0, 6).map((s, i) => ({
    id: s.role === 'main' ? 'main' : `s${i}`,
    role: s.role,
    x: clamp(s.x, -200, 1080),
    y: clamp(s.y, -200, 1920),
    w: clamp(s.w, 60, 1280),
    h: clamp(s.h, 60, 2100),
    rotate: clamp(s.rotate, -45, 45),
    shape: s.shape,
    radius: clamp(s.radius, 0, 400),
    frame: s.frameWidth > 0 ? { width: clamp(s.frameWidth, 1, 80), color: s.frameColor, style: s.polaroid ? ('polaroid' as const) : ('plain' as const) } : undefined,
    shadow: s.shadow,
  }));
  // 只能有一個主格
  let seenMain = false;
  slots.forEach((s, i) => {
    if (s.role === 'main') {
      if (seenMain) {
        s.role = 'photo';
        s.id = `s${i}`;
      }
      seenMain = true;
    }
  });
  const decorations: Decoration[] = ai.decorations.slice(0, 20).map((d) => ({
    type: d.type,
    x: d.x,
    y: d.y,
    w: Math.max(4, d.w),
    h: Math.max(0, d.h),
    rotate: d.rotate,
    color: d.color,
    opacity: clamp(d.opacity || 1, 0.05, 1),
    above: d.above,
  }));
  return parseTemplate({
    schema: 1,
    id: newId(),
    name: ai.name || 'Claude 版型',
    source: 'claude',
    mood: ai.mood,
    backgrounds: [bg],
    slots,
    decorations,
    stickers: [0, clamp(Math.round(ai.stickerCount), 0, 4)],
  });
}

async function imageToBase64Jpeg(file: Blob, maxEdge = 1568): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('圖片讀取失敗'));
      i.src = url;
    });
    const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function analyzeDemoImage(apiKey: string, image: Blob): Promise<StoryTemplate> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await imageToBase64Jpeg(image);
  let message;
  try {
    message = await client.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // 被安全機制拒絕時，自動改用其他模型重試
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(aiSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
            { type: 'text', text: '請把這張限時動態示範圖拆解成版型資料。' },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Claude API 金鑰無效，請到「設定」重新貼上');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('這把金鑰沒有權限，請確認 Anthropic 帳號已開通');
    if (e instanceof Anthropic.RateLimitError) throw new Error('請求太頻繁或額度不足，請稍後再試，或到 Anthropic 後台確認餘額');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('連不上 Claude，請確認網路');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude 回應錯誤（${e.status ?? ''}）：${e.message}`);
    throw e;
  }
  if (message.stop_reason === 'refusal') throw new Error('Claude 無法處理這張圖片，請換一張示範圖');
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) throw new Error('Claude 的回覆不完整，請再試一次');
  return toTemplate(message.parsed_output);
}

export async function testClaudeKey(apiKey: string): Promise<boolean> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    await client.models.retrieve(CLAUDE_MODEL);
    return true;
  } catch {
    return false;
  }
}
