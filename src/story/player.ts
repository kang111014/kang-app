import { createVideoElement, seekVideo } from '../media/load';
import type { Composition } from './compose';
import { renderStory } from './render';
import type { Segment } from './timeline';

/**
 * 短影片播放器：把版型、照片輪播和影片畫到畫布上。
 * 預覽時只播放；輸出時同時用 MediaRecorder 把畫布錄成影片。
 */

export interface RecordOptions {
  music?: File | null;
  keepOriginalAudio: boolean;
  onProgress?: (ratio: number) => void;
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  ext: 'mp4' | 'webm';
}

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function canRecordVideo(): boolean {
  return !!pickRecorderMime() && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

interface LoadedSeg extends Segment {
  video: HTMLVideoElement;
  url: string;
}

export class StoryPlayer {
  private segs: LoadedSeg[] = [];
  private current: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  private host: HTMLDivElement;
  private ctx: CanvasRenderingContext2D;
  private c: Composition;

  constructor(private canvas: HTMLCanvasElement, composition: Composition) {
    this.c = composition;
    this.ctx = canvas.getContext('2d')!;
    // iPhone 上影片要放在頁面裡才會更新畫面，所以放一個看不見的容器
    this.host = document.createElement('div');
    this.host.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden;';
    document.body.appendChild(this.host);
  }

  async prepare() {
    for (const s of this.c.segments) {
      const item = this.c.videoItems.get(s.id);
      if (!item) continue;
      const url = URL.createObjectURL(item.file);
      const video = createVideoElement(url);
      video.style.width = '2px';
      video.style.height = '2px';
      this.host.appendChild(video);
      try {
        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= 1) return resolve();
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('影片讀取失敗'));
          setTimeout(resolve, 8000);
        });
        await seekVideo(video, s.start);
      } catch {
        // 讀不到的片段就用靜態畫面
      }
      this.segs.push({ ...s, video, url });
    }
    const main = this.c.fills[this.c.mainSlotId];
    if (main && this.segs.length) main.video = () => this.current;
  }

  private segAt(t: number): LoadedSeg | null {
    for (const s of this.segs) if (t >= s.at && t < s.at + s.length) return s;
    return null;
  }

  private draw(t: number) {
    renderStory(this.ctx, {
      template: this.c.template,
      style: this.c.style,
      fills: this.c.fills,
      images: this.c.images,
      blurSource: this.c.blurSource,
      t,
      animate: true,
    });
  }

  private switchTo(seg: LoadedSeg | null) {
    if (seg?.video === this.current) return;
    if (this.current) this.current.pause();
    this.current = seg?.video ?? null;
    if (this.current) {
      this.current.play().catch(() => {});
    }
  }

  private async resetVideos() {
    this.switchTo(null);
    await Promise.all(this.segs.map((s) => seekVideo(s.video, s.start).catch(() => {})));
  }

  /** 循環預覽（不錄影、不出聲） */
  async preview() {
    this.stop();
    await this.resetVideos();
    this.running = true;
    let t0 = performance.now();
    const loop = () => {
      if (!this.running) return;
      let t = (performance.now() - t0) / 1000;
      if (t >= this.c.duration) {
        t0 = performance.now();
        t = 0;
        this.resetVideos();
      }
      this.switchTo(this.segAt(t));
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /** 錄成影片。必須在使用者按按鈕後呼叫（手機才允許播放聲音） */
  async record(audioCtx: AudioContext, opts: RecordOptions): Promise<Recording> {
    this.stop();
    const mimeType = pickRecorderMime();
    if (!mimeType || typeof this.canvas.captureStream !== 'function') throw new Error('這個瀏覽器不支援錄製影片，請更新 iOS 或改用 Safari / Chrome');
    await this.resetVideos();

    const duration = this.c.duration;
    const fps = 30;
    const stream = this.canvas.captureStream(fps);
    const audioDest = audioCtx.createMediaStreamDestination();
    const hasAudio = await this.scheduleAudio(audioCtx, audioDest, opts, duration);
    if (hasAudio) audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

    // 錄影時不要讓螢幕自動關閉
    let wakeLock: { release(): Promise<void> } | null = null;
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null;
    } catch {
      wakeLock = null;
    }

    this.draw(0);
    recorder.start(1000);
    this.running = true;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const loop = () => {
        if (!this.running) return resolve();
        const t = (performance.now() - t0) / 1000;
        if (t >= duration) return resolve();
        this.switchTo(this.segAt(t));
        this.draw(t);
        opts.onProgress?.(t / duration);
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    });
    const cancelled = !this.running;
    this.running = false;
    this.switchTo(null);
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    wakeLock?.release().catch(() => {});
    if (cancelled) throw new Error('已取消');
    opts.onProgress?.(1);
    const type = mimeType.split(';')[0];
    return { blob: new Blob(chunks, { type }), mimeType: type, ext: type.includes('mp4') ? 'mp4' : 'webm' };
  }

  private async scheduleAudio(ctx: AudioContext, dest: MediaStreamAudioDestinationNode, opts: RecordOptions, duration: number): Promise<boolean> {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const master = ctx.createGain();
    master.connect(dest);
    master.connect(ctx.destination); // 錄影時也讓使用者聽得到
    const start = ctx.currentTime + 0.05;
    let any = false;

    if (opts.music) {
      try {
        const buf = await ctx.decodeAudioData(await opts.music.arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = buf.duration < duration;
        const g = ctx.createGain();
        const vol = opts.keepOriginalAudio ? 0.6 : 0.9;
        g.gain.setValueAtTime(vol, start);
        const fadeStart = Math.max(start, start + duration - 1.5);
        g.gain.setValueAtTime(vol, fadeStart);
        g.gain.linearRampToValueAtTime(0.0001, start + duration);
        src.connect(g).connect(master);
        src.start(start);
        src.stop(start + duration + 0.1);
        any = true;
      } catch {
        throw new Error('音樂檔讀取失敗，請換一個音檔（mp3、m4a 都可以）');
      }
    }

    if (opts.keepOriginalAudio) {
      for (const s of this.segs) {
        const item = this.c.videoItems.get(s.id);
        if (!item || item.file.size > 400 * 1024 * 1024) continue;
        try {
          const buf = await ctx.decodeAudioData(await item.file.arrayBuffer());
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          g.gain.value = opts.music ? 0.8 : 1;
          src.connect(g).connect(master);
          src.start(start + s.at, s.start, s.length);
          any = true;
        } catch {
          // 這段影片沒有聲音或格式不支援
        }
      }
    }
    return any;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.switchTo(null);
  }

  destroy() {
    this.stop();
    for (const s of this.segs) {
      s.video.removeAttribute('src');
      s.video.load();
      URL.revokeObjectURL(s.url);
    }
    this.segs = [];
    this.host.remove();
    const main = this.c.fills[this.c.mainSlotId];
    if (main) main.video = undefined;
  }
}
