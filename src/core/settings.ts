import { useEffect, useState } from 'react';
import { kvGet, kvSet } from './db';

/** 使用者設定與金鑰，全部只存在這支手機裡 */
export interface Settings {
  unsplashKey: string;
  pexelsKey: string;
  claudeKey: string;
  /** 允許上網下載素材（圖庫背景、配色、貼圖）。只下載、不上傳。 */
  useOnline: boolean;
  /** 短影片保留影片原本的聲音 */
  keepOriginalAudio: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  unsplashKey: '',
  pexelsKey: '',
  claudeKey: '',
  useOnline: true,
  keepOriginalAudio: false,
};

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export async function getSettings(): Promise<Settings> {
  if (!cache) cache = { ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>('settings', {})) };
  return cache;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  cache = next;
  await kvSet('settings', next);
  listeners.forEach((l) => l(next));
  return next;
}

export function useSettings(): Settings | null {
  const [s, setS] = useState<Settings | null>(cache);
  useEffect(() => {
    getSettings().then(setS);
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
