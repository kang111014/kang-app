import { useEffect, useRef } from 'react';
import type { MediaItem } from '../../media/load';

function Thumb({ item }: { item: MediaItem }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = item.thumb.width;
    c.height = item.thumb.height;
    c.getContext('2d')!.drawImage(item.thumb, 0, 0);
  }, [item]);
  return <canvas ref={ref} />;
}

export default function MediaGrid({
  items,
  isPicked,
  onToggle,
  reasonOf,
}: {
  items: MediaItem[];
  isPicked: (id: string) => boolean;
  onToggle: (id: string) => void;
  reasonOf: (id: string) => string | undefined;
}) {
  return (
    <div className="media-grid">
      {items.map((it) => {
        const on = isPicked(it.id);
        const reason = !on ? reasonOf(it.id) : undefined;
        return (
          <button key={it.id} className={`media-cell ${on ? '' : 'off'}`} onClick={() => onToggle(it.id)} aria-pressed={on}>
            <Thumb item={it} />
            {on && <span className="check">✓</span>}
            {reason && <span className="badge">{reason}</span>}
            {on && it.faces && it.faces.count > 0 && <span className="badge">🙂</span>}
            {it.kind === 'video' && <span className="dur">▶ {Math.round(it.duration ?? 0)}s</span>}
          </button>
        );
      })}
    </div>
  );
}
