import { timestampName } from '../core/share';
import type { Composition } from './compose';
import { renderStory } from './render';
import { CANVAS_H, CANVAS_W } from './types';

export async function exportPhoto(c: Composition): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;
  renderStory(ctx, {
    template: c.template,
    style: c.style,
    fills: c.fills,
    images: c.images,
    blurSource: c.blurSource,
    t: 0,
    animate: false,
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片輸出失敗'))), 'image/jpeg', 0.92),
  );
  return new File([blob], timestampName('story', 'jpg'), { type: 'image/jpeg' });
}
