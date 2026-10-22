import { useEffect, useRef, useState } from 'react';
import TopBar from '../../components/TopBar';
import { newId, saveAsset } from '../../core/db';
import { navigate } from '../../core/router';
import { resolveImages } from '../../story/assets';
import { placeholderFills } from '../../story/compose';
import { BUILTIN_PALETTES } from '../../story/palettes';
import { renderStory, templateImageSources, type Drawable } from '../../story/render';
import { BUILTIN_TEMPLATES, listUserTemplates, saveUserTemplate } from '../../story/templates';
import { CANVAS_H, CANVAS_W, type Slot, type StoryTemplate } from '../../story/types';
import { takeDraft } from './draft';

function blankTemplate(): StoryTemplate {
  return {
    schema: 1,
    id: newId(),
    name: '我的版型',
    source: 'user',
    mood: 'light',
    backgrounds: [{ type: 'solid', color: '#fff6ee' }],
    slots: [
      { id: 'main', role: 'main', x: 120, y: 200, w: 840, h: 1000, radius: 24 },
      { id: newId().slice(0, 8), role: 'photo', x: 120, y: 1260, w: 400, h: 480, radius: 24 },
      { id: newId().slice(0, 8), role: 'photo', x: 560, y: 1260, w: 400, h: 480, radius: 24 },
    ],
    decorations: [],
    stickers: [0, 2],
  };
}

type Drag = { id: string; kind: 'move' | 'resize'; startX: number; startY: number; orig: Slot; scale: number };

export default function TemplateEditor({ mode, id }: { mode: 'new' | 'edit' | 'copy'; id?: string }) {
  const [tpl, setTpl] = useState<StoryTemplate | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [images, setImages] = useState<Map<string, Drawable>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const ovInput = useRef<HTMLInputElement>(null);

  // 載入
  useEffect(() => {
    (async () => {
      if (mode === 'new') return setTpl(blankTemplate());
      if (id === 'draft') {
        const d = takeDraft();
        return d ? setTpl(d) : navigate('/templates');
      }
      const all = [...(await listUserTemplates()), ...BUILTIN_TEMPLATES];
      const found = all.find((t) => t.id === id);
      if (!found) return navigate('/templates');
      if (mode === 'copy') {
        const copy: StoryTemplate = JSON.parse(JSON.stringify(found));
        copy.id = newId();
        copy.name = found.name + '（複製）';
        copy.source = 'user';
        delete copy.createdAt;
        delete copy.updatedAt;
        setTpl(copy);
      } else setTpl(found);
    })();
  }, [mode, id]);

  useEffect(() => {
    if (tpl) resolveImages(templateImageSources(tpl)).then(setImages);
  }, [tpl?.backgrounds, tpl?.overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // 重畫
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !tpl) return;
    renderStory(c.getContext('2d')!, {
      template: { ...tpl, stickers: [0, 0] },
      style: { templateId: tpl.id, palette: BUILTIN_PALETTES[0], backgroundIndex: 0, seed: 1 },
      fills: placeholderFills(tpl),
      images,
      t: 0,
      animate: false,
    });
  }, [tpl, images]);

  if (!tpl) return <div className="page muted">載入中…</div>;

  const selected = tpl.slots.find((s) => s.id === sel) ?? null;
  const bg = tpl.backgrounds[0];

  function updateSlot(id: string, patch: Partial<Slot>) {
    setTpl((t) => t && { ...t, slots: t.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function setMain(id: string) {
    setTpl((t) => t && { ...t, slots: t.slots.map((s) => ({ ...s, role: s.id === id ? 'main' : 'photo' })) });
  }

  function addSlot() {
    const s: Slot = { id: newId().slice(0, 8), role: tpl!.slots.length ? 'photo' : 'main', x: 340, y: 760, w: 400, h: 400, radius: 16 };
    setTpl((t) => t && { ...t, slots: [...t.slots, s] });
    setSel(s.id);
  }

  function removeSlot(id: string) {
    setTpl((t) => {
      if (!t) return t;
      const slots = t.slots.filter((s) => s.id !== id);
      if (slots.length && !slots.some((s) => s.role === 'main')) slots[0] = { ...slots[0], role: 'main' };
      return { ...t, slots };
    });
    setSel(null);
  }

  function moveLayer(id: string, dir: 1 | -1) {
    setTpl((t) => {
      if (!t) return t;
      const i = t.slots.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= t.slots.length) return t;
      const slots = t.slots.slice();
      [slots[i], slots[j]] = [slots[j], slots[i]];
      return { ...t, slots };
    });
  }

  async function onUpload(kind: 'bg' | 'overlay', file?: File) {
    if (!file) return;
    const id = await saveAsset(file, file.name);
    const src = `asset:${id}`;
    setTpl((t) => {
      if (!t) return t;
      if (kind === 'bg') return { ...t, backgrounds: [{ type: 'image', src }] };
      return { ...t, overlay: src };
    });
  }

  function onPointerDown(e: React.PointerEvent, slot: Slot, kind: Drag['kind']) {
    e.stopPropagation();
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    drag.current = { id: slot.id, kind, startX: e.clientX, startY: e.clientY, orig: { ...slot }, scale: CANVAS_W / rect.width };
    setSel(slot.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) * d.scale;
    const dy = (e.clientY - d.startY) * d.scale;
    if (d.kind === 'move') updateSlot(d.id, { x: Math.round(d.orig.x + dx), y: Math.round(d.orig.y + dy) });
    else updateSlot(d.id, { w: Math.max(80, Math.round(d.orig.w + dx)), h: Math.max(80, Math.round(d.orig.h + dy)) });
  }

  async function save() {
    if (!tpl) return;
    if (!tpl.slots.length) return setErr('至少要有一個格子');
    setSaving(true);
    try {
      await saveUserTemplate({ ...tpl, source: tpl.source === 'claude' ? 'claude' : 'user' });
      navigate('/templates');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="app">
      <TopBar title={mode === 'edit' ? '編輯版型' : '新版型'} back="/templates" right={<button className="icon-btn" onClick={save} disabled={saving}>儲存</button>} />
      <main className="page">
        {err && <p className="notice err">{err}</p>}
        <div className="field">
          <label htmlFor="tname">版型名稱</label>
          <input id="tname" className="input" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} />
        </div>

        <div
          ref={stageRef}
          className="editor-stage"
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onPointerDown={() => setSel(null)}
        >
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
          {tpl.slots.map((s, i) => (
            <div
              key={s.id}
              className={`editor-slot ${s.id === sel ? 'sel' : ''}`}
              style={{
                left: pct(s.x, CANVAS_W),
                top: pct(s.y, CANVAS_H),
                width: pct(s.w, CANVAS_W),
                height: pct(s.h, CANVAS_H),
                transform: `rotate(${s.rotate ?? 0}deg)`,
                borderRadius: s.shape === 'ellipse' ? '50%' : s.shape === 'arch' ? '999px 999px 0 0' : undefined,
              }}
              onPointerDown={(e) => onPointerDown(e, s, 'move')}
            >
              {s.role === 'main' ? '主格（影片）' : `照片 ${i + 1}`}
              {s.id === sel && <div className="handle" onPointerDown={(e) => onPointerDown(e, s, 'resize')} />}
            </div>
          ))}
        </div>
        <p className="muted small" style={{ textAlign: 'center' }}>拖動格子移動位置，拉右下角的圓點調整大小。</p>

        {selected && (
          <div className="card">
            <h2>選取的格子</h2>
            <div className="field">
              <label>用途</label>
              <div className="chips">
                <button className={`chip ${selected.role === 'main' ? 'on' : ''}`} onClick={() => setMain(selected.id)}>主格（短影片放影片）</button>
                <button className={`chip ${selected.role === 'photo' ? 'on' : ''}`} onClick={() => updateSlot(selected.id, { role: 'photo' })} disabled={selected.role === 'main'}>照片格</button>
              </div>
            </div>
            <div className="field">
              <label>形狀</label>
              <div className="chips">
                {([['rect', '方形'], ['ellipse', '圓形'], ['arch', '拱門']] as const).map(([v, label]) => (
                  <button key={v} className={`chip ${(selected.shape ?? 'rect') === v ? 'on' : ''}`} onClick={() => updateSlot(selected.id, { shape: v })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>旋轉 {selected.rotate ?? 0}°</label>
              <input className="range" type="range" min={-30} max={30} value={selected.rotate ?? 0} onChange={(e) => updateSlot(selected.id, { rotate: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>圓角 {selected.radius ?? 0}</label>
              <input className="range" type="range" min={0} max={200} value={selected.radius ?? 0} onChange={(e) => updateSlot(selected.id, { radius: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>白邊 {selected.frame?.width ?? 0}</label>
              <input
                className="range"
                type="range"
                min={0}
                max={60}
                value={selected.frame?.width ?? 0}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  updateSlot(selected.id, { frame: w ? { width: w, color: selected.frame?.color ?? '#ffffff', style: selected.frame?.style } : undefined });
                }}
              />
            </div>
            <div className="row">
              <label className="row small"><input type="checkbox" checked={selected.frame?.style === 'polaroid'} onChange={(e) => updateSlot(selected.id, { frame: { width: selected.frame?.width || 24, color: selected.frame?.color ?? '#ffffff', style: e.target.checked ? 'polaroid' : 'plain' } })} />拍立得</label>
              <label className="row small"><input type="checkbox" checked={!!selected.shadow} onChange={(e) => updateSlot(selected.id, { shadow: e.target.checked })} />陰影</label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small ghost" onClick={() => moveLayer(selected.id, -1)}>往下一層</button>
              <button className="btn small ghost" onClick={() => moveLayer(selected.id, 1)}>往上一層</button>
              <span className="spacer" />
              <button className="btn small danger" onClick={() => removeSlot(selected.id)}>刪除格子</button>
            </div>
          </div>
        )}

        <div className="card">
          <h2>版面</h2>
          <div className="stack">
            <button className="btn ghost" onClick={addSlot}>＋ 新增格子</button>
            <input ref={bgInput} className="hidden-input" type="file" accept="image/*" onChange={(e) => { onUpload('bg', e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn ghost" onClick={() => bgInput.current?.click()}>🖼️ 上傳背景圖</button>
            <input ref={ovInput} className="hidden-input" type="file" accept="image/png,image/*" onChange={(e) => { onUpload('overlay', e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn ghost" onClick={() => ovInput.current?.click()}>🪟 上傳邊框圖（透明 PNG，會蓋在照片上）</button>
            {tpl.overlay && <button className="btn small ghost" onClick={() => setTpl({ ...tpl, overlay: undefined })}>移除邊框圖</button>}
            <div className="row">
              <label className="small" htmlFor="bgc">背景顏色</label>
              <input
                id="bgc"
                type="color"
                value={bg.type === 'solid' && bg.color.startsWith('#') ? bg.color : '#ffffff'}
                onChange={(e) => setTpl({ ...tpl, backgrounds: [{ type: 'solid', color: e.target.value }] })}
              />
              {bg.type === 'image' && <span className="muted small">（目前使用背景圖，選顏色會改回純色）</span>}
            </div>
            <div className="field">
              <label>隨機小貼圖數量：最多 {tpl.stickers?.[1] ?? 0} 個</label>
              <input className="range" type="range" min={0} max={5} value={tpl.stickers?.[1] ?? 0} onChange={(e) => setTpl({ ...tpl, stickers: [0, Number(e.target.value)] })} />
            </div>
          </div>
        </div>
        <button className="btn primary block" onClick={save} disabled={saving}>💾 儲存版型</button>
      </main>
    </div>
  );
}
