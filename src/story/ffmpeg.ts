/**
 * 用 FFmpeg（WebAssembly 版）把影片轉成 iPhone 相簿與 IG 都吃的標準 MP4。
 * 使用單執行緒版本，因為 GitHub Pages 不能設定多執行緒需要的安全標頭。
 * 轉檔程式放在這個網站裡，第一次使用會下載約 30MB（之後會快取），影片本身不會上傳。
 */
const CORE_BASE = `${location.origin}${import.meta.env.BASE_URL}vendor/ffmpeg`;

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
let instance: Promise<FFmpegInstance> | null = null;

async function getFFmpeg(onStatus?: (s: string) => void): Promise<FFmpegInstance> {
  if (!instance) {
    instance = (async () => {
      onStatus?.('下載轉檔程式中（第一次約 30MB）…');
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })();
    instance.catch(() => (instance = null));
  }
  return instance;
}

export async function convertToMp4(input: Blob, inputExt: string, onProgress?: (ratio: number) => void, onStatus?: (s: string) => void): Promise<Blob> {
  const ff = await getFFmpeg(onStatus);
  const { fetchFile } = await import('@ffmpeg/util');
  const inName = `in.${inputExt}`;
  const outName = 'out.mp4';
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on('progress', handler);
  try {
    onStatus?.('轉檔中…手機上可能需要幾分鐘，請保持畫面開啟');
    await ff.writeFile(inName, await fetchFile(input));
    const code = await ff.exec([
      '-i', inName,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      outName,
    ]);
    if (code !== 0) throw new Error('轉檔失敗');
    const data = (await ff.readFile(outName)) as Uint8Array;
    return new Blob([data.slice().buffer], { type: 'video/mp4' });
  } finally {
    ff.off('progress', handler);
    ff.deleteFile(inName).catch(() => {});
    ff.deleteFile(outName).catch(() => {});
  }
}
