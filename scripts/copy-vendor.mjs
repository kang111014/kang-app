// 把人臉偵測與 FFmpeg 的 WebAssembly 檔複製到 public/vendor/，
// 讓網站自己提供這些檔案，不依賴外部 CDN。（public/vendor 不進版控，每次建置時產生）
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');

const files = [
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'mediapipe/vision_wasm_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'mediapipe/vision_wasm_internal.wasm'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js', 'mediapipe/vision_wasm_nosimd_internal.js'],
  ['node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm', 'mediapipe/vision_wasm_nosimd_internal.wasm'],
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'ffmpeg/ffmpeg-core.js'],
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'ffmpeg/ffmpeg-core.wasm'],
];

for (const [from, to] of files) {
  const src = join(root, from);
  const dst = join(out, to);
  if (!existsSync(src)) throw new Error(`找不到 ${from}，請先執行 npm install`);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}
console.log('vendor 檔案已複製到 public/vendor');
