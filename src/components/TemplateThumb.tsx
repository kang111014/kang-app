import { useEffect, useRef } from 'react';
import { resolveImages } from '../story/assets';
import { placeholderFills } from '../story/compose';
import { BUILTIN_PALETTES } from '../story/palettes';
import { renderStory, templateImageSources } from '../story/render';
import { CANVAS_W, type Palette, type StoryTemplate } from '../story/types';

const SCALE = 0.25;

export default function TemplateThumb({ template, palette }: { template: StoryTemplate; palette?: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const images = await resolveImages(templateImageSources(template));
      const c = ref.current;
      if (!alive || !c) return;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      const pal = palette ?? (template.mood === 'dark' ? BUILTIN_PALETTES[10] : BUILTIN_PALETTES[0]);
      const bgIndex = Math.max(0, template.backgrounds.findIndex((b) => b.type !== 'blur' && b.type !== 'stock'));
      renderStory(ctx, {
        template: { ...template, stickers: [0, 0] },
        style: { templateId: template.id, palette: pal, backgroundIndex: bgIndex, seed: 1 },
        fills: placeholderFills(template),
        images,
        t: 0,
        animate: false,
      });
    })();
    return () => {
      alive = false;
    };
  }, [template, palette]);
  return <canvas ref={ref} width={CANVAS_W * SCALE} height={1920 * SCALE} />;
}
