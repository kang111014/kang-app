import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '../../components/TopBar';
import { kvGet } from '../../core/db';
import { navigate } from '../../core/router';
import { useSettings } from '../../core/settings';
import { shareFile, timestampName } from '../../core/share';
import { analyzeFiles, type MediaItem } from '../../media/load';
import { autoSelect, type RejectReason } from '../../media/select';
import { buildComposition, forgetFullImages, type Composition, type OutputMode } from '../../story/compose';
import { convertToMp4 } from '../../story/ffmpeg';
import { exportPhoto } from '../../story/photoExport';
import { canRecordVideo, StoryPlayer } from '../../story/player';
import { renderStory } from '../../story/render';
import { enrichStyleOnline, randomStyle } from '../../story/style';
import { DISABLED_KEY, listAllTemplates } from '../../story/templates';
import { MAX_SECONDS } from '../../story/timeline';
import { CANVAS_H, CANVAS_W, type StoryTemplate } from '../../story/types';
import MediaGrid from './MediaGrid';

type Step = 'mode' | 'pick' | 'result';

const REASON_TEXT: Record<RejectReason, string> = {
  similar: '相似連拍',
  blurry: '有點模糊',
  dark: '太暗',
  bright: '太亮',
  extra: '數量已滿',
};

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      resolve(isFinite(a.duration) ? a.duration : 0);
      URL.revokeObjectURL(url);
    };
    a.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    a.src = url;
  });
}

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} 秒`;
}

export default function StoryPage() {
  const settings = useSettings();
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<OutputMode>('photo');

  // 素材
  const [items, setItems] = useState<MediaItem[]>([]);
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [music, setMusic] = useState<File | null>(null);
  const [musicSeconds, setMusicSeconds] = useState(0);

  // 成品
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [lockedTemplate, setLockedTemplate] = useState<string>('');
  const [comp, setComp] = useState<Composition | null>(null);
  const [credit, setCredit] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<StoryPlayer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const disabled = await kvGet<string[]>(DISABLED_KEY, []);
      const all = await listAllTemplates();
      const enabled = all.filter((t) => !disabled.includes(t.id));
      setTemplates(enabled.length ? enabled : all);
    })();
  }, []);

  const selection = useMemo(
    () =>
      autoSelect(
        items.map((i) => ({ id: i.id, kind: i.kind, hash: i.hash, score: i.score, hasFace: !!i.faces?.count })),
        12,
      ),
    [items],
  );
  const isPicked = useCallback((id: string) => overrides[id] ?? selection.picked.includes(id), [overrides, selection]);
  const picked = useMemo(() => items.filter((i) => isPicked(i.id)), [items, isPicked]);
  const pickedVideos = picked.filter((i) => i.kind === 'video');
  const videoTotal = pickedVideos.reduce((s, v) => s + (v.duration ?? 0), 0);

  async function onFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setError(null);
    const files = Array.from(list).slice(0, 60);
    setAnalyzing({ done: 0, total: files.length });
    const { items: analyzed, failed: bad } = await analyzeFiles(files, (done, total) => setAnalyzing({ done, total }));
    setItems((prev) => [...prev, ...analyzed]);
    setFailed(bad);
    setAnalyzing(null);
  }

  async function onMusic(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setMusic(f);
    setMusicSeconds(await audioDuration(f));
  }

  function toggle(id: string) {
    setOverrides((o) => ({ ...o, [id]: !isPicked(id) }));
  }

  const generate = useCallback(
    async (opts: { keepTemplate?: boolean } = {}) => {
      if (!settings || !templates.length || !picked.length) return;
      setBusy('排版中…');
      setError(null);
      setResult(null);
      try {
        const photoCount = mode === 'video' && pickedVideos.length ? picked.length - pickedVideos.length : picked.length;
        const lockId = opts.keepTemplate ? comp?.template.id : lockedTemplate || undefined;
        const { style, template } = await randomStyle({
          templates,
          photoCount,
          lockTemplateId: lockId,
          previousTemplateId: comp?.template.id,
          settings,
        });
        setBusy('準備素材中…');
        const enriched = await enrichStyleOnline(style, template, settings);
        const next = await buildComposition(picked, mode, template, enriched.style, musicSeconds || undefined);
        forgetFullImages(new Set(picked.map((p) => p.id)));
        setCredit(enriched.credit);
        setComp(next);
      } catch (e) {
        setError((e as Error).message || '產生失敗，請再試一次');
      } finally {
        setBusy(null);
      }
    },
    [settings, templates, picked, pickedVideos.length, mode, comp, lockedTemplate, musicSeconds],
  );

  // 預覽
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!comp || !canvas || step !== 'result') return;
    if (comp.mode === 'photo') {
      renderStory(canvas.getContext('2d')!, {
        template: comp.template,
        style: comp.style,
        fills: comp.fills,
        images: comp.images,
        blurSource: comp.blurSource,
        t: 0,
        animate: false,
      });
      return;
    }
    const player = new StoryPlayer(canvas, comp);
    playerRef.current = player;
    let alive = true;
    player.prepare().then(() => {
      if (alive) player.preview();
    });
    return () => {
      alive = false;
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [comp, step]);

  async function goResult() {
    setStep('result');
    await generate();
  }

  async function doExport() {
    if (!comp) return;
    setError(null);
    setResult(null);
    if (comp.mode === 'photo') {
      setBusy('輸出圖片中…');
      try {
        const file = await exportPhoto(comp);
        setResult({ file, url: URL.createObjectURL(file) });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    // AudioContext 必須在按鈕被按下的當下建立，手機才允許出聲
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new Ctx();
    audioCtx.resume().catch(() => {});
    setExportProgress(0);
    try {
      const rec = await player.record(audioCtx, {
        music,
        keepOriginalAudio: settings?.keepOriginalAudio ?? false,
        onProgress: setExportProgress,
      });
      const file = new File([rec.blob], timestampName('story', rec.ext), { type: rec.mimeType });
      setResult({ file, url: URL.createObjectURL(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportProgress(null);
      audioCtx.close().catch(() => {});
      player.preview();
    }
  }

  async function doConvert() {
    if (!result) return;
    setError(null);
    setExportProgress(0);
    try {
      const ext = result.file.name.split('.').pop() || 'webm';
      const mp4 = await convertToMp4(result.file, ext, setExportProgress, setBusy);
      const file = new File([mp4], result.file.name.replace(/\.\w+$/, '.mp4'), { type: 'video/mp4' });
      setResult({ file, url: URL.createObjectURL(file) });
    } catch (e) {
      setError('轉檔失敗：' + ((e as Error).message || '請再試一次'));
    } finally {
      setExportProgress(null);
      setBusy(null);
    }
  }

  async function doShare() {
    if (!result) return;
    const r = await shareFile(result.file);
    if (r === 'downloaded') setError(null);
  }

  // ---------- 畫面 ----------

  if (step === 'mode') {
    return (
      <div className="app">
        <TopBar title="限時動態產生器" />
        <main className="page">
          <div className="card">
            <h2>這次要做哪一種？</h2>
            <p className="muted">尺寸都是 9:16，可以直接發 IG 限時動態。</p>
            <div className="choice-grid">
              <button className={`choice ${mode === 'photo' ? 'on' : ''}`} onClick={() => setMode('photo')}>
                <span className="emoji">🖼️</span>
                <b>拼貼照片</b>
                <span className="muted small">多張照片排成一張圖</span>
              </button>
              <button className={`choice ${mode === 'video' ? 'on' : ''}`} onClick={() => setMode('video')}>
                <span className="emoji">🎬</span>
                <b>短影片</b>
                <span className="muted small">影片在格子裡播放，周圍是照片拼貼（最長 60 秒）</span>
              </button>
            </div>
          </div>
          {mode === 'video' && !canRecordVideo() && (
            <div className="notice err">這個瀏覽器不支援錄製影片。請把 iPhone 更新到 iOS 16 以上，並用 Safari 開啟。</div>
          )}
          <button className="btn primary block" onClick={() => setStep('pick')}>
            下一步：選照片和影片
          </button>
        </main>
      </div>
    );
  }

  if (step === 'pick') {
    const rejectedCount = items.filter((i) => !isPicked(i.id)).length;
    return (
      <div className="app">
        <TopBar title={mode === 'photo' ? '拼貼照片：選素材' : '短影片：選素材'} back={null} right={<button className="icon-btn" onClick={() => setStep('mode')}>‹ 上一步</button>} />
        <main className="page">
          <div className="card">
            <h2>從相簿選照片和影片</h2>
            <p className="muted small">可以一次選很多張，App 會依清晰度、亮度、有沒有人臉、相似連拍自動挑選。全部在手機上處理，不會上傳。</p>
            <input ref={fileInput} className="hidden-input" type="file" accept="image/*,video/*" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
            <button className="btn primary block" onClick={() => fileInput.current?.click()} disabled={!!analyzing}>
              {items.length ? '＋ 再加一些' : '📷 選擇照片／影片'}
            </button>
            {analyzing && (
              <div className="stack" style={{ marginTop: 12 }}>
                <span className="muted small">
                  分析中 {analyzing.done}/{analyzing.total}…（第一次會下載人臉偵測模型）
                </span>
                <div className="progress"><div style={{ width: `${(analyzing.done / analyzing.total) * 100}%` }} /></div>
              </div>
            )}
            {failed.length > 0 && <p className="notice err small">有 {failed.length} 個檔案讀不到，已略過：{failed.slice(0, 3).join('、')}</p>}
          </div>

          {items.length > 0 && (
            <div className="card">
              <div className="row">
                <h2 style={{ margin: 0 }}>已挑選 {picked.length} 個</h2>
                <span className="spacer" />
                {rejectedCount > 0 && <span className="muted small">排除 {rejectedCount} 個</span>}
              </div>
              <p className="muted small">打勾的會用上。點一下可以手動加入或排除。</p>
              <MediaGrid items={items} isPicked={isPicked} onToggle={toggle} reasonOf={(id) => (selection.rejected[id] ? REASON_TEXT[selection.rejected[id]] : undefined)} />
              {mode === 'video' && (
                <p className="muted small" style={{ marginTop: 8 }}>
                  {pickedVideos.length === 0
                    ? '沒有選影片的話，會做成照片輪播的短影片。'
                    : videoTotal > MAX_SECONDS
                      ? `影片共 ${fmtSec(videoTotal)}，超過 60 秒，會自動剪出每段的精華接在一起。`
                      : `影片共 ${fmtSec(videoTotal)}，會依序接著播放。`}
                </p>
              )}
            </div>
          )}

          {mode === 'video' && (
            <div className="card">
              <h2>🎵 背景音樂（選填）</h2>
              <p className="muted small">選手機「檔案」App 裡的音檔（mp3、m4a）。Apple Music 下載的歌有版權保護，沒辦法使用。</p>
              <input ref={musicInput} className="hidden-input" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav" onChange={(e) => { onMusic(e.target.files); e.target.value = ''; }} />
              <div className="row">
                <button className="btn ghost" onClick={() => musicInput.current?.click()}>{music ? '換一首' : '選擇音檔'}</button>
                {music && (
                  <>
                    <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{music.name}</span>
                    <button className="btn small ghost" onClick={() => { setMusic(null); setMusicSeconds(0); }}>移除</button>
                  </>
                )}
              </div>
            </div>
          )}

          <button className="btn primary block" disabled={!picked.length || !!analyzing || !templates.length} onClick={goResult}>
            ✨ 開始排版
          </button>
        </main>
      </div>
    );
  }

  // result
  return (
    <div className="app">
      <TopBar title="成品預覽" back={null} right={<button className="icon-btn" onClick={() => { setStep('pick'); setResult(null); }}>‹ 改素材</button>} />
      <main className="page">
        <div className="preview-wrap">
          <canvas ref={canvasRef} className="preview-canvas" width={CANVAS_W} height={CANVAS_H} />
        </div>
        <p className="muted small" style={{ textAlign: 'center', margin: '8px 0' }}>
          {comp ? `版型：${comp.template.name}` : ''}
          {comp?.mode === 'video' ? ` · ${fmtSec(comp.duration)}` : ''}
          {credit ? ` · 背景：${credit}` : ''}
        </p>
        {busy && <p className="notice">{busy}</p>}
        {error && <p className="notice err">{error}</p>}

        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => generate()} disabled={!!busy || exportProgress !== null}>
            🎲 換一個
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => generate({ keepTemplate: true })} disabled={!!busy || exportProgress !== null}>
            🎨 只換配色
          </button>
        </div>
        <div className="field">
          <label htmlFor="tpl">版型</label>
          <select id="tpl" className="input" value={lockedTemplate} onChange={(e) => setLockedTemplate(e.target.value)}>
            <option value="">隨機（每次換一個）</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="card">
          {exportProgress !== null ? (
            <div className="stack">
              <span className="small">{comp?.mode === 'video' && !busy ? '錄製中，請保持畫面開啟、不要切換 App…' : busy ?? '處理中…'}</span>
              <div className="progress"><div style={{ width: `${Math.round(exportProgress * 100)}%` }} /></div>
            </div>
          ) : !result ? (
            <button className="btn primary block" onClick={doExport} disabled={!comp || !!busy}>
              {comp?.mode === 'video' ? `🎬 輸出短影片（約需 ${fmtSec(comp.duration)}）` : '🖼️ 輸出圖片'}
            </button>
          ) : (
            <div className="stack">
              {result.file.type.startsWith('video') ? (
                <video src={result.url} controls playsInline style={{ width: '100%', borderRadius: 12 }} />
              ) : (
                <img src={result.url} alt="成品" style={{ width: '100%', borderRadius: 12 }} />
              )}
              <button className="btn primary block" onClick={doShare}>
                📥 存到相簿／分享
              </button>
              <p className="muted small">分享選單裡選「儲存影像」或「儲存影片」就會存進相簿，再到 IG 發佈限時動態。</p>
              {result.file.type.startsWith('video') && (
                <button className="btn ghost block" onClick={doConvert} disabled={!!busy}>
                  {result.file.name.endsWith('.mp4') ? '存不進相簿嗎？轉成標準 MP4' : '轉成 MP4（iPhone 相簿與 IG 較相容）'}
                </button>
              )}
              <button className="btn ghost block" onClick={() => setResult(null)}>重新輸出</button>
            </div>
          )}
        </div>
        <button className="btn ghost block" onClick={() => navigate('/templates')}>🧩 管理版型</button>
      </main>
    </div>
  );
}
