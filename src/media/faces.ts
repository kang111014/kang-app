import type { FaceInfo } from './metrics';

/**
 * 人臉偵測（Google MediaPipe，在手機上執行）。
 * 偵測程式與模型放在這個網站裡（第一次使用時下載約 10MB，之後快取），照片本身不會離開手機。
 * 載入失敗就略過人臉分數，不影響其他功能。
 */
const WASM_BASE = `${location.origin}${import.meta.env.BASE_URL}vendor/mediapipe`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`;

type Detector = { detect(img: HTMLCanvasElement): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] } };

let detectorPromise: Promise<Detector | null> | null = null;

export function loadFaceDetector(): Promise<Detector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const det = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        });
        return det as unknown as Detector;
      } catch (e) {
        console.warn('人臉偵測載入失敗，略過', e);
        return null;
      }
    })();
  }
  return detectorPromise;
}

export async function detectFaces(canvas: HTMLCanvasElement): Promise<FaceInfo | null> {
  const det = await loadFaceDetector();
  if (!det) return null;
  try {
    const res = det.detect(canvas);
    const boxes = res.detections.map((d) => d.boundingBox).filter((b): b is NonNullable<typeof b> => !!b);
    if (!boxes.length) return { count: 0, cx: 0.5, cy: 0.5, area: 0 };
    const big = boxes.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    return {
      count: boxes.length,
      cx: (big.originX + big.width / 2) / canvas.width,
      cy: (big.originY + big.height / 2) / canvas.height,
      area: (big.width * big.height) / (canvas.width * canvas.height),
    };
  } catch {
    return null;
  }
}
