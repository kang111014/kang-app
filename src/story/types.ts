/**
 * 限時動態版型格式（第 1 版）。
 *
 * 畫布固定 1080 x 1920（9:16），所有座標都用這個尺寸的像素。
 * 顏色可以寫色碼（#ffffff）或配色代號：
 *   p0 = 背景色、p1 = 次要底色、p2 = 主強調色、p3 = 副強調色、p4 = 深色（線條）
 * 配色每次「換一個」都會隨機換，所以用代號的版型會自動變色。
 *
 * 版型資料就是純 JSON，內建版型放在 src/templates/builtin/*.json，
 * 使用者在 App 內做的版型存在手機的資料庫裡（同樣格式）。
 * 圖片來源寫法：
 *   "asset:<id>"  手機資料庫裡的圖片（版型編輯器上傳的背景、邊框）
 *   "builtin:<檔名>"  網站內建圖片（public/template-assets/ 底下）
 *   "https://..."  網路圖片（需允許跨網域讀取）
 */
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export type ColorRef = string;

export interface StoryTemplate {
  schema: 1;
  id: string;
  name: string;
  source: 'builtin' | 'user' | 'claude';
  /** 可放多個背景候選，每次隨機挑一個 */
  backgrounds: Background[];
  slots: Slot[];
  decorations?: Decoration[];
  /** 疊在照片上方的邊框圖（透明 PNG） */
  overlay?: string;
  /** 隨機貼圖數量 [最少, 最多] */
  stickers?: [number, number];
  /** 這個版型偏好的配色調性 */
  mood?: 'light' | 'dark' | 'any';
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
}

export type Background =
  | { type: 'solid'; color: ColorRef }
  | { type: 'gradient'; colors: ColorRef[]; angle?: number }
  | { type: 'pattern'; pattern: 'dots' | 'grid' | 'stripes' | 'checker'; base: ColorRef; ink: ColorRef; size?: number; opacity?: number }
  | { type: 'image'; src: string; dim?: number }
  /** 用主照片模糊放大當背景 */
  | { type: 'blur'; tint?: ColorRef; tintOpacity?: number }
  /** 網路圖庫背景（Unsplash / Pexels / 免金鑰隨機圖），沒網路時退回 fallback */
  | { type: 'stock'; query?: string; tint?: ColorRef; tintOpacity?: number; fallback?: ColorRef };

export interface Slot {
  id: string;
  /** main = 主格（短影片時放影片），photo = 照片格 */
  role: 'main' | 'photo';
  x: number;
  y: number;
  w: number;
  h: number;
  /** 旋轉角度（度） */
  rotate?: number;
  shape?: 'rect' | 'ellipse' | 'arch';
  radius?: number;
  /** 外框：polaroid 是拍立得（下方較寬） */
  frame?: { width: number; color: ColorRef; style?: 'plain' | 'polaroid' };
  shadow?: boolean;
}

export type DecorationType =
  | 'circle' | 'ring' | 'rect' | 'tape' | 'star' | 'sparkle' | 'heart' | 'flower'
  | 'dots' | 'wave' | 'line' | 'filmholes' | 'confetti' | 'blob' | 'image';

export interface Decoration {
  type: DecorationType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  color?: ColorRef;
  opacity?: number;
  /** 線條粗細（ring / wave / line） */
  stroke?: number;
  /** image 用 */
  src?: string;
  /** 短影片中的小動畫 */
  animate?: 'twinkle' | 'float' | 'spin';
  /** 放在照片上方（預設在照片下方） */
  above?: boolean;
}

export type Palette = [string, string, string, string, string];

/** 一次「隨機風格」的結果 */
export interface StoryStyle {
  templateId: string;
  palette: Palette;
  backgroundIndex: number;
  seed: number;
  /** 網路下載的背景圖（已轉成本機物件網址） */
  stockImage?: string;
  /** 網路下載的貼圖（已轉成本機物件網址） */
  onlineStickers?: string[];
}
